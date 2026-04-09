# `src/skills/default/knowledge.ts`

Built-in knowledge-only skill groups (non-executable).

## Groups

- `tsSandbox`
  - Guidance for writing TypeScript eval code in Lumina sandbox.
- `recursive`
  - Guidance for clone/create based recursive orchestration.
- `errors`
  - Structured error-envelope guidance for return/code throw handling.

## Notes

- Knowledge skills are injected into provider context.
- They are not exposed through `self.skills.*` in sandbox runtime.
