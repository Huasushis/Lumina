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
- `SkillMetadata`
- `ExecutableSkill`
- `KnowledgeSkill`
- `Skill`
- `AnySkill`
- `isKnowledgeSkill(...)`
- `isExecutableSkill(...)`
- `LuminaSandboxConfig`
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

### Skill contracts

```ts
interface ExecutableSkill {
  kind?: 'executable';
  name: string;
  description: string;
  parameters: object;
  execute: (...args: any[]) => Promise<any> | any;
}

interface KnowledgeSkill {
  kind: 'knowledge';
  name: string;
  description: string;
  content: string;
}

type Skill = ExecutableSkill; // backward-compatible alias
type AnySkill = ExecutableSkill | KnowledgeSkill;
```

`parameters` is a JSON-schema-like structure for executable tools. Knowledge skills are prompt-only and not callable.

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
    skills: AnySkill[],
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
3. Ensure `LuminaConfig` includes `debug?: DebugConfig` and `sandbox?: LuminaSandboxConfig`.

## Common Mistakes

- Forgetting optional `debugContext` in `ILLMProvider.generate`.
- Returning malformed `LLMResponse` shape from provider.
- Using incompatible `role` values in `Message`.

## V2 Runtime Additions

- Import policy contract:
  - `ImportPolicy = 'deny' | 'allowlist' | 'all'`
  - configured under `LuminaSandboxConfig`
- Auto-install support for missing packages:
  - `autoInstallMissingPackages`
  - `installProvider` / `packageRegistry`
- Split retry policy:
  - `retry.maxCompileRetries`
  - `retry.maxRuntimeRetries`
  - `retry.maxReviewRetries`
- Function-like LLM runtime contracts:
  - `LLMFunctionConfig`
  - `RegisteredLLMFunction`
  - `LLMFunctionMode`
- Structured error envelope:
  - `LLMErrorEnvelope` + `isLuminaErrorEnvelope(...)`

