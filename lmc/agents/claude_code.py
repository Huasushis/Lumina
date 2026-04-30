"""Claude Code CLI agent — invokes `claude` as a subprocess.
Supports GENERATE + TEST capabilities.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

from lmc.agents.base import (
    AgentBackend,
    AgentCapability,
    AgentError,
    AgentResponseError,
    AgentTimeoutError,
    GeneratedFile,
    GeneratedFiles,
    TestResult,
)
from lmc.config import AgentConfig


class ClaudeCodeAgent(AgentBackend):
    """Code generation via Claude Code CLI subprocess."""

    name = "claude_code"
    capabilities = {AgentCapability.GENERATE, AgentCapability.TEST}

    def __init__(self, config: AgentConfig):
        self._cli = config.cli_path
        self._timeout = config.claude_timeout

    def generate(self, prompt: str, work_dir: Path) -> GeneratedFiles:
        work_dir.mkdir(parents=True, exist_ok=True)

        # Write prompt to a file for Claude Code to read
        prompt_file = work_dir / "LUMINA_TASK.md"
        prompt_file.write_text(prompt, encoding="utf-8")

        # Write a minimal CLAUDE.md instructing Claude Code how to respond
        claude_md = work_dir / "CLAUDE.md"
        claude_md.write_text(
            "Read LUMINA_TASK.md. Generate the requested code files. "
            "After generating all files, output exactly one JSON block "
            'wrapped in ```json fences with the format: '
            '{"task_id":"...","files":[{"path":"...","content":"..."}]}. '
            "Write real code, not placeholders.\n",
            encoding="utf-8",
        )

        try:
            result = subprocess.run(
                [self._cli, "-p", prompt, "--output-format", "text"],
                cwd=str(work_dir),
                capture_output=True,
                text=True,
                timeout=self._timeout,
                env={**os.environ, "CLAUDE_CODE_HEADLESS": "1"},
            )
        except subprocess.TimeoutExpired:
            raise AgentTimeoutError(
                f"Claude Code timed out after {self._cfg.timeout}s "
                f"for task in {work_dir}")

        if result.returncode != 0:
            raise AgentError(
                f"Claude Code exited with code {result.returncode}: "
                f"{result.stderr[:500]}")

        return _parse_claude_output(result.stdout, result.stderr)

    def _run_tests(self, task_id: str, files: GeneratedFiles,
                   work_dir: Path) -> TestResult:
        """Generate and run tests for the generated code."""
        test_prompt = (
            f"You just implemented module {task_id}. The generated files "
            f"are in the workspace. Write a comprehensive test suite that "
            f"sends valid JSON messages to invoke() and verifies outputs. "
            f"Run the tests and report results.\n\n"
            f"Output a JSON block with format:\n"
            f'{{"test_result": {{"passed": true/false, '
            f'"output": "<test output>", "coverage": null}}}}\n'
        )

        try:
            result = subprocess.run(
                [self._cli, "-p", test_prompt, "--output-format", "text"],
                cwd=str(work_dir),
                capture_output=True,
                text=True,
                timeout=self._timeout,
                env={**os.environ, "CLAUDE_CODE_HEADLESS": "1"},
            )
        except subprocess.TimeoutExpired:
            return TestResult(
                passed=False,
                output=f"Test generation timed out after {self._cfg.timeout}s",
            )

        output = result.stdout + result.stderr
        return _parse_test_result(output, task_id)


def _parse_claude_output(stdout: str, stderr: str) -> GeneratedFiles:
    """Extract the JSON response from Claude Code's output."""
    combined = stdout + "\n" + stderr

    # Find JSON block
    json_start = combined.find("```json")
    if json_start == -1:
        json_start = combined.find("{")
    else:
        json_start = combined.find("{", json_start)

    if json_start == -1:
        raise AgentResponseError(
            "No JSON found in Claude Code output.\n"
            f"Output: {combined[:1000]}")

    json_end = combined.rfind("}")
    if json_end == -1:
        raise AgentResponseError("No closing brace in Claude Code output.")

    json_str = combined[json_start:json_end + 1]

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise AgentResponseError(
            f"Failed to parse Claude Code JSON: {e}\n"
            f"Raw: {json_str[:500]}")

    files = [
        GeneratedFile(path=f["path"], content=f["content"])
        for f in data.get("files", [])
    ]
    return GeneratedFiles(
        task_id=data.get("task_id", "unknown"),
        files=files,
        metadata={"agent": "claude_code"},
    )


def _parse_test_result(output: str, task_id: str) -> TestResult:
    """Parse test result from Claude Code output."""
    json_start = output.find("```json")
    if json_start == -1:
        json_start = output.find("{")
    else:
        json_start = output.find("{", json_start)

    if json_start == -1:
        return TestResult(passed=False, output=output[:2000])

    json_end = output.rfind("}")
    try:
        data = json.loads(output[json_start:json_end + 1])
        tr = data.get("test_result", {})
        return TestResult(
            passed=tr.get("passed", False),
            output=tr.get("output", output[:2000]),
            coverage=tr.get("coverage"),
        )
    except (json.JSONDecodeError, KeyError):
        return TestResult(passed=False, output=output[:2000])
