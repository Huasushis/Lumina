# `src/Sandbox.ts`

This file provides isolated execution for model-generated code.

## Responsibilities

- Execute eval-mode code using `node:vm`.
- Deep-copy memory before execution.
- Bind context skills into callable sandbox functions.
- Inject controlled `self` API (`memory`, `skills`, `clone`, `create`, `sleep`).
- Emit sandbox-level debug events.

## Public API

```ts
Sandbox.runCode(
  code: string,
  memory: Record<string, any>,
  skills: Map<string, Skill>,
  contextMethods: { clone: () => Promise<any>; create: (prompt: string) => Promise<any>; },
  debugContext?: DebugRuntimeContext
): Promise<any>
```

## Runtime Steps

1. Emit `sandbox.execute.start`.
2. Clone memory to `sandboxMemory`.
3. Build `sandboxSkills` wrappers from `Skill.execute`.
4. Build VM context:
   - `self.memory`
   - `self.skills`
   - `self.clone`
   - `self.create`
   - `self.sleep(ms)`
   - sandboxed console wrappers
5. Wrap code in async IIFE:

```js
(async () => {
  // generated code
})()
```

6. Run script with timeout (`30000ms`).
7. Emit success/error debug events.
8. Return result or throw wrapped sandbox error.

## Debug Events

- `sandbox.execute.start`
- `sandbox.execute.success`
- `sandbox.execute.error`

## Security Boundary Notes

- Uses VM context isolation, but this is not a full security sandbox for hostile untrusted code.
- No explicit `require` is injected into context.
- Exposed capabilities are intentionally limited to injected `self` API.

## Rebuild Checklist

1. Keep deep-copy memory semantics.
2. Keep async wrapper for generated code.
3. Keep timeout guard.
4. Keep explicit, wrapped error messages for upstream retry logic.

