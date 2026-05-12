# Configuration

## Lumina.toml

Place at project root. Created automatically by `lumina init`.

```toml
[project]
name = "my-project"
language = "python"          # "python" | "typescript" | "cpp" | ...

[build]
mode = "monolith"            # "monolith" | "microservice"
assemble = ""                # optional: natural-language custom assembly

# Per-module test overrides (Claude Code agent only)
[modules.MyModule]
test = true
```

### `language`

Target language for generated code. The AI agent uses this to produce idiomatic code. Common values: `python`, `typescript`, `cpp`, `java`, `go`, `rust`.

### `mode`

- `monolith`: all actors in one process, in-memory message routing
- `microservice`: each actor in its own process, network communication

### `assemble`

Optional natural-language instruction for the system assembly step:

```toml
assemble = "生成一个 CLI 工具，支持 start/stop/status 命令作为后台服务"
```

When empty, the AI generates a default REPL entry point.

## Agent Configuration

Agent credentials use environment variables. They are NEVER stored in Lumina.toml.

### LLM agent

```bash
export OPENAI_API_KEY=sk-xxx          # required
export OPENAI_API_BASE=https://...    # optional, for custom endpoints
export LUMINA_MODEL=gpt-4o            # optional, model override
```

### Claude Code agent

```bash
npm install -g @anthropic-ai/claude-code
```

Optional overrides:

```bash
export CLAUDE_CODE_PATH=/path/to/claude        # if not in PATH
export CLAUDE_CODE_GIT_BASH_PATH=/path/to/bash # Windows: git-bash location
```

## CLI Reference

```bash
lumina init <name>                     # Create project
lumina init <name> --path <parent>     # Create in specific parent directory

lumina build                           # Build with default agent (llm)
lumina build --agent claude_code       # Use Claude Code
lumina build --agent llm               # Use LLM API
lumina build --dry-run                 # Parse + show Task JSON, no AI
lumina build --force                   # Skip cache, rebuild all
lumina build --mode microservice       # Microservice mode

lumina parse <file.lm>                 # Show AST
lumina parse <file.lm> --format json   # Show Task JSON
lumina --version                       # Show version
```
