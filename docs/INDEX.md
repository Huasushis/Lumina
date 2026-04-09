# Lumina Documentation Index

This documentation set is designed to be **source-to-doc one-to-one** and detailed enough to rebuild the project from docs only.

## 1) Source ↔ Documentation Mapping

| Source file | Documentation file | Purpose |
|---|---|---|
| `src/types.ts` | `docs/src.types.ts.md` | Core contracts and runtime types |
| `src/DebugSink.ts` | `docs/src.DebugSink.ts.md` | Debug event system and sinks |
| `src/SkillBuilder.ts` | `docs/src.SkillBuilder.ts.md` | Declarative skill and knowledge helpers |
| `src/LLMFunction.ts` | `docs/src.LLMFunction.ts.md` | Function-like LLM invocation helper |
| `src/LLMProvider.ts` | `docs/src.LLMProvider.ts.md` | LLM adapter and prompt/runtime contract |
| `src/LuminaContext.ts` | `docs/src.LuminaContext.ts.md` | Main execution loop and orchestration |
| `src/Sandbox.ts` | `docs/src.Sandbox.ts.md` | VM-based isolated code execution |
| `src/skills/default/executable.ts` | `docs/src.skills.default.executable.ts.md` | Built-in executable skill groups |
| `src/skills/default/knowledge.ts` | `docs/src.skills.default.knowledge.ts.md` | Built-in knowledge-only skill groups |
| `src/skills/default/index.ts` | `docs/src.skills.default.index.ts.md` | Default skill loader and split helpers |
| `src/skills/index.ts` | `docs/src.skills.index.ts.md` | Skills module barrel export |
| `src/index.ts` | `docs/src.index.ts.md` | Public export surface |

## 2) Recommended Reading Order

1. `docs/src.types.ts.md`
2. `docs/src.DebugSink.ts.md`
3. `docs/src.SkillBuilder.ts.md`
4. `docs/src.LLMFunction.ts.md`
5. `docs/src.skills.default.executable.ts.md`
6. `docs/src.skills.default.knowledge.ts.md`
7. `docs/src.skills.default.index.ts.md`
8. `docs/src.LLMProvider.ts.md`
9. `docs/src.Sandbox.ts.md`
10. `docs/src.LuminaContext.ts.md`
11. `docs/src.index.ts.md`

## 3) Rebuild-from-docs Checklist

Use this section if you need to recreate the project from scratch with only docs.

### Step A — Bootstrap project

1. Create `package.json` with ESM TypeScript setup.
2. Install dependencies:
   - runtime: `openai`
   - dev: `typescript`, `ts-node`, `tsx`, `@types/node`
3. Create `tsconfig.json`:
   - `target: ES2022`
   - `module/moduleResolution: NodeNext`
   - `rootDir: ./src`, `outDir: ./dist`

### Step B — Implement core contracts

Create `src/types.ts` exactly per `docs/src.types.ts.md`.

### Step C — Implement debug infrastructure

Create `src/DebugSink.ts` exactly per `docs/src.DebugSink.ts.md`.

### Step D — Implement runtime modules

1. `src/LLMProvider.ts`
2. `src/Sandbox.ts`
3. `src/LuminaContext.ts`
4. `src/index.ts`

Use each corresponding doc file for method-by-method behavior.

### Step E — Verify

Run:

```bash
pnpm build
npx tsx examples/demo.ts
```

Expected behavior:

- Return mode succeeds (`Result: 2` in demo)
- Eval mode succeeds (`sum: 579`)
- Clone isolation works (`0` vs `999`)
- Exported function mode works (`384400`)

## 4) Runtime Architecture Summary

```text
User Task -> LuminaContext.call()
          -> LLMProvider.generate()
          -> intent == return ? value
                           : Sandbox.runCode(code)
          -> success or retry with error feedback
```

With debug mode enabled, all major transitions emit structured debug events.

## 5) Debug Event Coverage (Current)

- Context lifecycle: call start / attempt / intent / return / eval success / retry / failure
- Provider lifecycle: generate start / raw response / parse success / parse error
- Sandbox lifecycle: execute start / success / error

## 6) Related Artifacts

- Project guide: `README.md`
- Weekly report slides: `report/2026-04-09.typ`

