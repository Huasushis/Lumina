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

- Return/code negotiation is handled in `LuminaContext` at invocation time.
- No function-store persistence is used in current runtime design.
- This module is intentionally thin and only provides convenience wrappers.
