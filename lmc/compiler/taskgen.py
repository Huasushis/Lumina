"""Task JSON generation: converts resolved modules into self-contained
Task JSON objects for AI code generation agents."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from lmc.analyzer.resolver import ResolvedProgram
from lmc.parser.ast_nodes import (
    GenericType,
    InterfaceMethod,
    Module,
    PrimitiveType,
    QualifiedType,
    RecordField,
    RecordType,
    TypeDef,
    UnionType,
)


# ── Task JSON models ─────────────────────────────────────────


@dataclass
class InlineTypeDef:
    name: str
    fields: dict[str, str]
    description: str | None = None


@dataclass
class InterfaceMethodSpec:
    input_schema: dict[str, str]
    output_schema: dict[str, str]


@dataclass
class ActorSpec:
    actor_name: str
    module_type: str
    methods: dict[str, InterfaceMethodSpec]


@dataclass
class TaskJSON:
    task_id: str
    module_name: str
    source_file: str
    setup: str | None = None
    interface: dict[str, InterfaceMethodSpec] = field(default_factory=dict)
    logic: str | None = None
    type_context: dict[str, InlineTypeDef] = field(default_factory=dict)
    actor_context: dict[str, ActorSpec] = field(default_factory=dict)
    target_language: str = "python"


# ── Type rendering helpers ────────────────────────────────────


def _render_type(texpr) -> str:
    """Render a type expression to a readable string."""
    if isinstance(texpr, PrimitiveType):
        return texpr.kind
    if isinstance(texpr, GenericType):
        args = ", ".join(_render_type(a) for a in texpr.type_args)
        return f"{texpr.base}<{args}>"
    if isinstance(texpr, RecordType):
        fields = ", ".join(
            f"{f.name}: {_render_type(f.type_expr)}" for f in texpr.fields
        )
        return f"{{ {fields} }}"
    if isinstance(texpr, UnionType):
        members = " | ".join(_render_type(m) for m in texpr.members)
        return members
    if isinstance(texpr, QualifiedType):
        return f"{texpr.namespace}.{texpr.type_name}"
    return str(texpr)


def _render_schema(rec: RecordType) -> dict[str, str]:
    return {f.name: _render_type(f.type_expr) for f in rec.fields}


def _inline_typedef(td: TypeDef) -> InlineTypeDef:
    """Convert a TypeDef to an inline representation for the agent."""
    fields: dict[str, str] = {}
    if isinstance(td.body, RecordType):
        fields = _render_schema(td.body)
    elif isinstance(td.body, UnionType):
        fields = {"_union": _render_type(td.body)}
    else:
        fields = {"_value": _render_type(td.body)}
    return InlineTypeDef(name=td.name, fields=fields, description=td.description)


# ── Task generation ───────────────────────────────────────────


class TaskGenerator:
    """Generates TaskJSON objects from resolved modules."""

    def generate(self, module: Module, prog: ResolvedProgram,
                 source_path: str) -> TaskJSON:
        task_id = f"{module.name}@{Path(source_path).name}"
        task = TaskJSON(
            task_id=task_id,
            module_name=module.name,
            source_file=source_path,
            setup=module.setup,
            interface={},
            logic=module.logic,
        )

        # Inline interface schemas
        for method_name, method in module.interface.items():
            task.interface[method_name] = InterfaceMethodSpec(
                input_schema=_render_schema(method.input_fields),
                output_schema=_render_schema(method.output_fields),
            )

        # Inline type context from the program
        for td in prog.type_registry.values():
            task.type_context[td.name] = _inline_typedef(td)

        # Inline actor context
        for actor in module.actors:
            if actor.module_ref in prog.module_registry:
                ref_mod = prog.module_registry[actor.module_ref]
                methods: dict[str, InterfaceMethodSpec] = {}
                for mname, method in ref_mod.interface.items():
                    methods[mname] = InterfaceMethodSpec(
                        input_schema=_render_schema(method.input_fields),
                        output_schema=_render_schema(method.output_fields),
                    )
                task.actor_context[actor.name] = ActorSpec(
                    actor_name=actor.name,
                    module_type=actor.module_ref,
                    methods=methods,
                )

        return task
