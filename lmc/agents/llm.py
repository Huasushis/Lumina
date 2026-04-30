"""Pure LLM agent — generates code via OpenAI-compatible API.
Does NOT support testing (AgentCapability.GENERATE only).
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from lmc.agents.base import (
    AgentBackend,
    AgentCapability,
    AgentError,
    AgentResponseError,
    AgentTimeoutError,
    GeneratedFile,
    GeneratedFiles,
)
from lmc.config import AgentLLMConfig


class LLMAgent(AgentBackend):
    """Code generation via OpenAI-compatible REST API."""

    name = "llm"
    capabilities = {AgentCapability.GENERATE}

    def __init__(self, config: AgentLLMConfig):
        self._cfg = config
        self._client = httpx.Client(
            base_url=config.api_base.rstrip("/"),
            timeout=config.request_timeout,
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type": "application/json",
            },
        )

    def generate(self, prompt: str, work_dir: Path) -> GeneratedFiles:
        system, user = _split_system_user(prompt)

        for attempt in range(self._cfg.max_retries):
            try:
                resp = self._client.post("/chat/completions", json={
                    "model": self._cfg.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "max_tokens": self._cfg.max_tokens,
                    "temperature": self._cfg.temperature,
                })
                resp.raise_for_status()
            except httpx.TimeoutException:
                if attempt == self._cfg.max_retries - 1:
                    raise AgentTimeoutError(
                        f"LLM request timed out after "
                        f"{self._cfg.request_timeout}s")
                continue
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (401, 403):
                    raise AgentError(
                        f"Authentication failed. Check your API key.") from e
                if attempt == self._cfg.max_retries - 1:
                    raise AgentError(
                        f"LLM API error: {e.response.status_code} "
                        f"{e.response.text[:200]}") from e
                continue

            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return _parse_llm_response(content)

        raise AgentError("Max retries exceeded")

    def test(self, task_id: str, files: GeneratedFiles,
             work_dir: Path) -> None:
        """Pure LLM does not support testing — always returns None."""
        return None


def _split_system_user(prompt: str) -> tuple[str, str]:
    """Split a prompt into system and user parts.
    If prompt starts with [SYSTEM], split there.
    Otherwise, use a default system message."""
    if "[SYSTEM]" in prompt:
        parts = prompt.split("[SYSTEM]", 1)
        rest = parts[1] if len(parts) > 1 else prompt
        if "[USER]" in rest:
            sys_part, user_part = rest.split("[USER]", 1)
            return sys_part.strip(), user_part.strip()
        return rest.strip(), ""
    return (
        "You are a code generation agent for the Lumina Actor Model framework.",
        prompt,
    )


def _parse_llm_response(content: str) -> GeneratedFiles:
    """Parse the LLM's JSON response into GeneratedFiles."""
    content = content.strip()
    # Handle markdown code fences
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise AgentResponseError(
            f"Failed to parse LLM response as JSON: {e}\n"
            f"Response: {content[:500]}")

    files_data = data.get("files", [])
    files = [
        GeneratedFile(path=f["path"], content=f["content"])
        for f in files_data
    ]

    return GeneratedFiles(
        task_id=data.get("task_id", "unknown"),
        files=files,
        metadata={
            "model": data.get("model", "unknown"),
            "usage": data.get("usage", {}),
        },
    )
