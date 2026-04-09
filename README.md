# Lumina

A lightweight TypeScript framework for building AI-driven agents with a dual execution model:

- **Return mode**: the model returns a final value directly.
- **Eval mode**: the model generates code that runs inside a sandbox.

Lumina is designed to reduce agent development complexity by unifying context, tools, and execution flow in one minimal runtime.

## Why Lumina

Modern agent stacks are often hard to reason about:

- Prompt logic and tool logic are tightly coupled.
- Runtime behavior is hard to inspect and replay.
- State/memory handling can become fragile in multi-step tasks.

Lumina addresses this with:

- A clear, explicit execution loop.
- Isolated sandbox execution (`node:vm`).
- Cloneable context with memory isolation.
- Retry-on-failure semantics for generated code.

## Project Structure

```text
Lumina/
├─ src/
│  ├─ types.ts          # Core contracts (Message, Skill, LLMResponse, Provider)
│  ├─ DebugSink.ts       # Debug logger and sink implementations
│  ├─ LLMProvider.ts    # DashScope/OpenAI-compatible provider adapter
│  ├─ LuminaContext.ts  # Core orchestration loop (return/eval + retry)
│  ├─ Sandbox.ts        # Isolated code execution runtime
│  └─ index.ts          # Public exports
├─ examples/
│  ├─ demo.ts           # End-to-end demo (live provider)
│  └─ debug-local.ts    # Local mock demo with debug logs
├─ docs/
│  ├─ INDEX.md          # Source-to-doc mapping entry
│  └─ src.*.md          # One-to-one documentation for each src file
├─ report/
│  └─ 2026-04-09.typ    # Weekly PPT report
└─ reference/           # Local design notes (git-ignored)
```

## Prerequisites

- Node.js 18+
- pnpm
- DashScope API key (for live LLM calls)

## Installation

```bash
pnpm install
```

## Environment Setup

Lumina uses `DASHSCOPE_API_KEY`.

A local placeholder `.env` is included:

```env
DASHSCOPE_API_KEY=your_dashscope_api_key_here
```

> Important: never commit real secrets.

## Scripts

```bash
pnpm build   # TypeScript compile
pnpm dev     # Run src/index.ts in dev mode
pnpm start   # Run built output
```

## Quick Example

```ts
import { AliYunBailianProvider, LuminaContext } from "./src/index.js";

const provider = new AliYunBailianProvider({ model: "qwen-plus" });
const ctx = new LuminaContext(provider, {}, new Map(), [], { maxRetries: 3 });

const answer = await ctx.call("Tell me what 1+1 is.");
console.log(answer);
```

## Running the End-to-End Demo

```bash
npx tsx examples/demo.ts
```

## Running a Local Debug Demo (No External API)

```bash
npx tsx examples/debug-local.ts
```

Example real output (from a recent run):

```text
====== Lumina Demo Start ======
--- Test 1: Return 模式 (直接问答) ---
Result: 2
✓ Test 1 Passed

--- Test 2: Eval 模式 (调用 skill) ---
Result: {
  "sum": 579,
  "time": "2026-04-09T10:32:22.750Z"
}
✓ Test 2 Passed

--- Test 3: Context Clone 隔离 ---
Parent memory.counter: 0
Child  memory.counter: 999
✓ Test 3 Passed (memory isolation confirmed)

--- Test 4: exportAsFunction ---
Result: 384400
✓ Test 4 Passed
====== Lumina Demo End ======
```

## Core Concepts

### `LuminaContext`

The heart of the framework:

- Holds `memory`, `skills`, `history`, `provider`, and `config`.
- Executes user tasks via `call(taskDescription)`.
- Supports `clone()` and `create()` for context branching.

### `Skill`

A callable unit injected into context:

- Name + description + JSON schema-like parameters
- Runtime implementation via `execute(...)`

### `Sandbox`

Generated code runs in an isolated VM context with:

- `self.memory`
- `self.skills`
- `self.clone()`
- `self.create(prompt)`
- `self.sleep(ms)`

### Provider Adapter

`AliYunBailianProvider` uses OpenAI-compatible SDK calls with DashScope base URL.

## Debug Mode

Lumina includes a configurable debug mode for contributor observability. It captures:

- Raw model outputs
- Parsed intent decisions
- Sandbox code and execution results
- Retry/error chains

It supports console/file/memory sinks.

Example:

```ts
import { AliYunBailianProvider, LuminaContext } from "./src/index.js";

const provider = new AliYunBailianProvider({ model: "qwen-plus" });
const ctx = new LuminaContext(provider, {}, new Map(), [], {
  maxRetries: 3,
  debug: {
    enabled: true,
    level: "debug",
    filePath: "./logs/lumina-debug.jsonl",
    mirrorToConsole: true,
    memoryLimit: 200
  }
});

await ctx.call("Please solve 1+1 and explain your steps.");
```

### Source-to-doc Mapping

For review and reconstruction, every source file has a corresponding doc file under `docs/`.

Start here:

- `docs/INDEX.md`

## Roadmap

- Add declarative skill/function definitions
- Add more examples for recursive contexts and knowledge-only skill injection

## License

MIT
