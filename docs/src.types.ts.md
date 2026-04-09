# `src/types.ts`

Core type contracts for the simplified Lumina runtime.

## Key responsibilities

- Message/history types
- Skill union types (executable + knowledge)
- Provider request/response contracts
- Runtime config (`LuminaConfig`)
- AI function registration types (`LLMFunctionConfig`, `RegisteredLLMFunction`)

## Important points

### Skills

- `ExecutableSkill`: callable by sandbox (`self.skills.*`)
- `KnowledgeSkill`: prompt-only guidance (not callable)
- `AnySkill = ExecutableSkill | KnowledgeSkill`

### Runtime config

`LuminaConfig` now keeps only runtime essentials:

- `maxRetries`
- `retry` (compile/runtime/review budgets)
- `debug`
- `sandbox`

No built-in persistence config, and no built-in internal skill-filter config.

### AI function config

`LLMFunctionConfig` contains:

- `name`, `description`, `parameters`
- `preferredMode?: 'return' | 'code'`
- `maxParameterBytes?`
- `adaptiveParameterBytes?`
- `adaptiveParameterBytesMax?`

No code-cache or persistence fields.

### Error envelope

`LLMErrorEnvelope` + `isLuminaErrorEnvelope(...)` are used to normalize model/tool errors.

## Provider contract

```ts
generate(
  history: Message[],
  skills: AnySkill[],
  debugContext?: DebugRuntimeContext
): Promise<ProviderResponse>
```

Provider must return a valid `LLMResponse`:

- `{ intent: 'return', value: ... }`
- `{ intent: 'eval', code: '...' }`
