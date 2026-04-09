# `src/DebugSink.ts`

This file provides structured debug logging for Lumina runtime.

## Responsibilities

- Normalize debug events.
- Route events to one or multiple sinks.
- Filter events by log level.
- Trim oversized payload strings for safety/readability.

## Main Components

### 1) `ConsoleDebugSink`

Writes events to stdout/stderr with a `[LuminaDebug]` prefix.

### 2) `FileDebugSink`

Appends events as JSON lines (`.jsonl` style) to a target file.

- Creates parent directory automatically.
- Uses sync append (`appendFileSync`) for simplicity and determinism.

### 3) `MemoryDebugSink`

Stores events in memory with a ring-buffer-like cap.

- `getEvents()` returns a copy
- `clear()` resets memory

### 4) `DebugLogger`

High-level logger used by runtime modules.

- Accepts `DebugConfig`
- Builds sink pipeline
- Applies level threshold
- Trims long fields in payload
- Prevents sink errors from breaking business logic

### 5) `noopDebugLogger`

No-op implementation for disabled debug scenarios.

## Event Flow

```text
runtime module -> DebugLogger.emit(event)
               -> level filter
               -> payload trim
               -> each sink.log(event)
```

## Config Behavior (`DebugConfig`)

- `enabled`: master switch
- `level`: minimum output level
- `filePath`: enable file sink
- `mirrorToConsole`: mirror output to console (default true when enabled)
- `memoryLimit`: enable memory sink with cap
- `sink`: custom sink injection point
- `maxFieldLength`: string payload trimming threshold

## Rebuild Checklist

1. Implement `LEVEL_WEIGHT` map and filtering logic.
2. Implement `trimLongStrings` recursively.
3. Implement three sinks and `DebugLogger`.
4. Keep `DebugLogger` resilient (never throw on sink failures).

## Integration Points

- `LuminaContext.call()` creates per-call `DebugLogger` and callId.
- `LLMProvider.generate()` emits provider events.
- `Sandbox.runCode()` emits execution events.

