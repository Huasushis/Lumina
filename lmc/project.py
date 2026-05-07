"""Project manifest and scaffolding — Cargo-like conventions.

A Lumina project is a directory containing:
  Lumina.toml    — project manifest
  src/           — .lumina source files (main.lumina is the entry point)
  .lumina/       — build cache + generated output (gitignored)
  .gitignore     — auto-generated on init
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib


# ── Manifest ───────────────────────────────────────────────────


@dataclass
class ModuleOverride:
    test: bool = False  # enable auto-test for this module


@dataclass
class BuildSection:
    mode: str = "monolith"  # "monolith" | "microservice"
    assemble: str | None = None  # natural language custom assembly instruction


@dataclass
class LuminaManifest:
    """Parsed Lumina.toml."""
    name: str
    language: str = "python"
    build: BuildSection = field(default_factory=BuildSection)
    modules: dict[str, ModuleOverride] = field(default_factory=dict)


def parse_manifest(path: Path) -> LuminaManifest:
    """Parse a Lumina.toml file."""
    with open(path, "rb") as f:
        raw = tomllib.load(f)

    proj = raw.get("project", {})
    build_raw = raw.get("build", {})
    modules_raw = raw.get("modules", {})

    return LuminaManifest(
        name=proj.get("name", path.parent.name),
        language=proj.get("language", "python"),
        build=BuildSection(
            mode=build_raw.get("mode", "monolith"),
            assemble=build_raw.get("assemble"),
        ),
        modules={
            name: ModuleOverride(test=cfg.get("test", False))
            for name, cfg in modules_raw.items()
        },
    )


# ── Project discovery ──────────────────────────────────────────


def find_project_root(start: Path | None = None) -> Path | None:
    """Walk upward from start (or cwd) to find a directory with Lumina.toml."""
    directory = (start or Path.cwd()).resolve()
    for parent in [directory, *directory.parents]:
        if (parent / "Lumina.toml").exists():
            return parent
    return None


def find_src_dir(root: Path) -> Path:
    """Return the src/ directory inside a project root."""
    return root / "src"


# ── Project scaffolding ────────────────────────────────────────


GITIGNORE_CONTENT = """\
# Lumina build output
.lumina/

# Python
__pycache__/
*.pyc
.venv/
"""

LUMINA_TOML_TEMPLATE = """\
[project]
name = "{name}"
language = "python"

[build]
mode = "monolith"
# assemble = "生成一个命令行工具，从 stdin 读取 JSON，输出到 stdout"

# Per-module overrides (optional):
# [modules.MyModule]
# test = true
"""

DEFAULT_TYPES = """\
// Shared types for {name}
"""

DEFAULT_MAIN = """\
// Entry point for {name}

module Main {{
    setup: "Initialize the system"

    interface: {{
        "ping": {{ }} -> {{ "ok": String }}
    }}

    logic: "Respond with ok on ping"
}}
"""


def init_project(name: str, path: Path | None = None) -> Path:
    """Create a new Lumina project directory.

    Returns the path to the created project root.
    """
    root = (path or Path.cwd()).resolve() / name

    if root.exists():
        raise FileExistsError(f"Directory already exists: {root}")

    # Directories
    src = root / "src"
    src.mkdir(parents=True)
    (root / ".lumina").mkdir()

    # Lumina.toml
    (root / "Lumina.toml").write_text(
        LUMINA_TOML_TEMPLATE.format(name=name), encoding="utf-8")

    # .gitignore
    (root / ".gitignore").write_text(GITIGNORE_CONTENT, encoding="utf-8")

    # Default source files
    (src / "types.lm").write_text(
        DEFAULT_TYPES.format(name=name), encoding="utf-8")
    (src / "main.lm").write_text(
        DEFAULT_MAIN.format(name=name), encoding="utf-8")

    return root
