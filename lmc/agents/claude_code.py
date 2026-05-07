"""Claude Code CLI agent — invokes `claude` as a subprocess.
Supports GENERATE + TEST capabilities.
"""

from __future__ import annotations

import json
import os
import subprocess
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

        prompt_file = work_dir / "LUMINA_TASK.md"
        prompt_file.write_text(prompt, encoding="utf-8")

        claude_md = work_dir / "CLAUDE.md"
        claude_md.write_text(
            "Read LUMINA_TASK.md. Generate the requested code files. "
            "After generating all files, output exactly one JSON block "
            'wrapped in ```json fences with the format: '
            '{"task_id":"...","files":[{"path":"...","content":"..."}]}. '
            "Write real code, not placeholders.\n",
            encoding="utf-8",
        )

        return self._run_claude(prompt, work_dir)

    def _run_tests(self, task_id: str, files: GeneratedFiles,
                   work_dir: Path) -> TestResult:
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
            result = self._run_claude(test_prompt, work_dir)
        except AgentError:
            return TestResult(passed=False, output="Test generation failed")

        return _parse_test_result(result)

    def _run_claude(self, prompt: str, work_dir: Path) -> GeneratedFiles:
        """Invoke Claude Code CLI with proper encoding and error handling."""
        # Ensure UTF-8 on Windows; Claude Code outputs UTF-8
        env = {**os.environ, "PYTHONUTF8": "1", "CLAUDE_CODE_HEADLESS": "1"}

        try:
            result = subprocess.run(
                [self._cli, "-p", prompt, "--output-format", "text",
                 "--dangerously-skip-permissions"],
                cwd=str(work_dir),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self._timeout,
                env=env,
            )
        except FileNotFoundError:
            raise AgentError(
                f"Claude Code CLI not found at '{self._cli}'.\n"
                f"Install it: npm install -g @anthropic-ai/claude-code\n"
                f"Or set CLAUDE_CODE_PATH to the full path of the claude binary."
            )
        except subprocess.TimeoutExpired:
            raise AgentTimeoutError(
                f"Claude Code timed out after {self._timeout}s "
                f"for task in {work_dir}")

        if result.returncode != 0:
            stderr = result.stderr or ""
            raise AgentError(
                f"Claude Code exited with code {result.returncode}.\n"
                f"{stderr[:800]}")

        return _parse_claude_output(result.stdout + "\n" + (result.stderr or ""))


def _extract_fenced_json(text: str) -> str | None:
    """Extract JSON from a ```json ... ``` fenced block."""
    start = text.find("```json")
    if start == -1:
        return None
    start = text.find("{", start)
    if start == -1:
        return None
    end = text.find("```", start)
    if end == -1:
        return None
    return text[start:end].strip()


def _parse_claude_output(combined: str) -> GeneratedFiles:
    # Try extracting JSON from ```json fence first
    json_str = _extract_fenced_json(combined)

    if json_str is None:
        # Fallback: find first { and last }
        json_start = combined.find("{")
        json_end = combined.rfind("}")
        if json_start == -1 or json_end == -1:
            raise AgentResponseError(
                "No JSON found in Claude Code output.\n"
                f"Output: {combined[:1000]}")
        json_str = combined[json_start:json_end + 1]

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise AgentResponseError(
            f"Failed to parse Claude Code JSON: {e}\n"
            f"Raw: {json_str[:800]}")

    files = [
        GeneratedFile(path=f["path"], content=f["content"])
        for f in data.get("files", [])
    ]
    return GeneratedFiles(
        task_id=data.get("task_id", "unknown"),
        files=files,
        metadata={"agent": "claude_code"},
    )


def _parse_test_result(output: str) -> TestResult:
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
