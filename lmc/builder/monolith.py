"""Monolith builder — single-process assembly with in-memory routing.

Generates a runnable system from AI-generated module code:
  - Runtime base class (LuminaActor)
  - Main entry point that instantiates and wires all actors
  - Supports Python and TypeScript
"""

from __future__ import annotations

from pathlib import Path

from lmc.agents.base import GeneratedFiles

_PYTHON_RUNTIME = '''"""Lumina Actor runtime — auto-generated."""

from typing import Any


class LuminaActor:
    def __init__(self, name: str):
        self.name = name
        self._router: MessageRouter | None = None

    def run(self) -> None:
        """Override: called once at startup."""
        pass

    def invoke(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Override: handle incoming JSON messages."""
        raise NotImplementedError(f"Method {method} not implemented")

    def send_message(self, target: str, method: str,
                     params: dict[str, Any]) -> dict[str, Any]:
        if self._router is None:
            raise RuntimeError("Actor not registered with a router")
        return self._router.route(target, method, params)


class MessageRouter:
    """In-process message routing table."""

    def __init__(self):
        self._actors: dict[str, LuminaActor] = {}

    def register(self, name: str, actor: LuminaActor) -> None:
        self._actors[name] = actor
        actor._router = self

    def route(self, target: str, method: str,
              params: dict[str, Any]) -> dict[str, Any]:
        actor = self._actors.get(target)
        if actor is None:
            raise KeyError(f"Actor '{target}' not found")
        return actor.invoke(method, params)
'''

_TS_RUNTIME = '''// Lumina Actor runtime — auto-generated.

export abstract class LuminaActor {
  private router: MessageRouter | null = null;
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /** Called once at startup. */
  abstract run(): Promise<void>;

  /** Handle an incoming JSON message. */
  abstract invoke(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** Send a message to a child actor. */
  protected async sendMessage(
    target: string, method: string, params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.router) throw new Error("Actor not registered with a router");
    return this.router.route(target, method, params);
  }

  /** @internal */
  _setRouter(router: MessageRouter) { this.router = router; }
}

export class MessageRouter {
  private actors = new Map<string, LuminaActor>();

  register(name: string, actor: LuminaActor): void {
    this.actors.set(name, actor);
    actor._setRouter(this);
  }

  route(target: string, method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const actor = this.actors.get(target);
    if (!actor) throw new Error(`Actor '${target}' not found`);
    return actor.invoke(method, params);
  }
}
'''


def assemble(
    modules: dict[str, GeneratedFiles],
    output_dir: Path,
    language: str = "python",
    assemble_hint: str | None = None,
    dependency_order: list[str] | None = None,
) -> Path:
    """Assemble generated modules into a runnable system.

    Returns the output directory path.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    order = dependency_order or list(modules.keys())

    # Detect language from modules if not specified
    if language == "python" and modules:
        first = next(iter(modules.values()))
        if first.files:
            first_path = first.files[0].path
            if first_path.endswith(".ts"):
                language = "typescript"

    # Write runtime base class
    runtime_dir = output_dir / "_runtime"
    runtime_dir.mkdir(exist_ok=True)
    if language == "typescript":
        (runtime_dir / "LuminaActor.ts").write_text(_TS_RUNTIME, encoding="utf-8")
    else:
        (runtime_dir / "lumina_actor.py").write_text(_PYTHON_RUNTIME, encoding="utf-8")

    # Write each module's generated files
    for mod_name, gen_files in modules.items():
        for gf in gen_files.files:
            # Write to project root, preserving path
            dest = output_dir / gf.path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(gf.content, encoding="utf-8")

    # Generate main entry point
    if assemble_hint:
        main_content = _generate_custom_main(order, language, assemble_hint)
    else:
        main_content = _generate_default_main(order, language)

    if language == "typescript":
        main_path = output_dir / "main.ts"
        # Also generate minimal package.json
        pkg = output_dir / "package.json"
        pkg.write_text('{\n  "name": "lumina-system",\n  "type": "module",\n'
                       '  "dependencies": {}\n}\n', encoding="utf-8")
    else:
        main_path = output_dir / "main.py"

    main_path.write_text(main_content, encoding="utf-8")

    return output_dir


def _generate_default_main(order: list[str], language: str) -> str:
    """Generate a standard main entry point that wires all actors."""
    if language == "typescript":
        return _ts_default_main(order)
    return _py_default_main(order)


def _py_default_main(order: list[str]) -> str:
    imports = [f"from {m.lower()} import {m}" for m in order]
    instances = [f'    router.register("{m}", {m}("{m}"))' for m in order]
    return f'''"""Auto-generated Lumina system entry point."""

from _runtime.lumina_actor import MessageRouter

{chr(10).join(imports)}


def main():
    router = MessageRouter()
{chr(10).join(instances)}

    for name, actor in router._actors.items():
        print(f"[Lumina] {{name}} starting...")
        actor.run()

    print("System running.")
    import time
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\\nShutting down.")


if __name__ == "__main__":
    main()
'''


def _ts_default_main(order: list[str]) -> str:
    imports = [f'import {{ {m} }} from "./{m.lower()}.js";' for m in order]
    instances = [f'  router.register("{m}", new {m}("{m}"));' for m in order]
    return f'''// Auto-generated Lumina system entry point.
import {{ MessageRouter }} from "./_runtime/LuminaActor.js";
{chr(10).join(imports)}

async function main() {{
  const router = new MessageRouter();
{chr(10).join(instances)}

  for (const actor of router["actors"].values()) {{
    console.log(`[Lumina] ${{actor.name}} starting...`);
    await actor.run();
  }}

  console.log("System running. Press Ctrl+C to stop.");
}}

main().catch(console.error);
'''


def _generate_custom_main(order: list[str], language: str, hint: str) -> str:
    """Placeholder: when assemble_hint is set, defer to AI agent.
    For now, include the hint as a comment in default main."""
    ext = "ts" if language == "typescript" else "py"
    return f'''// [CUSTOM ASSEMBLY]
// {hint}
// TODO: send system topology + this hint to AI agent for custom assembly.
// For now, default wiring is provided below.

{_generate_default_main(order, language)}
'''
