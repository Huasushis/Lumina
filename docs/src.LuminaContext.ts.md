# `src/LuminaContext.ts`

Minimal orchestration core for Lumina.

## Responsibilities

- Hold runtime state: `memory`, `skills`, `history`, `llmFunctions`
- Execute tasks via `call(taskDescription)`
- Execute AI-generated TypeScript in sandbox (`Sandbox.runCode`)
- Provide AI function lifecycle:
  - `registerLLMFunction(...)`
  - `invokeLLMFunction(name, ...args)`
- Keep compile/runtime/review retry/error mechanism

## Design constraints (current)

- No function store / no persistence layer
- No built-in internal skill filter pipeline
- No generated code cache persisted in context state
- AI function code is generated per invocation in code mode

## TS function support

Two ways to inject native functions:

1. `defineTSFunction(...)`
2. `injectFunctionMap(...)`

Both automatically append runtime `llmContext` when executing the function:

- `history`
- `skills`
- `provider`

## AI function flow

Per invocation:

1. Negotiate mode (`return` or `code`) unless `preferredMode` is set
2. If return mode is feasible, run return path
3. Otherwise generate code and run sandbox path
4. Apply review/retry on runtime errors

If return mode hits context-window style errors, fallback to code mode.

## Sandbox integration

When executing eval code, context injects:

- `self.skills`
- `self.clone()`
- `self.create(prompt)`
- `self.llmFunctions.*`
- `self.createLLMFunction(...)`

## Clone/create behavior

- `clone()` deep-clones memory and preserves skills/history snapshot
- `create(systemPrompt?)` starts fresh memory/history and inherits skills by default
