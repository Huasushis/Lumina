# Lumina

Lumina is a lightweight TypeScript agent runtime focused on two function types only:

1. **TS function** (your native function)
2. **AI function** (model-backed function via `defineLLMFunction`)

No function store. No built-in skill filter pipeline. No generated-code persistence.

## What this runtime does

- `call(...)` supports dual intent:
  - `return`: model returns final value directly
  - `eval`: model returns TypeScript code, executed in sandbox
- AI function call keeps a two-step flow on each invocation:
  - mode negotiation (`return` or `code`)
  - execute selected mode
- Retry/error mechanism remains for compile/runtime/review paths.

## Core idea for TS functions

Define a normal TypeScript function, and Lumina automatically appends a final `llmContext` parameter at runtime:

- `history`
- `skills`
- `provider`

So you can write your business args cleanly and still access LLM runtime context when needed.

## Installation

```bash
pnpm install
```

## Environment

Create `.env`:

```env
DASHSCOPE_API_KEY=your_dashscope_api_key_here
```

## Provider options

```ts
new AliYunBailianProvider({
  model: 'qwen-plus',
  enableThinking: false,
  additionalModelParams: {
    temperature: 0.2
  }
})
```

- `enableThinking`: thinking switch
- `additionalModelParams`: passthrough params to model request

## Minimal usage

```ts
import {
  AliYunBailianProvider,
  defineLLMFunction,
  LuminaContext,
  TSFunctionLLMContext
} from './src/index.js';

const provider = new AliYunBailianProvider({ model: 'qwen-plus' });
const ctx = new LuminaContext(provider, {}, new Map(), [], { maxRetries: 3 });

// 1) TS function: auto append llmContext at runtime
const addWithContext = ctx.defineTSFunction(
  'addWithContext',
  async (a: number, b: number, llmContext: TSFunctionLLMContext) => {
    return {
      sum: a + b,
      historyLength: llmContext.history.length
    };
  },
  {
    description: 'Add two numbers',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b']
    }
  }
);

// 2) AI function: mode negotiation per call (return/code)
const summarize = defineLLMFunction<[string], unknown>(ctx, {
  name: 'summarize',
  description: 'Summarize report text',
  parameters: {
    type: 'object',
    properties: {
      report: { type: 'string' }
    },
    required: ['report']
  }
});

const tsResult = await addWithContext(1, 2);
const aiResult = await summarize('incident report text');

console.log(tsResult, aiResult);
```

## Standalone selector skill (optional)

Selector is a normal skill, not a built-in Context pipeline.

```ts
import { createSkillSelectorSkill } from './src/index.js';

const selector = createSkillSelectorSkill(Array.from(ctx.skills.values()));
ctx.injectSkill(selector);

const selected = await selector.execute({
  query: 'need math and current time',
  topN: 3
});
```

## Scripts

```bash
pnpm build
npx tsx examples/demo.ts
npx tsx examples/llm-function-basic.ts
npx tsx examples/default-skills.ts
```

## Notes

- AI generated code is not persisted.
- AI generated code is regenerated per invocation in code mode.
- Selector remains explicit and user-controlled.

## License

MIT
