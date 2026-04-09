# `src/LLMProvider.ts`

This file implements the default model adapter: `AliYunBailianProvider`.

## Responsibilities

- Connect to DashScope via OpenAI-compatible API.
- Build system prompt and merge conversation history.
- Enforce JSON-formatted model output.
- Parse model output into Lumina's `LLMResponse` protocol.
- Emit provider-level debug events.

## Constructor

```ts
new AliYunBailianProvider({ model?, enableThinking? })
```

- `model` default: `qwen-plus`
- `enableThinking` default: `false`
- Requires `process.env.DASHSCOPE_API_KEY`

If API key is missing, constructor throws immediately.

## `generate(...)` Contract

```ts
generate(
  history: Message[],
  skills: AnySkill[],
  debugContext?: DebugRuntimeContext
): Promise<ProviderResponse>
```

### Internal Flow

1. Emit `provider.generate.start` debug event.
2. Split skills into executable tools and knowledge-only guidance.
3. Format executable tool list and knowledge context separately for prompt injection.
4. Build strict system instruction requiring one of:
   - `{"intent":"return","value":...}`
   - `{"intent":"eval","code":"..."}`
5. Request TypeScript code for eval mode and enforce no `import/export/require` policy.
6. Send request via `client.chat.completions.create(...)`.
7. Emit `provider.response.raw` event.
8. Parse `choices[0].message.content` as JSON.
9. Emit `provider.response.parsed` on success.
10. Emit `provider.response.parse_error` and throw on failure.
11. Return parsed message + usage.

## Debug Events

- `provider.generate.start`
- `provider.response.raw`
- `provider.response.parsed`
- `provider.response.parse_error`

## Rebuild Checklist

1. Keep constructor API key guard.
2. Keep strict response format requirement (`json_object`).
3. Keep parsing failure behavior explicit and fatal.
4. Preserve optional DashScope-specific param `enable_thinking`.
5. Keep debug event emission non-intrusive.

## Known Limitations

- Skill schema injection is still text-based (no full schema compiler yet).

## V2 Runtime Notes

- Provider prompt now treats import/require as policy-driven (not hardcoded deny).
- Prompt includes structured error-envelope convention for return/code paths.
- Prompt acknowledges `self.llmFunctions.*` when available in runtime context.

