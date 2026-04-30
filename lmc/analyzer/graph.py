"""Module dependency graph and topological sort."""

from __future__ import annotations

from collections import deque

from lmc.analyzer.resolver import ResolvedProgram
from lmc.parser.ast_nodes import Module


class ModuleGraph:
    """Builds and analyzes the module dependency DAG."""

    def __init__(self, prog: ResolvedProgram):
        self._prog = prog
        self._deps: dict[str, set[str]] = {}  # module_name -> depends on
        self._build()

    def _build(self):
        for mod in self._prog.module_registry.values():
            deps: set[str] = set()
            for actor in mod.actors:
                if actor.module_ref in self._prog.module_registry:
                    deps.add(actor.module_ref)
            self._deps[mod.name] = deps

    def dependencies_of(self, module_name: str) -> set[str]:
        """Modules that this module directly depends on."""
        return self._deps.get(module_name, set())

    def dependents_of(self, module_name: str) -> set[str]:
        """Modules that depend on this module."""
        result: set[str] = set()
        for mod, deps in self._deps.items():
            if module_name in deps:
                result.add(mod)
        return result

    def topological_order(self) -> list[str]:
        """Return module names in dependency order (deps first)."""
        in_degree: dict[str, int] = {
            name: len(deps) for name, deps in self._deps.items()
        }
        queue = deque(name for name, deg in in_degree.items() if deg == 0)
        order: list[str] = []

        while queue:
            node = queue.popleft()
            order.append(node)
            for dependent in self.dependents_of(node):
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        if len(order) != len(self._deps):
            remaining = set(self._deps) - set(order)
            raise ValueError(
                f"Circular dependency detected among modules: {remaining}")

        return order
