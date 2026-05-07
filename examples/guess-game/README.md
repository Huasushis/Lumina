# Guess Game — Lumina Example

Two-actor number guessing game: `DecisionEngine` generates a secret number and evaluates guesses, `GameUI` handles user I/O.

## Build

```bash
cd examples/guess-game
lumina build --agent claude_code
```

## Run

```bash
python .lumina/build/main.py
```

Then call `invoke()` on actors via the runtime, or write a small test script.

## Architecture

```
GameUI ──send_message──▶ DecisionEngine
  │                         │
  submit_guess(value)       guess({value, attempt})
  new_game(config)          reset({min, max, max_attempts})
```
