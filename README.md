# Lumina

**Actor Model architecture language for the AI era.**

Define your system as a set of actors that communicate through JSON messages. Each actor is a black box — you describe *what* it does in natural language, and AI agents implement *how* it works. The compiler wires everything together.

```
.lm source  →  LMC compiler  →  AI agents  →  working code
                     (parser)       (LLM / Claude)   (Python monolith or Docker microservices)
```

---

## Why Lumina?

AI is great at writing isolated functions with clear contracts. AI fails when it has to understand global system topology, complex control flow, and implicit dependencies.

**Lumina solves this**: every module is an independent actor with exactly two entry points — `run()` and `invoke()`. The AI only needs to satisfy a JSON interface contract. It never sees the global system. The compiler handles wiring, message routing, and deployment.

> *Erlang OTP architecture × LLM code generation.*

---

## Quick Example

```rust
// types.lm — shared type definitions
type DataPacket = {
    "id": Int("unique timestamp ID"),
    "payload": List<Float>("sequence of floats to process")
}("standard data stream packet")

// worker.lm — an actor module
import "types.lm" as t

module Sorter {
    setup: "allocate a memory pool for high-frequency sorting"

    interface: {
        "do_sort": { "raw": t.DataPacket } -> { "sorted": t.DataPacket }
    }

    logic: "implement a non-recursive quicksort on payload, keep id unchanged"
}

// main.lm — system composition
import "worker.lm" as worker

module Controller {
    actor sorter: worker.Sorter

    setup: "start a background coroutine that generates 100 random floats every second"

    logic: "pipe generated DataPackets to sorter.do_sort, output sorted results"
}
```

Every string in `()` is **not a comment** — it's a first-class semantic description that gets compiled into the Task JSON sent to AI agents.

---

## Quick Start

```bash
# Install
pip install lumina-lang

# Create a project
lumina init hello-world
cd hello-world

# See what will be generated
lumina build --dry-run

# Build with LLM agent (needs OPENAI_API_KEY)
lumina build

# Build with Claude Code (needs claude CLI)
lumina build --agent claude_code
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Language Reference](docs/language.md) — complete syntax with examples
- [Configuration](docs/configuration.md) — Lumina.toml, agents, CLI
- [Examples](docs/examples.md) — walkthrough of example projects

## Project Structure

```
my-project/
├── Lumina.toml         # project manifest
├── src/
│   ├── main.lm     # entry point
│   └── types.lm    # shared types
├── .lm/            # build cache (gitignored)
└── .gitignore
```

---

## Key Features

- **Semantic Types**: types carry natural-language descriptions that AI agents use as context. Not comments — compiler-verified metadata.
- **Actor Modules**: every module is an isolated actor with `run()` + `invoke()`. No shared state, no global imports.
- **Pluggable AI Backends**: use OpenAI-compatible LLMs for generation, or Claude Code CLI for generation + automated testing.
- **Per-Module Testing**: enable `test = true` for specific modules in `Lumina.toml`. The agent generates and runs tests.
- **Dual Build Modes**: `monolith` produces a single process with in-memory message routing. `microservice` generates Dockerfiles and `docker-compose.yml`.
- **Incremental Builds**: unchanged modules are cached and skipped.

---

## Agent Configuration

Agent settings live in environment variables, not in the project manifest:

```bash
export LUMINA_AGENT=llm              # "llm" (default) or "claude_code"
export OPENAI_API_KEY=sk-xxx         # for LLM agent
export LUMINA_MODEL=gpt-4o           # optional model override
```

Per-module testing in `Lumina.toml`:

```toml
[modules.Sorter]
test = true   # Claude Code agent will generate + run tests for this module
```

---

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│ .lm     │ ──► │ LMC Parser   │ ──► │ Task JSON   │ ──► │ AI Agent │
│ source      │     │ (Lark EBNF)  │     │ (per actor) │     │ (LLM/CC) │
└─────────────┘     └──────────────┘     └─────────────┘     └─────┬────┘
                                                                   │
                                                              generated code
                                                                   │
                                              ┌────────────────────┘
                                              ▼
┌──────────┐     ┌──────────────┐
│ Output   │ ◄── │ LMC Builder  │
│ ./build  │     │ mono/micro   │
└──────────┘     └──────────────┘
```

---

## Status

**Pre-release.** The compiler pipeline is implemented (parser, analyzer, task generator, agent backends, builders). CLI commands `init`, `build`, `parse` are functional. SDK base classes and runtime are in progress.

---

## License

MIT
