# Examples

All examples are in the `examples/` directory. Each is a complete Lumina project.

## Guess Game (Python)

Two actors: `DecisionEngine` generates a random number, `GameUI` handles user I/O.

### Project structure

```
guess-game/
├── Lumina.toml
└── src/
    ├── types.lm
    ├── decision.lm
    └── main.lm
```

### types.lm

```rust
type GuessResult = {
    "hint": String("higher | lower | correct"),
    "attempts": Int("total guesses so far"),
    "max_attempts": Int("attempt limit"),
    "won": Bool
}
```

### decision.lm

```rust
module DecisionEngine {
    setup: "generate random secret number 1-100, set max_attempts=10"

    interface: {
        "guess": { "guess": { "value": Int } } -> { "result": GuessResult }
        "reset": { "config": { "min": Int, "max": Int, "max_attempts": Int } } -> { "ok": String }
    }

    logic: "compare guess to secret. return higher/lower/correct hint. track attempts. reject if over max_attempts"
}
```

### main.lm

```rust
import "types.lm" as t
import "decision.lm" as d

module GameUI {
    actor engine: d.DecisionEngine

    setup: "start game with default config, print welcome message"

    interface: {
        "submit_guess": { "value": Int } -> { "result": t.GuessResult }
        "new_game": { "config": { "min": Int, "max": Int, "max_attempts": Int } } -> { "ok": String }
    }

    logic: "receive guess from user, send to engine.guess, display hint. if won, congratulate. if lost, reveal answer"
}
```

### Build and run

```bash
cd examples/guess-game
lumina build
python .lumina/build/main.py
```

```
Enter your guess (1-100, q=quit, n=new game): 50
Hint: lower
Enter your guess (1-100, q=quit, n=new game): 25
Hint: higher
Enter your guess (1-100, q=quit, n=new game): q
Goodbye!
```

---

## Daemon Service (TypeScript)

Background task queue with foreground mode and start/stop/status commands.

### main.lm

```rust
module TaskManager {
    setup: "initialize empty task queue in memory"

    interface: {
        "submit": { "payload": String, "priority": Int } -> { "id": String }
        "list": { } -> { "tasks": List<Map<String, Map<String, String>>> }
        "remove": { "id": String } -> { "ok": String }
    }

    logic: "in-memory priority queue with auto-generated UUIDs"
}
```

### Lumina.toml

```toml
[project]
name = "ts-daemon"
language = "typescript"

[build]
mode = "monolith"
agent = "claude_code"
assemble = "生成一个后台服务。支持命令行参数 start/stop/status..."
```

### Build and run

```bash
cd examples/ts-daemon
lumina build

# Foreground mode (interactive stdin)
node --experimental-strip-types .lumina/build/daemon.mts

# Daemon mode
node --experimental-strip-types .lumina/build/daemon.mts start
node --experimental-strip-types .lumina/build/daemon.mts status
node --experimental-strip-types .lumina/build/daemon.mts stop
```

```
> submit {"payload":"hello","priority":3}
Task submitted: a27f3cde-f74b-4fa1-bbd0-e4745b004414
> list
2 task(s):
  1. [a27f3cde] pri=3 hello
> quit
```

---

## Microservice Mode

`mode = "microservice"` is implemented but not yet tested end-to-end. It should generate per-actor Dockerfiles and a `docker-compose.yml`. If you have Docker installed and want to help, please test it and open an issue!
