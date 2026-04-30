"""Minimal agent configuration — resolved from environment variables.

Agent config is NOT stored in the project manifest (Lumina.toml).
It comes from the environment — just like you don't store your compiler
path or API keys in Cargo.toml.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class AgentConfig:
    """Resolved agent configuration."""
    type: str = "llm"  # "llm" | "claude_code"

    # LLM settings
    api_base: str = "https://api.openai.com/v1"
    api_key: str = ""
    model: str = "gpt-4o"
    max_tokens: int = 8192
    temperature: float = 0.0
    request_timeout: int = 120
    max_retries: int = 3

    # Claude Code settings
    cli_path: str = "claude"
    claude_timeout: int = 600


def get_agent_config() -> AgentConfig:
    """Resolve agent configuration from environment variables."""
    return AgentConfig(
        type=os.environ.get("LUMINA_AGENT", "llm"),
        api_base=os.environ.get(
            "LUMINA_API_BASE", os.environ.get("OPENAI_API_BASE",
                                               "https://api.openai.com/v1")),
        api_key=os.environ.get(
            "LUMINA_API_KEY", os.environ.get("OPENAI_API_KEY", "")),
        model=os.environ.get("LUMINA_MODEL", os.environ.get("OPENAI_MODEL",
                                                             "gpt-4o")),
        max_tokens=int(os.environ.get("LUMINA_MAX_TOKENS", "8192")),
        temperature=float(os.environ.get("LUMINA_TEMPERATURE", "0.0")),
        request_timeout=int(os.environ.get("LUMINA_TIMEOUT", "120")),
        max_retries=int(os.environ.get("LUMINA_MAX_RETRIES", "3")),
        cli_path=os.environ.get("CLAUDE_CODE_PATH", "claude"),
        claude_timeout=int(os.environ.get("LUMINA_CLAUDE_TIMEOUT", "600")),
    )
