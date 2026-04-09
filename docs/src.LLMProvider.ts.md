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
  skills: Skill[],
  debugContext?: DebugRuntimeContext
): Promise<ProviderResponse>
```

### Internal Flow

1. Emit `provider.generate.start` debug event.
2. Format skill list into text block for prompt injection.
3. Build strict system instruction requiring one of:
   - `{"intent":"return","value":...}`
   - `{"intent":"eval","code":"..."}`
4. Send request via `client.chat.completions.create(...)`.
5. Emit `provider.response.raw` event.
6. Parse `choices[0].message.content` as JSON.
7. Emit `provider.response.parsed` on success.
8. Emit `provider.response.parse_error` and throw on failure.
9. Return parsed message + usage.

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

- Prompt currently asks for JavaScript-style code in eval mode.
- Skill descriptions are plain text; no advanced schema-to-prompt conversion yet.

