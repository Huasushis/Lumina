"""Tests for module dependency graph."""

from pathlib import Path

import pytest

from lmc.analyzer.graph import ModuleGraph
from lmc.analyzer.resolver import Resolver
from lmc.parser.parser import LuminaParser

FIXTURES = Path(__file__).parent / "fixtures" / "valid"


@pytest.fixture(scope="module")
def resolver():
    return Resolver(LuminaParser())


def test_graph_build(resolver):
    prog = resolver.resolve(FIXTURES / "full_system.lm")
    graph = ModuleGraph(prog)
    # Controller depends on Sorter
    assert "Sorter" in graph.dependencies_of("Controller")
    assert len(graph.dependencies_of("Sorter")) == 0


def test_topological_order(resolver):
    prog = resolver.resolve(FIXTURES / "full_system.lm")
    graph = ModuleGraph(prog)
    order = graph.topological_order()
    # Sorter must come before Controller
    sorter_idx = order.index("Sorter")
    ctrl_idx = order.index("Controller")
    assert sorter_idx < ctrl_idx


def test_no_modules_is_empty(resolver):
    prog = resolver.resolve(FIXTURES / "simple_type.lm")
    graph = ModuleGraph(prog)
    assert graph.topological_order() == []
