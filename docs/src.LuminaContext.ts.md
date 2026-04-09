# `src/LuminaContext.ts`

This is the orchestration core of Lumina.

## Responsibilities

- Hold mutable runtime state (`memory`, `skills`, `history`).
- Call LLM provider and route by intent.
- Execute generated code in sandbox for eval mode.
- Retry failed eval attempts.
- Expose context lifecycle primitives (`clone`, `create`, `exportAsFunction`).
- Emit context-level debug events.

## State Model

```ts
class LuminaContext {
  memory: Record<string, any>;
  skills: Map<string, AnySkill>;
  history: Message[];
  provider: ILLMProvider;
  config: LuminaConfig;
}
```

## Key Methods

### `clone()`

- Deep clones `memory` (`structuredClone`)
- Shallow copies `history`
- Copies `skills` map (skill function refs reused)

### `create(systemPrompt?)`

- Creates fresh context with empty memory
- Inherits skills by default
- Optional initial system message in history

### `injectSkill(skill)`

Registers skill by `skill.name` into current context.

### `injectSkills(...skills)`

Batch registration helper for executable and/or knowledge skills.

### `injectKnowledge(skill)`

Registers one knowledge-only skill with runtime guard.

### `injectFunctionMap(functionMap)`

Converts plain functions to executable skills via `defineSkill(...)` and injects them.

### `call(taskDescription)`

Main execution loop.

#### Call flow (pseudocode)

```text
callId = randomUUID
logger = new DebugLogger(config.debug)
push user message into history
attempts = 0

while attempts <= maxRetries:
  response = provider.generate(history, skills, {callId, logger})
  if response.intent == return:
    append assistant message
    return value
  if response.intent == eval:
    append assistant message
    try sandbox.runCode(..., {callId, logger}, config.sandbox)
      return result
    catch err:
      attempts++
      append error feedback as user message
      if attempts > maxRetries: throw
  else:
    throw unknown intent error
```

## Debug Events

- `context.call.start`
- `context.call.attempt`
- `context.intent.received`
- `context.call.return`
- `context.eval.code`
- `context.call.eval_success`
- `context.call.retry`
- `context.call.failed`
- `context.intent.unknown`
- `context.call.unreachable`

## Error Semantics

- Eval runtime errors are retried until `maxRetries` exceeded.
- Exceeded retries throws a final error to caller.
- Unknown intent throws immediately.

## Rebuild Checklist

1. Preserve retry behavior and history feedback loop.
2. Preserve call-level debug context propagation to provider and sandbox.
3. Preserve clone/create semantics (memory isolation is critical).
4. Keep `exportAsFunction()` as a thin call wrapper.

## V2 Runtime Notes

- Context now maintains `llmFunctions` registry for function-like LLM calls.
- Added APIs:
  - `registerLLMFunction(...)`
  - `invokeLLMFunction(name, ...args)`
- Retry budgets are split:
  - compile/policy/install retry budget
  - runtime retry budget
  - review retry budget
- Runtime errors from AI code can trigger a review-and-repair cycle before next retry.
- `self.llmFunctions` and `self.createLLMFunction(...)` are passed into sandbox code paths.

