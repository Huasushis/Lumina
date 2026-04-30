"""Tests for .lumina parser."""

from __future__ import annotations

from pathlib import Path

import pytest

from lmc.parser.ast_nodes import (
    GenericType,
    Import,
    InterfaceMethod,
    Module,
    PrimitiveType,
    QualifiedType,
    RecordField,
    RecordType,
    TypeDef,
    UnionType,
)
from lmc.parser.parser import LuminaParseError, LuminaParser

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def parser():
    return LuminaParser()


def _parse(parser, name):
    path = FIXTURES / "valid" / name
    return parser.parse(path.read_text(encoding="utf-8"), str(path))


# ── valid fixtures ────────────────────────────────────────────


def test_simple_type(parser):
    decls = _parse(parser, "simple_type.lumina")
    assert len(decls) == 1
    td = decls[0]
    assert isinstance(td, TypeDef)
    assert td.name == "Status"
    assert isinstance(td.body, RecordType)
    assert len(td.body.fields) == 2
    assert td.body.fields[0].name == "code"
    assert isinstance(td.body.fields[0].type_expr, PrimitiveType)
    assert td.body.fields[0].type_expr.kind == "Int"
    assert td.body.fields[1].name == "message"
    assert td.body.description == "通用状态响应"


def test_simple_module(parser):
    decls = _parse(parser, "simple_module.lumina")
    assert len(decls) == 1
    mod = decls[0]
    assert isinstance(mod, Module)
    assert mod.name == "Echo"
    assert mod.setup is not None
    assert "echo" in mod.interface
    assert mod.logic is not None


def test_with_import(parser):
    decls = _parse(parser, "with_import.lumina")
    assert len(decls) == 2
    imp = decls[0]
    assert isinstance(imp, Import)
    assert imp.path == "types.lumina"
    assert imp.alias == "t"
    mod = decls[1]
    assert isinstance(mod, Module)
    assert mod.name == "Calculator"


def test_full_system(parser):
    decls = _parse(parser, "full_system.lumina")
    # TypeDef, Sorter module, Controller module
    assert len(decls) == 3
    td = decls[0]
    assert isinstance(td, TypeDef)
    sorter = decls[1]
    assert isinstance(sorter, Module)
    assert sorter.name == "Sorter"
    ctrl = decls[2]
    assert isinstance(ctrl, Module)
    assert ctrl.name == "Controller"
    assert len(ctrl.actors) == 1
    assert ctrl.actors[0].name == "sorter"
    assert ctrl.actors[0].module_ref == "Sorter"


def test_union_type(parser):
    decls = _parse(parser, "union_type.lumina")
    assert len(decls) == 1
    td = decls[0]
    assert isinstance(td.body, UnionType)
    assert len(td.body.members) == 2
    assert isinstance(td.body.members[0], RecordType)
    assert isinstance(td.body.members[1], RecordType)


# ── invalid fixture ───────────────────────────────────────────

def test_missing_type_parses_anyway(parser):
    """UnknownType is parsed as a PrimitiveType — semantic check is later."""
    decls = _parse(parser, "missing_type.lumina")
    assert len(decls) == 1


# ── error cases ────────────────────────────────────────────────

def test_unexpected_token(parser):
    with pytest.raises(LuminaParseError) as exc:
        parser.parse("module { broken", "test.lumina")
    assert "test.lumina" in str(exc.value)
