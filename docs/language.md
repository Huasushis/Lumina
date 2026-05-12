# Lumina Language Reference

`.lm` files are plain text, UTF-8. Comments use `//`.

## File Structure

A `.lm` file contains a sequence of imports, type definitions, and module definitions in any order.

## Imports

```rust
import "path/to/file.lm" as alias
```

- Path is relative to the importing file
- The alias becomes a namespace for referencing types/modules from that file

## Types

### Primitives

```
Int    Float    String    Bool
```

Each can carry a semantic description:

```rust
Int("user's age in years, must be >= 0")
String("RFC 3339 formatted timestamp")
```

### Records

```rust
type Name = {
    "field1": Type1,
    "field2": Type2("semantic description")
}
```

Field names are in quotes. Fields are separated by commas. Trailing comma is optional.

```rust
type User = {
    "id": Int("primary key"),
    "email": String("verified contact"),
    "active": Bool
}
```

Records can have an overall description:

```rust
type User = {
    "id": Int,
    "name": String
}("user account record")
```

### Generics

```rust
List<Int>
List<Float>("sorted scores, ascending")
Map<String, Int>
Map<String, List<Float>>
```

### Qualified Types

Reference types from imported files:

```rust
import "types.lm" as t

type Wrapper = {
    "data": t.DataPacket
}
```

### Unions

```rust
type Result = { "ok": Int } | { "error": String }
```

## Modules

A module is an Actor — the fundamental computational unit.

```
module Name {
    actor child_name: namespace.ModuleName
    setup: "initialization description"
    interface: {
        "method": { input } -> { output }
    }
    logic: "behavior description"
}
```

All fields are optional but at least one of `interface` or `logic` is recommended.

### Actor Mounting

```rust
module Controller {
    actor sorter: worker.Sorter
    actor database: db.Writer

    interface: {
        "process": { "data": t.Payload } -> { "result": t.Output }
    }

    logic: "receive data, send to sorter, store result in database"
}
```

### Setup

```rust
setup: "open a connection to Redis at localhost:6379, load config"
```

### Interface

```rust
interface: {
    "method_name": { input_record } -> { output_record }
}

// Example:
interface: {
    "add": { "a": Int, "b": Int } -> { "result": Int }
    "status": { } -> { "uptime": Float, "requests": Int }
}
```

### Logic

```rust
logic: "implement a binary search tree with O(log n) operations"
```

## Common Mistakes

| Wrong | Correct | Why |
|-------|---------|-----|
| `"List<Int>"` | `List<Int>` | Types are NOT quoted |
| `{ id: Int }` | `{ "id": Int }` | Field names MUST be quoted |
| `method_name: { }` | `"method_name": { }` | Method names MUST be quoted |
| `import types.lm` | `import "types.lm" as t` | Import path MUST be quoted, alias required |
| `actor x: Sorter` | `actor x: worker.Sorter` if imported, or `Sorter` if local | Actor types follow import resolution |