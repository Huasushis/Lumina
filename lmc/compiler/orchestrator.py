"""Pipeline orchestrator: parse → analyze → generate → build."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from lmc.agents.base import AgentBackend, AgentCapability, GeneratedFiles
from lmc.analyzer.checker import Checker
from lmc.analyzer.graph import ModuleGraph
from lmc.analyzer.resolver import Resolver
from lmc.compiler.taskgen import TaskGenerator
from lmc.parser.parser import LuminaParser
from lmc.project import ModuleOverride


class OrchestratorError(Exception):
    """Pipeline-level error."""


class Orchestrator:
    """Coordinates the full LMC pipeline."""

    def __init__(
        self,
        output_dir: Path,
        build_mode: str = "monolith",
        target_language: str = "python",
        module_overrides: dict[str, ModuleOverride] | None = None,
        force: bool = False,
    ):
        self._output_dir = output_dir
        self._build_mode = build_mode
        self._language = target_language
        self._overrides = module_overrides or {}
        self._force = force
        self._parser = LuminaParser()
        self._resolver = Resolver(self._parser)
        self._checker = Checker()
        self._taskgen = TaskGenerator()

        template_dir = Path(__file__).parent.parent / "templates"
        self._jinja = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=select_autoescape(),
        )

    def build(self, main_file: Path, agent: AgentBackend) -> dict[str, GeneratedFiles]:
        """Run the full pipeline and return generated code for all modules."""
        path = main_file.resolve()

        prog = self._resolver.resolve(path)

        warnings = self._checker.check(prog)
        if warnings:
            for w in warnings:
                print(f"  [WARN] {w}")

        graph = ModuleGraph(prog)
        try:
            order = graph.topological_order()
        except ValueError as e:
            raise OrchestratorError(f"Circular dependency: {e}") from e

        if not order:
            raise OrchestratorError("No modules found in the source files.")

        template = self._jinja.get_template("module_generate.j2")
        results: dict[str, GeneratedFiles] = {}

        cache = _load_cache(self._output_dir)

        for mod_name in order:
            module = prog.module_registry[mod_name]
            task = self._taskgen.generate(module, prog, str(path))

            # Compute hash: source content + dependencies
            source_hash = _hash_module(module, prog, graph)

            # Check cache (skip if --force)
            if not self._force:
                cached = cache.get(mod_name)
                if cached and cached.get("hash") == source_hash:
                    cached_files = _cached_files(cached, self._output_dir / mod_name)
                    if cached_files:
                        results[mod_name] = cached_files
                        print(f"  [OK] {mod_name} (cached)")
                        continue

            override = self._overrides.get(mod_name)
            auto_test = override.test if override else False

            prompt = template.render(
                module_name=task.module_name,
                setup=task.setup,
                interface={
                    name: {"input_schema": s.input_schema, "output_schema": s.output_schema}
                    for name, s in task.interface.items()
                },
                logic=task.logic,
                type_context={
                    name: {"fields": td.fields, "description": td.description}
                    for name, td in task.type_context.items()
                },
                actor_context={
                    name: {
                        "actor_name": a.actor_name,
                        "module_type": a.module_type,
                        "methods": {
                            mn: {"input_schema": ms.input_schema,
                                 "output_schema": ms.output_schema}
                            for mn, ms in a.methods.items()
                        },
                    }
                    for name, a in task.actor_context.items()
                },
                target_language=self._language,
                extension="ts" if self._language == "typescript" else "py",
                language_name="TypeScript" if self._language == "typescript" else "Python",
            )

            work_dir = self._output_dir / mod_name
            files = agent.generate(prompt, work_dir)
            results[mod_name] = files
            print(f"  [OK] {mod_name} — {len(files.files)} file(s) generated")

            # Update cache
            cache[mod_name] = {
                "hash": source_hash,
                "files": [
                    {"path": f.path, "content": f.content}
                    for f in files.files
                ],
            }
            _save_cache(self._output_dir, cache)

            if auto_test and AgentCapability.TEST in agent.capabilities:
                test_result = agent.test(task.task_id, files, work_dir)
                if test_result:
                    status = "PASS" if test_result.passed else "FAIL"
                    print(f"    Test: {status}")
                    if not test_result.passed:
                        print(f"    {test_result.output[:200]}")

        _save_cache(self._output_dir, cache)
        return results


# ── Incremental build helpers ──────────────────────────────────


def _hash_module(module, prog, graph) -> str:
    """Hash a module's source content and dependency hashes."""
    h = hashlib.sha256()
    h.update(module.name.encode())
    if module.setup:
        h.update(module.setup.encode())
    if module.logic:
        h.update(module.logic.encode())
    for m, spec in sorted(module.interface.items()):
        h.update(m.encode())
        h.update(str(spec.input_fields).encode())
        h.update(str(spec.output_fields).encode())
    for dep in sorted(graph.dependencies_of(module.name)):
        h.update(dep.encode())
    return h.hexdigest()


def _load_cache(output_dir: Path) -> dict:
    cache_file = output_dir / "cache.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_cache(output_dir: Path, cache: dict) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "cache.json").write_text(
        json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


def _cached_files(cached: dict, work_dir: Path) -> GeneratedFiles | None:
    """Reconstruct GeneratedFiles from cache if the files still exist."""
    files_data = cached.get("files", [])
    if not files_data:
        return None
    from lmc.agents.base import GeneratedFile
    files = [GeneratedFile(path=f["path"], content=f["content"]) for f in files_data]
    return GeneratedFiles(
        task_id=cached.get("task_id", "cached"),
        files=files,
        metadata={"cached": True},
    )
