"""AST node definitions for .lumina source files."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Source location
# ---------------------------------------------------------------------------

@dataclass
class SourceLocation:
    file: str
    line: int
    column: int


# ---------------------------------------------------------------------------
# Type expressions
# ---------------------------------------------------------------------------

@dataclass
class PrimitiveType:
    """Built-in scalar type: Int, Float, String, Bool."""
    kind: str
    description: str | None = None


@dataclass
class GenericType:
    """Parameterized type: List<T>, Map<K,V>."""
    base: str
    type_args: list[TypeExpr] = field(default_factory=list)
    description: str | None = None


@dataclass
class RecordField:
    name: str
    type_expr: TypeExpr
    description: str | None = None


@dataclass
class RecordType:
    fields: list[RecordField] = field(default_factory=list)
    description: str | None = None


@dataclass
class UnionType:
    members: list[TypeExpr] = field(default_factory=list)


@dataclass
class QualifiedType:
    """Cross-file type reference: namespace.type_name (e.g. t.DataPacket)."""
    namespace: str
    type_name: str


TypeExpr = PrimitiveType | GenericType | RecordType | UnionType | QualifiedType


# ---------------------------------------------------------------------------
# Top-level declarations
# ---------------------------------------------------------------------------

@dataclass
class InterfaceMethod:
    input_fields: RecordType
    output_fields: RecordType


@dataclass
class ActorDecl:
    name: str
    module_ref: str  # "worker.Sorter"
    location: SourceLocation


@dataclass
class Import:
    path: str
    alias: str
    location: SourceLocation


@dataclass
class TypeDef:
    name: str
    body: TypeExpr
    description: str | None = None
    location: SourceLocation | None = None


@dataclass
class Module:
    name: str
    actors: list[ActorDecl] = field(default_factory=list)
    setup: str | None = None
    interface: dict[str, InterfaceMethod] = field(default_factory=dict)
    logic: str | None = None
    location: SourceLocation | None = None


@dataclass
class SourceFile:
    """All declarations parsed from a single .lumina file."""
    path: Path
    imports: list[Import] = field(default_factory=list)
    types: list[TypeDef] = field(default_factory=list)
    modules: list[Module] = field(default_factory=list)
