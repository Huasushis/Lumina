"""Lark-based parser for .lumina source files."""

from __future__ import annotations

from importlib.resources import files
from pathlib import Path

import lark

from lmc.parser.transformer import LuminaTransformer


class LuminaError(Exception):
    """Base for all Lumina compiler errors."""


class LuminaParseError(LuminaError):
    def __init__(self, message: str, file: str, line: int, column: int):
        self.file = file
        self.line = line
        self.column = column
        super().__init__(f"{file}:{line}:{column}: {message}")


_GRAMMAR = (files("lmc.parser") / "grammar.lark").read_text(encoding="utf-8")
_transformer = LuminaTransformer()


class LuminaParser:
    def __init__(self):
        self._lark = lark.Lark(_GRAMMAR, parser="lalr", propagate_positions=True)

    def parse(self, source: str, file: str = "<string>") -> list:
        """Parse .lumina source text, returning a list of AST declarations."""
        try:
            tree = self._lark.parse(source)
        except lark.UnexpectedInput as exc:
            line = exc.line or 1
            col = exc.column or 1
            ctx = exc.get_context(source)
            raise LuminaParseError(
                f"Unexpected input. Expected: {sorted(exc.expected)}\n{ctx}",
                file, line, col,
            ) from exc
        return _transformer.transform(tree)

    def parse_tree(self, source: str) -> lark.Tree:
        """Parse and return the raw Lark tree (for debugging)."""
        return self._lark.parse(source)
