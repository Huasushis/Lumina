"""Monolith builder — single-process assembly with in-memory routing."""

from pathlib import Path

from lmc.agents.base import GeneratedFiles

_PYTHON_RUNTIME = '''"""Lumina Actor runtime — auto-generated."""

from typing import Any


class LuminaActor:
    def __init__(self, name: str):
        self.name = name
        self._router: MessageRouter | None = None

    def run(self) -> None:
        pass

    def invoke(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError(f"Method {method} not implemented")

    def send_message(self, target: str, method: str,
                     params: dict[str, Any]) -> dict[str, Any]:
        if self._router is None:
            raise RuntimeError("Actor not registered with a router")
        return self._router.route(target, method, params)


class MessageRouter:
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

  constructor(name: string) { this.name = name; }

  abstract run(): Promise<void>;
  abstract invoke(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;

  protected async sendMessage(
    target: string, method: string, params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.router) throw new Error("Actor not registered");
    return this.router.route(target, method, params);
  }

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
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    order = dependency_order or list(modules.keys())

    # Write runtime
    runtime_dir = output_dir / "_runtime"
    runtime_dir.mkdir(exist_ok=True)
    if language == "typescript":
        (runtime_dir / "LuminaActor.ts").write_text(_TS_RUNTIME, encoding="utf-8")
    else:
        (runtime_dir / "lumina_actor.py").write_text(_PYTHON_RUNTIME, encoding="utf-8")

    # Write module files
    for mod_name, gen_files in modules.items():
        for gf in gen_files.files:
            dest = output_dir / gf.path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(gf.content, encoding="utf-8")

    # Write entry point
    if language == "typescript":
        (output_dir / "main.ts").write_text(_gen_ts_main(order), encoding="utf-8")
        (output_dir / "package.json").write_text(
            '{"name":"lumina-system","type":"module","dependencies":{}}\n', encoding="utf-8")
    else:
        (output_dir / "main.py").write_text(_gen_py_main(order), encoding="utf-8")

    return output_dir


def _gen_py_main(order: list[str]) -> str:
    imports = "\n".join(f"from {m.lower()} import {m}" for m in order)
    registers = "\n".join(f'    router.register("{m}", {m}("{m}"))' for m in order)
    actor_list = "[" + ", ".join(f'"{m}"' for m in order) + "]"
    return f'''"""Auto-generated Lumina system entry point."""

import json
from _runtime.lumina_actor import MessageRouter

{imports}


def main():
    router = MessageRouter()
{registers}

    actors = {actor_list}
    for name, actor in router._actors.items():
        print(f"[Lumina] {{name}} starting...")
        actor.run()

    print(f"Ready. Actors: {{actors}}")
    print('Usage: "Actor.method {{json}}" | list | quit')
    print()

    while True:
        try:
            line = input("> ").strip()
        except (KeyboardInterrupt, EOFError):
            break
        if line in ("quit", "exit"):
            break
        if not line:
            continue
        if line == "list":
            for name in actors:
                a = router._actors[name]
                methods = [k for k in dir(a.__class__)
                           if not k.startswith("_") and k not in
                           ("run", "invoke", "send_message", "name")]
                if methods:
                    print(f"  {{name}}: {{', '.join(methods)}}")
            continue
        try:
            target_method, _, params_str = line.partition(" ")
            target, _, method = target_method.partition(".")
            params = json.loads(params_str) if params_str.strip() else {{}}
            result = router.route(target, method, params)
            print(json.dumps(result, indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"Error: {{e}}")

    print("\\nShutting down.")


if __name__ == "__main__":
    main()
'''


def _gen_ts_main(order: list[str]) -> str:
    imports = "\n".join(f'import {{ {m} }} from "./{m.lower()}.js";' for m in order)
    registers = "\n".join(f'  router.register("{m}", new {m}("{m}"));' for m in order)
    actors = "[" + ", ".join(f'"{m}"' for m in order) + "]"
    return f'''// Auto-generated Lumina system entry point.
import {{ MessageRouter }} from "./_runtime/LuminaActor.js";
{imports}

async function main() {{
  const router = new MessageRouter();
{registers}

  const actors = {actors};
  for (const name of actors) {{
    console.log(`[Lumina] ${{name}} starting...`);
    await router.route(name, "run", {{}});
  }}

  console.log(`Ready. Actors: ${{actors.join(", ")}}`);
  console.log('Usage: "Actor.method {{"key":"value"}}" | quit');

  // REPL via stdin
  const readline = await import("readline");
  const rl = readline.createInterface({{ input: process.stdin, output: process.stdout }});
  for await (const line of rl) {{
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "quit" || trimmed === "exit") break;
    try {{
      const [actorMethod, ...paramParts] = trimmed.split(" ");
      const [target, method] = actorMethod.split(".");
      const params = paramParts.length > 0 ? JSON.parse(paramParts.join(" ")) : {{}};
      const result = await router.route(target, method, params);
      console.log(JSON.stringify(result, null, 2));
    }} catch (e) {{
      console.error(`Error: ${{e}}`);
    }}
  }}
  rl.close();
  console.log("\\nShutting down.");
}}

main().catch(console.error);
'''
