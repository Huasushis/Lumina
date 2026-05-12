"""Monolith builder — collects generated files, delegates assembly to AI agent."""

from pathlib import Path

from lmc.agents.base import AgentBackend, GeneratedFiles


def _normalize_path(path: str) -> str:
    """Strip common wrappers from generated paths."""
    for prefix in ("src/", "output/", "dist/"):
        if path.startswith(prefix):
            return path[len(prefix):]
    return path


def assemble(
    modules: dict[str, GeneratedFiles],
    output_dir: Path,
    assemble_hint: str | None = None,
    dependency_order: list[str] | None = None,
    agent: AgentBackend | None = None,
    jinja_env=None,
    actor_graph: dict[str, list[dict]] | None = None,
) -> Path:
    """Collect generated files, send assembly prompt to AI, write output."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    order = dependency_order or list(modules.keys())

    # Normalize and write module files
    modules_info: dict = {}
    for mod_name in order:
        if mod_name not in modules:
            continue
        gen_files = modules[mod_name]
        info = {"files": []}
        for gf in gen_files.files:
            clean = _normalize_path(gf.path)
            dest = output_dir / clean
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(gf.content, encoding="utf-8")
            info["files"].append({"path": clean})
        modules_info[mod_name] = info

    # If no agent, just write files (dry-run mode)
    if agent is None or jinja_env is None:
        return output_dir

    # Render assembly prompt and let AI generate glue code
    template = jinja_env.get_template("system_assemble.j2")
    prompt = template.render(
        modules=modules_info,
        dependency_order=order,
        actor_graph=actor_graph or {},
        assemble_hint=assemble_hint,
    )

    try:
        result = agent.generate(prompt, output_dir)
        for gf in result.files:
            clean = _normalize_path(gf.path)
            dest = output_dir / clean
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(gf.content, encoding="utf-8")
    except Exception as e:
        # Assembly failure is non-fatal: module code is already written
        print(f"  [WARN] Assembly step failed: {e}")
        print(f"  Module code is available in {output_dir}")

    return output_dir
