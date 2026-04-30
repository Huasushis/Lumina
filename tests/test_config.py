"""Tests for agent config and project manifest."""

import os
from pathlib import Path

import pytest

from lmc.config import AgentConfig, get_agent_config
from lmc.project import LuminaManifest, find_project_root, init_project, parse_manifest


def test_agent_config_defaults():
    cfg = get_agent_config()
    assert cfg.type == "llm"
    assert cfg.model == "gpt-4o"


def test_agent_config_from_env(monkeypatch):
    monkeypatch.setenv("LUMINA_AGENT", "claude_code")
    monkeypatch.setenv("LUMINA_MODEL", "claude-sonnet-4-20250514")
    cfg = get_agent_config()
    assert cfg.type == "claude_code"
    assert cfg.model == "claude-sonnet-4-20250514"


def test_parse_manifest(tmp_path):
    toml = tmp_path / "Lumina.toml"
    toml.write_text("""\
[project]
name = "test-project"
language = "python"

[build]
mode = "microservice"

[modules.Sorter]
test = true
""", encoding="utf-8")
    m = parse_manifest(toml)
    assert m.name == "test-project"
    assert m.build.mode == "microservice"
    assert m.modules["Sorter"].test is True


def test_init_project(tmp_path):
    root = init_project("hello", tmp_path)
    assert (root / "Lumina.toml").exists()
    assert (root / "src" / "main.lm").exists()
    assert (root / "src" / "types.lm").exists()
    assert (root / ".gitignore").exists()
    m = parse_manifest(root / "Lumina.toml")
    assert m.name == "hello"


def test_find_project_root(tmp_path):
    root = init_project("myproj", tmp_path)
    # From project root
    assert find_project_root(root) == root
    # From src subdir
    assert find_project_root(root / "src") == root
    # From outside
    assert find_project_root(tmp_path) is None


def test_init_existing_fails(tmp_path):
    init_project("first", tmp_path)
    with pytest.raises(FileExistsError):
        init_project("first", tmp_path)
