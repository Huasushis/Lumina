"""Monolith builder — single-process assembly with in-memory routing."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from lmc.agents.base import GeneratedFiles


@dataclass
class BuildResult:
    success: bool
    output_path: Path
    entry_point: str
    artifacts: list[Path] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class MonolithBuilder:
    """Assembles all generated modules into a single runnable process."""

    def build(self, modules: dict[str, GeneratedFiles],
              output_dir: Path,
              target_language: str = "python") -> BuildResult:
        output_dir = Path(output_dir).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)

        errors: list[str] = []

        # Write generated files for each module
        for mod_name, gen_files in modules.items():
            mod_dir = output_dir / mod_name
            mod_dir.mkdir(exist_ok=True)
            for gf in gen_files.files:
                file_path = mod_dir / gf.path
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(gf.content, encoding="utf-8")

        # Generate runtime base class
        if target_language == "python":
            runtime_code = _PYTHON_RUNTIME
        else:
            runtime_code = f"// Runtime base class for {target_language}"

        runtime_dir = output_dir / "_runtime"
        runtime_dir.mkdir(exist_ok=True)
        (runtime_dir / "lumina_actor.py").write_text(
            runtime_code, encoding="utf-8")

        # Generate main entry point
        main_code = _generate_main(modules, target_language)
        main_path = output_dir / f"main.{'py' if target_language == 'python' else 'cpp'}"
        main_path.write_text(main_code, encoding="utf-8")

        artifacts = list(output_dir.rglob("*.py"))
        entry = f"{target_language} {main_path}"

        return BuildResult(
            success=len(errors) == 0,
            output_path=output_dir,
            entry_point=entry,
            artifacts=artifacts,
            errors=errors,
        )


_PYTHON_RUNTIME = '''"""Lumina Actor base class for monolith builds."""

from __future__ import annotations

from typing import Any, Protocol


class LuminaActor:
    """Every Lumina module must inherit from this class."""

    def __init__(self, name: str):
        self._name = name
        self._router: MessageRouter | None = None

    @property
    def name(self) -> str:
        return self._name

    def run(self) -> None:
        """Override: called once at startup."""
        pass

    def invoke(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Override: handle incoming JSON messages."""
        raise NotImplementedError(f"Method {method} not implemented")

    def send_message(self, target: str, method: str,
                     params: dict[str, Any]) -> dict[str, Any]:
        """Send a message to a child actor. Provided by the runtime."""
        if self._router is None:
            raise RuntimeError("Actor not registered with a router")
        return self._router.route(target, method, params)


class MessageRouter:
    """In-process message routing table."""

    def __init__(self):
        self._actors: dict[str, LuminaActor] = {}

    def register(self, name: str, actor: LuminaActor):
        self._actors[name] = actor
        actor._router = self

    def route(self, target: str, method: str,
              params: dict[str, Any]) -> dict[str, Any]:
        actor = self._actors.get(target)
        if actor is None:
            raise KeyError(f"Actor '{target}' not found")
        return actor.invoke(method, params)
'''


def _generate_main(modules: dict[str, GeneratedFiles],
                   language: str) -> str:
    if language != "python":
        return f"// TODO: generate main for {language}"

    imports = []
    instances = []
    for mod_name in modules:
        mod_lower = mod_name.lower()
        imports.append(f"from {mod_name}.{mod_lower} import {mod_name}")
        instances.append(
            f'    router.register("{mod_name}", {mod_name}("{mod_name}"))')

    return f'''"""Auto-generated Lumina system entry point."""

from _runtime.lumina_actor import MessageRouter

{chr(10).join(imports)}


def main():
    router = MessageRouter()

{chr(10).join(instances)}

    # Startup all actors
    for name, actor in router._actors.items():
        actor.run()
        print(f"  [Lumina] {{name}} started")

    print("Lumina system running. Press Ctrl+C to stop.")
    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\\nShutting down.")


if __name__ == "__main__":
    main()
'''
