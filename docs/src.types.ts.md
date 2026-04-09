# `src/types.ts`

This file defines all type contracts across Lumina.

## Responsibilities

- Define message and skill structures.
- Define dual-intent model output (`return` vs `eval`).
- Define provider interface contract.
- Define debug event/logging contracts.
- Define runtime config shape (`LuminaConfig`).

## Exports

- `Message`
- `DebugLevel`
- `DebugEvent`
- `DebugSink`
- `DebugLoggerLike`
- `DebugConfig`
- `DebugRuntimeContext`
- `Skill`
- `LuminaConfig`
- `LLMResponse`
- `ProviderResponse`
- `ILLMProvider`

## Contract Details

### `Message`

```ts
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

Used as conversation history between context and provider.

### `Skill`

```ts
interface Skill {
  name: string;
  description: string;
  parameters: object;
  execute: (...args: any[]) => Promise<any> | any;
}
```

`parameters` is a JSON-schema-like structure used to teach the model how to call the skill.

### `LLMResponse`

```ts
type LLMResponse =
  | { intent: 'return'; value: any }
  | { intent: 'eval'; code: string };
```

This is the **core protocol** used by `LuminaContext.call()`.

### `ILLMProvider`

```ts
interface ILLMProvider {
  generate(
    history: Message[],
    skills: Skill[],
    debugContext?: DebugRuntimeContext
  ): Promise<ProviderResponse>;
}
```

Any provider implementation must output a valid `ProviderResponse` with `message` matching `LLMResponse`.

### Debug-related Contracts

- `DebugEvent`: normalized event shape
- `DebugSink`: sink abstraction
- `DebugLoggerLike`: logger abstraction
- `DebugConfig`: runtime debug options
- `DebugRuntimeContext`: per-call debug context (`callId + logger`)

## How Other Files Depend on This

- `LLMProvider.ts` uses `Message`, `Skill`, `ProviderResponse`, `DebugRuntimeContext`.
- `LuminaContext.ts` uses `ILLMProvider`, `LuminaConfig`, `Message`, `Skill`.
- `Sandbox.ts` uses `Skill`, `DebugRuntimeContext`.
- `DebugSink.ts` uses all debug contracts.

## Rebuild Checklist

1. Recreate all interfaces/types exactly.
2. Keep `ILLMProvider.generate(...)` signature synchronized with provider implementations.
3. Ensure `LuminaConfig` includes `debug?: DebugConfig`.

## Common Mistakes

- Forgetting optional `debugContext` in `ILLMProvider.generate`.
- Returning malformed `LLMResponse` shape from provider.
- Using incompatible `role` values in `Message`.

