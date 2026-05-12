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
lumina build --agent claude_code
python .lumina/build/main.py
```

```
> GameUI.submit_guess {"value": 50}
Hint: higher
Attempts: 1/10
> GameUI.submit_guess {"value": 75}
Hint: lower
...
```

---

## Daemon Service (TypeScript)

Background task queue with start/stop/status commands.

```bash
cd examples/ts-daemon
lumina build --agent claude_code
npx tsx .lumina/build/main.ts
```
