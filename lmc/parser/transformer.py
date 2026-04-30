"""Lark Transformer: converts parse tree into AST dataclass nodes."""

from __future__ import annotations

from lark import Token, Transformer, v_args

from lmc.parser.ast_nodes import (
    ActorDecl,
    GenericType,
    Import,
    InterfaceMethod,
    Module,
    PrimitiveType,
    QualifiedType,
    RecordField,
    RecordType,
    SourceLocation,
    TypeDef,
    UnionType,
)


def _s(v: Token | str | None) -> str | None:
    """Extract string value from a STRING token, stripping quotes."""
    if v is None:
        return None
    s = str(v)
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        return s[1:-1]
    return s


class LuminaTransformer(Transformer):
    """Transforms a lark.Tree into Lumina AST dataclass instances."""

    # ── top-level ─────────────────────────────────────────────

    @v_args(inline=True)
    def start(self, *items):
        return list(items)

    # ── imports ───────────────────────────────────────────────

    @v_args(inline=True)
    def import_stmt(self, path: Token, alias: Token):
        return Import(path=_s(path) or "", alias=str(alias),
                      location=SourceLocation(file="<source>", line=0, column=0))

    # ── type definitions ──────────────────────────────────────

    @v_args(inline=True)
    def type_def(self, name: Token, body, description: Token | None = None):
        return TypeDef(name=str(name), body=body, description=_s(description))

    def union_type(self, children):
        return children[0] if len(children) == 1 else UnionType(members=list(children))

    @v_args(inline=True)
    def type_atom(self, item):
        return item

    # ── record / struct ───────────────────────────────────────

    @v_args(inline=True)
    def record_type(self, *args):
        fields = []
        desc = None
        for a in args:
            if isinstance(a, RecordField):
                fields.append(a)
            elif desc is None:
                desc = _s(a)
        return RecordType(fields=fields, description=desc)

    @v_args(inline=True)
    def record_field(self, name: Token, type_expr,
                     description: Token | None = None):
        return RecordField(name=_s(name) or "", type_expr=type_expr,
                           description=_s(description))

    # ── generics ──────────────────────────────────────────────

    @v_args(inline=True)
    def generic_type(self, base: Token, *args):
        type_args = []
        desc = None
        for a in args:
            s = _s(a) if isinstance(a, Token) else None
            if s is not None:
                desc = s
            else:
                type_args.append(a)
        return GenericType(base=str(base), type_args=type_args, description=desc)

    # ── primitives ────────────────────────────────────────────

    @v_args(inline=True)
    def primitive_type(self, kind: Token, description: Token | None = None):
        return PrimitiveType(kind=str(kind), description=_s(description))

    # ── qualified name ────────────────────────────────────────

    def qualified_name(self, children):
        parts = [str(c) for c in children]
        return QualifiedType(namespace=parts[0], type_name=".".join(parts[1:]))

    # ── module definition ─────────────────────────────────────

    @v_args(inline=True)
    def module_def(self, name: Token, *body_items):
        mod = Module(name=str(name))
        for item in body_items:
            if isinstance(item, ActorDecl):
                mod.actors.append(item)
            elif isinstance(item, tuple):
                tag, value = item
                if tag == "__setup__":
                    mod.setup = value
                elif tag == "__interface__":
                    mod.interface = value
                elif tag == "__logic__":
                    mod.logic = value
        return mod

    # ── module reference (actor type) ──────────────────────────

    @v_args(inline=True)
    def module_ref(self, *parts: Token):
        return ".".join(str(p) for p in parts)

    # ── actor declaration ─────────────────────────────────────

    @v_args(inline=True)
    def actor_decl(self, name: Token, module_ref: str):
        return ActorDecl(name=str(name), module_ref=module_ref,
                         location=SourceLocation(file="<source>", line=0, column=0))

    # ── setup / interface / logic ─────────────────────────────

    @v_args(inline=True)
    def setup_stmt(self, text: Token):
        return ("__setup__", _s(text))

    @v_args(inline=True)
    def interface_stmt(self, *pairs):
        result = {}
        for i in range(0, len(pairs), 2):
            if i + 1 < len(pairs):
                result[_s(pairs[i]) or ""] = pairs[i + 1]
        return ("__interface__", result)

    @v_args(inline=True)
    def iface_method(self, input_rec: RecordType, output_rec: RecordType):
        return InterfaceMethod(input_fields=input_rec, output_fields=output_rec)

    @v_args(inline=True)
    def logic_stmt(self, text: Token):
        return ("__logic__", _s(text))
