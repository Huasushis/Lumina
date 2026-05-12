"""LMC CLI — Lumina compiler."""

import json
from pathlib import Path
from typing import Annotated, Optional

import typer

from lmc.analyzer.checker import Checker
from lmc.analyzer.graph import ModuleGraph
from lmc.analyzer.resolver import Resolver
from lmc.compiler.orchestrator import Orchestrator
from lmc.compiler.taskgen import TaskGenerator
from lmc.config import get_agent_config
from lmc.parser.parser import LuminaParser
from lmc.project import find_project_root, find_src_dir, init_project, parse_manifest

from lmc import __version__

app = typer.Typer(help="Lumina compiler", no_args_is_help=True)


def version_callback(value: bool):
    if value:
        typer.echo(f"lumina v{__version__}")
        raise typer.Exit()


@app.callback()
def callback(
    version: Annotated[bool, typer.Option("--version", "-V",
                       callback=version_callback, is_eager=True,
                       help="Show version and exit")] = False,
):
    """Lumina compiler — parse .lm files and build systems."""


# ── init ──────────────────────────────────────────────────────


@app.command()
def init(
    name: Annotated[str, typer.Argument(help="Project name")],
    path: Annotated[Optional[Path], typer.Option("--path", "-p",
                    help="Parent directory")] = None,
):
    """Create a new Lumina project."""
    try:
        root = init_project(name, path)
    except FileExistsError as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)

    typer.echo(f"Created Lumina project '{name}' at {root}")
    typer.echo(f"  Lumina.toml  — project manifest")
    typer.echo(f"  src/main.lm — entry point")
    typer.echo(f"  src/types.lm — shared types")
    typer.echo(f"  .gitignore    — auto-generated")
    typer.echo()
    typer.echo(f"Next: cd {name} && lumina build")


# ── build ─────────────────────────────────────────────────────


@app.command()
def build(
    dry_run: Annotated[bool, typer.Option("--dry-run",
                       help="Print tasks without calling AI agents")] = False,
    mode: Annotated[str, typer.Option("--mode", "-m",
                    help="Build mode: monolith or microservice")] = "monolith",
    agent_type: Annotated[str, typer.Option("--agent", "-a",
                          help="Agent: llm or claude_code")] = "",
    force: Annotated[bool, typer.Option("--force",
                     help="Force rebuild all modules, ignoring cache")] = False,
    only: Annotated[str, typer.Option("--only",
                    help="Only rebuild specific modules (comma-separated)")] = "",
):
    """Build the Lumina project in the current directory."""
    root = find_project_root()
    if root is None:
        typer.echo(
            "Error: no Lumina.toml found. "
            "Run 'lumina init <name>' to create a project, "
            "or run this command inside a Lumina project directory.",
            err=True,
        )
        raise typer.Exit(1)

    manifest = parse_manifest(root / "Lumina.toml")
    src_dir = find_src_dir(root)
    main_file = src_dir / "main.lm"

    if not main_file.exists():
        typer.echo(f"Error: entry point not found: {main_file}", err=True)
        raise typer.Exit(1)

    typer.echo(f"Project: {manifest.name}")
    typer.echo(f"Source:  {src_dir}")

    agent_cfg = get_agent_config()
    if agent_type:
        agent_cfg.type = agent_type

    parser = LuminaParser()
    resolver = Resolver(parser)
    prog = resolver.resolve(main_file)

    checker = Checker()
    warnings = checker.check(prog)
    for w in warnings:
        typer.echo(f"  [WARN] {w}", err=True)

    graph = ModuleGraph(prog)
    try:
        order = graph.topological_order()
    except ValueError as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)

    build_mode = mode or manifest.build.mode
    typer.echo(f"Modules: {', '.join(order)} ({len(order)})")
    typer.echo(f"Agent:   {agent_cfg.type}")
    typer.echo(f"Mode:    {build_mode}")

    if dry_run:
        typer.echo("\nDry run — Task JSONs:\n")
        gen = TaskGenerator()
        for mod_name in order:
            mod = prog.module_registry[mod_name]
            task = gen.generate(mod, prog, str(main_file))
            typer.echo(f"━━━ {task.task_id} ━━━")
            typer.echo(f"  Setup: {task.setup}")
            typer.echo(f"  Interface: {list(task.interface)}")
            typer.echo(f"  Logic: {task.logic}")
            typer.echo()
        return

    try:
        if agent_cfg.type == "claude_code":
            from lmc.agents.claude_code import ClaudeCodeAgent
            agent = ClaudeCodeAgent(agent_cfg)
        else:
            from lmc.agents.llm import LLMAgent
            agent = LLMAgent(agent_cfg)
    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)

    output_dir = root / ".lumina" / "build"
    orchestrator = Orchestrator(
        output_dir=output_dir,
        build_mode=build_mode,
        target_language=manifest.language,
        module_overrides=manifest.modules,
        force=force,
        project_root=root,
        only_modules={m.strip() for m in only.split(",") if m.strip()} if only else None,
    )

    typer.echo(f"\nGenerating {len(order)} module(s)...")
    try:
        results = orchestrator.build(main_file, agent)
    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)

    # Build actor dependency graph for assembly
    actor_graph: dict[str, list[dict]] = {}
    for mod_name in order:
        if mod_name not in prog.module_registry:
            continue
        mod = prog.module_registry[mod_name]
        if mod.actors:
            actor_graph[mod_name] = [
                {"actor_name": a.name, "module_type": a.module_ref}
                for a in mod.actors
            ]

    # Assemble into runnable system
    from lmc.builder.monolith import assemble
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    jinja_env = Environment(
        loader=FileSystemLoader(str(Path(__file__).parent / "templates")),
        autoescape=select_autoescape(),
    )

    try:
        final_dir = assemble(
            modules=results,
            output_dir=output_dir,
            assemble_hint=manifest.build.assemble,
            dependency_order=[m for m in order if m in results],
            agent=agent,
            jinja_env=jinja_env,
            actor_graph=actor_graph,
        )
    except Exception as e:
        typer.echo(f"Error assembling: {e}", err=True)
        raise typer.Exit(1)

    typer.echo(f"\nDone. {len(results)} module(s) in {final_dir}")
    typer.echo(f"Look in {final_dir} for the entry point")


