# Getting Started

## Installation

```bash
pip install lumina-lang
```

## First Project

```bash
# Create a new project
lumina init my-project
cd my-project

# See what it generated
ls src/
# main.lm   types.lm
```

## Building

### Dry-run (no AI, just parse and show Task JSON)

```bash
lumina build --dry-run
```

### With LLM agent (OpenAI API)

```bash
export OPENAI_API_KEY=sk-xxx
lumina build --agent llm
```

### With Claude Code (local, supports testing)

```bash
npm install -g @anthropic-ai/claude-code
lumina build --agent claude_code
```

On Windows, Claude Code needs git-bash. Set `CLAUDE_CODE_GIT_BASH_PATH` if not in PATH.

### Force rebuild (ignore cache)

```bash
lumina build --force --agent claude_code
```

## Running

```bash
# Python
python .lumina/build/main.py

# TypeScript
npx tsx .lumina/build/main.ts
```

The generated entry point includes an interactive REPL. Type `Actor.method {"key": "value"}` to call actors.

## Version

```bash
lumina --version
```
