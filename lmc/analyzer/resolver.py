"""Import and type resolution for .lm source files."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from lmc.parser.ast_nodes import (
    Import,
    Module,
    QualifiedType,
    SourceFile,
    TypeDef,
)
from lmc.parser.parser import LuminaParser


class LuminaResolveError(Exception):
    """Semantic error during resolution."""

    def __init__(self, message: str, file: str | None = None):
        self.file = file
        prefix = f"{file}: " if file else ""
        super().__init__(f"{prefix}{message}")


@dataclass
class ResolvedProgram:
    """The fully resolved representation of a Lumina program."""
    source_files: dict[str, SourceFile] = field(default_factory=dict)
    type_registry: dict[str, TypeDef] = field(default_factory=dict)
    module_registry: dict[str, Module] = field(default_factory=dict)
    import_map: dict[str, dict[str, str]] = field(default_factory=dict)
    # file_path -> {alias -> imported_file_path}


class Resolver:
    """Resolves imports, types, and actor references across .lm files."""

    def __init__(self, parser: LuminaParser | None = None):
        self._parser = parser or LuminaParser()

    def resolve(self, main_path: str | Path) -> ResolvedProgram:
        main_path = Path(main_path).resolve()
        prog = ResolvedProgram()
        self._load_file(main_path, prog)
        return prog

    def _load_file(self, path: Path, prog: ResolvedProgram,
                   loading: set[Path] | None = None) -> SourceFile:
        if loading is None:
            loading = set()
        if path in loading:
            raise LuminaResolveError(
                f"Circular import detected for '{path}'", str(path))

        path_str = str(path)
        if path_str in prog.source_files:
            return prog.source_files[path_str]

        loading.add(path)

        sf = SourceFile(
            path=path,
            imports=[],
            types=[],
            modules=[],
        )

        # Parse declarations
        decls = self._parser.parse(path.read_text(encoding="utf-8"), str(path))
        for decl in decls:
            if isinstance(decl, Import):
                sf.imports.append(decl)
            elif isinstance(decl, TypeDef):
                sf.types.append(decl)
            elif isinstance(decl, Module):
                sf.modules.append(decl)

        prog.source_files[path_str] = sf

        # Register types and modules
        for td in sf.types:
            key = td.name
            if key in prog.type_registry:
                raise LuminaResolveError(
                    f"Duplicate type '{key}' — already defined in "
                    f"'{prog.type_registry[key].location}'", str(path))
            prog.type_registry[key] = td

        for mod in sf.modules:
            key = mod.name
            if key in prog.module_registry:
                raise LuminaResolveError(
                    f"Duplicate module '{key}'", str(path))
            prog.module_registry[key] = mod

        # Resolve imports recursively
        import_map: dict[str, str] = {}
        base_dir = path.parent
        for imp in sf.imports:
            import_path = (base_dir / imp.path).resolve()
            if not import_path.exists():
                raise LuminaResolveError(
                    f"Import not found: '{imp.path}' "
                    f"(resolved to '{import_path}')", str(path))
            self._load_file(import_path, prog, loading)
            import_map[imp.alias] = str(import_path)
        prog.import_map[path_str] = import_map

        return sf

    def parse_and_resolve(self, source: str, file: str = "<string>"
                          ) -> ResolvedProgram:
        """Parse inline source and resolve. Useful for testing."""
        import tempfile, os
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".lm", delete=False,
            encoding="utf-8", dir=os.getcwd(),
        ) as f:
            f.write(source)
            tmp = f.name
        try:
            return self.resolve(Path(tmp))
        finally:
            os.unlink(tmp)

    def resolve_type(self, qtype: QualifiedType, source_path: str,
                     prog: ResolvedProgram) -> TypeDef:
        """Resolve a QualifiedType to its TypeDef."""
        import_map = prog.import_map.get(source_path, {})
        if qtype.namespace not in import_map:
            raise LuminaResolveError(
                f"Unknown import alias '{qtype.namespace}'", source_path)
        imported_file = import_map[qtype.namespace]
        key = qtype.type_name
        if key not in prog.type_registry:
            raise LuminaResolveError(
                f"Type '{qtype.namespace}.{qtype.type_name}' not found "
                f"in '{imported_file}'", source_path)
        return prog.type_registry[key]