# ── parse ─────────────────────────────────────────────────────


@app.command()
def parse_cmd(
    file: Annotated[Path, typer.Argument(help="Path to .lm source file")],
    fmt: Annotated[str, typer.Option("--format", "-f",
                   help="Output: ast or json")] = "ast",
):
    """Parse a .lm file and print the AST or Task JSON."""
    parser = LuminaParser()
    path = file.resolve()

    if not path.exists():
        typer.echo(f"Error: file not found: {path}", err=True)
        raise typer.Exit(1)

    source = path.read_text(encoding="utf-8")
    decls = parser.parse(source, str(path))

    if fmt == "ast":
        _print_ast(decls)
        return

    resolver = Resolver(parser)
    prog = resolver.resolve(path)

    checker = Checker()
    for w in checker.check(prog):
        typer.echo(f"  [WARN] {w}", err=True)

    gen = TaskGenerator()
    graph = ModuleGraph(prog)

    try:
        order = graph.topological_order()
    except ValueError as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1)

    output = {
        "source_file": str(path),
        "type_definitions": list(prog.type_registry),
        "modules": {},
    }

    for mod_name in order:
        mod = prog.module_registry[mod_name]
        task = gen.generate(mod, prog, str(path))
        output["modules"][mod_name] = {
            "task_id": task.task_id,
            "setup": task.setup,
            "interface": {
                n: {"input": s.input_schema, "output": s.output_schema}
                for n, s in task.interface.items()
            },
            "logic": task.logic,
            "actor_context": {
                n: {"actor_name": a.actor_name, "module_type": a.module_type,
                    "methods": {mn: {"input": ms.input_schema, "output": ms.output_schema}
                                for mn, ms in a.methods.items()}}
                for n, a in task.actor_context.items()
            },
            "type_context": {
                n: {"fields": td.fields, "description": td.description}
                for n, td in task.type_context.items()
            },
        }

    typer.echo(json.dumps(output, indent=2, ensure_ascii=False))


# ── helpers ────────────────────────────────────────────────────


def _print_ast(decls: list) -> None:
    for decl in decls:
        cls_name = type(decl).__name__
        if cls_name == "Import":
            typer.echo(f"Import: {decl.alias} <- \"{decl.path}\"")
        elif cls_name == "TypeDef":
            from lmc.compiler.taskgen import _render_type
            typer.echo(f"TypeDef: {decl.name} = {_render_type(decl.body)}"
                       + (f"  # {decl.description}" if decl.description else ""))
        elif cls_name == "Module":
            typer.echo(f"Module: {decl.name}")
            if decl.actors:
                typer.echo(f"  actors: {', '.join(a.name for a in decl.actors)}")
            if decl.setup:
                typer.echo(f"  setup: {decl.setup[:60]}...")
            if decl.interface:
                typer.echo(f"  interface: {list(decl.interface.keys())}")
            if decl.logic:
                typer.echo(f"  logic: {decl.logic[:60]}...")
