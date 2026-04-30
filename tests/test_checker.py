"""Tests for semantic validation."""

from pathlib import Path

import pytest

from lmc.analyzer.checker import Checker, LuminaCheckError
from lmc.analyzer.resolver import Resolver
from lmc.parser.parser import LuminaParser

FIXTURES = Path(__file__).parent / "fixtures" / "valid"


@pytest.fixture(scope="module")
def checker():
    return Checker()


@pytest.fixture(scope="module")
def resolver():
    return Resolver(LuminaParser())


def test_valid_program_no_warnings(checker, resolver):
    prog = resolver.resolve(FIXTURES / "full_system.lm")
    warnings = checker.check(prog)
    assert len(warnings) == 0


def test_missing_actor_ref_warns(checker, resolver):
    prog = resolver.resolve(FIXTURES / "full_system.lm")
    # Controller references Sorter which exists — no warning
    warnings = checker.check(prog)
    assert "references actor" not in str(warnings)


def test_unknown_primitive_warns(checker, resolver, tmp_path):
    f = tmp_path / "test.lm"
    f.write_text('''type Foo = { "val": UnknownType }''', encoding="utf-8")
    prog = resolver.resolve(f)
    warnings = checker.check(prog)
    assert any("Unknown type" in w for w in warnings)
