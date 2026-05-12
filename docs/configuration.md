# Configuration

## Lumina.toml

```toml
[project]
name = "my-project"
language = "python"          # target language for generated code

[build]
mode = "monolith"            # "monolith" | "microservice"
agent = "llm"                # "llm" | "claude_code"
assemble = ""                # optional: natural-language assembly hint

[modules.CriticalModule]
test = true                  # enable auto-test (Claude Code only)
```

### `language`

Target language for generated code: `python`, `typescript`, `cpp`, `go`, etc. The AI uses this to produce idiomatic code.

### `agent`

- `llm`: OpenAI-compatible API. Needs `OPENAI_API_KEY` env var.
- `claude_code`: Local Claude Code CLI. Needs `claude` in PATH.

CLI flag `--agent` overrides this.

### `mode`

- `monolith`: all actors in one process, in-memory routing
- `microservice`: each actor is its own service

### `assemble`

Optional natural-language instruction for the final assembly step. When set, the instruction is appended to the system assembly prompt. Use for custom entry point behavior:

```toml
assemble = "生成一个 HTTP 服务器，/chat 路由读取 POST body 并返回流式响应"
```

When not set, the default prompt tells AI to generate a minimal main entry point that instantiates all actors and calls `run()`.

### `modules.<Name>.test`

Enable automatic test generation + execution for a specific module. Only works with `agent = "claude_code"` (LLM has no execution capability).

## Agent Credentials

API keys are **never** stored in `Lumina.toml`. They live in environment variables.

### LLM

```bash
export OPENAI_API_KEY=sk-xxx          # required
export OPENAI_API_BASE=https://...    # optional: custom endpoint
```

### Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Optional overrides for non-standard installs:

```bash
export CLAUDE_CODE_PATH=/path/to/claude
export CLAUDE_CODE_GIT_BASH_PATH=/path/to/bash   # Windows only
```

## CLI Reference

```bash
lumina init <name>                       # Create project
lumina init <name> --path <parent>       # In specific parent directory

lumina build                             # Build with agent from Lumina.toml
lumina build --agent claude_code         # Override agent
lumina build --dry-run                   # Parse + show Task JSON, no AI
lumina build --force                     # Skip cache, rebuild all
lumina build --only Module1,Module2      # Rebuild specific modules only
lumina build --mode microservice         # Microservice mode

lumina parse <file.lm>                   # Show AST
lumina parse <file.lm> --format json     # Show Task JSON

lumina --version                         # Show version
```
