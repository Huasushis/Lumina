"""Tests for import and type resolution."""

from pathlib import Path

import pytest

from lmc.analyzer.resolver import LuminaResolveError, ResolvedProgram, Resolver
from lmc.parser.parser import LuminaParser

FIXTURES = Path(__file__).parent / "fixtures" / "valid"


@pytest.fixture(scope="module")
def resolver():
    return Resolver(LuminaParser())


def test_resolve_single_file(resolver):
    prog = resolver.resolve(FIXTURES / "simple_module.lumina")
    assert "Echo" in prog.module_registry
    assert prog.module_registry["Echo"].setup is not None


def test_resolve_with_import(resolver):
    prog = resolver.resolve(FIXTURES / "math_ops.lumina")
    assert "Adder" in prog.module_registry
    assert "CalcResult" in prog.type_registry
    assert str(FIXTURES / "math_ops.lumina") in prog.import_map


def test_circular_import_detected(resolver, tmp_path):
    a = tmp_path / "a.lumina"
    b = tmp_path / "b.lumina"
    a.write_text('import "b.lumina" as b\nmodule A {}', encoding="utf-8")
    b.write_text('import "a.lumina" as a\nmodule B {}', encoding="utf-8")
    with pytest.raises(LuminaResolveError, match="Circular"):
        resolver.resolve(a)


def test_import_not_found(resolver):
    with pytest.raises(LuminaResolveError, match="Import not found"):
        resolver.parse_and_resolve(
            'import "does_not_exist.lumina" as x\nmodule Test {}',
            "test.lumina",
        )
