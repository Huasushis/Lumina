# Getting Started

## Installation

```bash
pip install lumina-lang
```

Verify:

```bash
lumina --version
```

## First Project

```bash
lumina init my-project
cd my-project
```

Generated structure:

```
my-project/
├── Lumina.toml
├── src/
│   ├── main.lm
│   └── types.lm
└── .gitignore
```

## Build

Edit `Lumina.toml` to set the agent:

```toml
[build]
agent = "claude_code"   # or "llm"
```

Then:

```bash
lumina build                 # use agent from Lumina.toml
lumina build --agent llm     # override agent for this build
lumina build --dry-run       # parse + show Task JSON, no AI
lumina build --force         # skip cache, rebuild all
lumina build --only Foo,Bar  # only rebuild specific modules
```

### Agent Setup

**LLM** — needs `OPENAI_API_KEY`:

```bash
export OPENAI_API_KEY=sk-xxx
```

**Claude Code** — needs `claude` CLI:

```bash
npm install -g @anthropic-ai/claude-code
```

On Windows, Claude Code also needs git-bash:

```bash
export CLAUDE_CODE_GIT_BASH_PATH="C:/Program Files/Git/bin/bash.exe"
```

## Run

After build, `main.py` (or `main.ts`) is in `.lumina/build/`:

```bash
python .lumina/build/main.py
```

## Project Structure

```
my-project/
├── Lumina.toml           # project config (name, language, agent)
├── src/
│   ├── main.lm           # entry point
│   └── types.lm          # shared types
├── .lumina.lock          # build cache (commit this)
├── .lumina/
│   └── build/
│       ├── ModuleA/      # each module in its own subdir
│       ├── ModuleB/
│       └── main.py       # auto-generated entry point
└── .gitignore
```
