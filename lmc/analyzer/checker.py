"""Semantic validation for resolved Lumina programs."""

from __future__ import annotations

from lmc.analyzer.resolver import ResolvedProgram
from lmc.parser.ast_nodes import (
    ActorDecl,
    Module,
    QualifiedType,
    RecordType,
    TypeDef,
)


class LuminaCheckError(Exception):
    """Semantic validation error."""

    def __init__(self, message: str):
        super().__init__(message)


class Checker:
    """Runs semantic validation passes on a ResolvedProgram."""

    def check(self, prog: ResolvedProgram) -> list[str]:
        """Run all checks. Returns list of warning messages."""
        warnings: list[str] = []
        self._check_duplicate_names(prog)
        self._check_actor_refs(prog, warnings)
        self._check_interface_types(prog, warnings)
        self._check_type_defs(prog, warnings)
        return warnings

    def _check_duplicate_names(self, prog: ResolvedProgram):
        seen_actors: dict[str, str] = {}  # module.actor -> file
        for mod in prog.module_registry.values():
            for actor in mod.actors:
                key = f"{mod.name}.{actor.name}"
                if key in seen_actors:
                    raise LuminaCheckError(
                        f"Duplicate actor '{actor.name}' in module "
                        f"'{mod.name}'")
                seen_actors[key] = ""

            seen_methods: set[str] = set()
            for method_name in mod.interface:
                if method_name in seen_methods:
                    raise LuminaCheckError(
                        f"Duplicate method '{method_name}' in interface "
                        f"of module '{mod.name}'")
                seen_methods.add(method_name)

    def _check_actor_refs(self, prog: ResolvedProgram,
                          warnings: list[str]):
        for mod in prog.module_registry.values():
            for actor in mod.actors:
                if actor.module_ref not in prog.module_registry:
                    warnings.append(
                        f"Module '{mod.name}' references actor "
                        f"'{actor.name}' of unknown type "
                        f"'{actor.module_ref}'")

    def _check_interface_types(self, prog: ResolvedProgram,
                               warnings: list[str]):
        for mod in prog.module_registry.values():
            for method_name, method in mod.interface.items():
                self._check_record_types(
                    method.input_fields, prog, warnings,
                    f"{mod.name}.{method_name} input")
                self._check_record_types(
                    method.output_fields, prog, warnings,
                    f"{mod.name}.{method_name} output")

    def _check_record_types(self, rec: RecordType, prog: ResolvedProgram,
                            warnings: list[str], context: str):
        for field in rec.fields:
            self._check_type_ref(field.type_expr, prog, warnings, context)

    def _check_type_defs(self, prog: ResolvedProgram,
                         warnings: list[str]):
        for name, td in prog.type_registry.items():
            self._check_type_ref(td.body, prog, warnings, f"type {name}")

    def _check_type_ref(self, texpr, prog: ResolvedProgram,
                        warnings: list[str], context: str):
        from lmc.parser.ast_nodes import (
            GenericType,
            PrimitiveType,
            QualifiedType,
            RecordType,
            UnionType,
        )

        if isinstance(texpr, PrimitiveType):
            if texpr.kind not in ("Int", "Float", "String", "Bool"):
                if texpr.kind not in prog.type_registry:
                    warnings.append(
                        f"Unknown type '{texpr.kind}' in {context} "
                        f"— not a primitive nor a defined type")
        elif isinstance(texpr, GenericType):
            for ta in texpr.type_args:
                self._check_type_ref(ta, prog, warnings, context)
        elif isinstance(texpr, RecordType):
            self._check_record_types(texpr, prog, warnings, context)
        elif isinstance(texpr, UnionType):
            for m in texpr.members:
                self._check_type_ref(m, prog, warnings, context)
        elif isinstance(texpr, QualifiedType):
            # Will be fully resolved by Resolver; here just note for now
            pass
