"""Pipeline orchestrator: parse → analyze → generate → build."""

from __future__ import annotations

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
    ):
        self._output_dir = output_dir
        self._build_mode = build_mode
        self._language = target_language
        self._overrides = module_overrides or {}
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
                print(f"  ⚠ {w}")

        graph = ModuleGraph(prog)
        try:
            order = graph.topological_order()
        except ValueError as e:
            raise OrchestratorError(f"Circular dependency: {e}") from e

        if not order:
            raise OrchestratorError("No modules found in the source files.")

        template = self._jinja.get_template("module_generate.j2")
        results: dict[str, GeneratedFiles] = {}

        for mod_name in order:
            module = prog.module_registry[mod_name]
            task = self._taskgen.generate(module, prog, str(path))

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
            print(f"  ✓ {mod_name} — {len(files.files)} file(s) generated")

            if auto_test and AgentCapability.TEST in agent.capabilities:
                test_result = agent.test(task.task_id, files, work_dir)
                if test_result:
                    status = "PASS" if test_result.passed else "FAIL"
                    print(f"    Test: {status}")
                    if not test_result.passed:
                        print(f"    {test_result.output[:200]}")

        return results
