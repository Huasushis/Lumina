# `src/LLMFunction.ts`

Function-like wrapper APIs for LLM calls.

## Exports

- `defineLLMFunction(context, config)`
- `registerLLMFunction(context, config)`
- `LLMFunctionCallable`

## Behavior

- Returns a callable `(...args) => Promise<any>` function.
- Delegates registration and invocation to `LuminaContext`.
- Supports normal function call ergonomics while preserving runtime orchestration in context.

## Notes

- First-call mode negotiation and code caching are handled in `LuminaContext`.
- This module is intentionally thin and only provides convenience wrappers.
