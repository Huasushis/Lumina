# `src/Sandbox.ts`

This file provides isolated execution for model-generated code.

## Responsibilities

- Execute eval-mode code using `node:vm`.
- Compile/transpile TypeScript eval code before VM execution.
- Deep-copy memory before execution.
- Bind only executable skills into callable sandbox functions.
- Inject controlled `self` API (`memory`, `skills`, `clone`, `create`, `sleep`).
- Emit sandbox-level debug events.

## Public API

```ts
Sandbox.runCode(
  code: string,
  memory: Record<string, any>,
  skills: Map<string, AnySkill>,
  contextMethods: { clone: () => Promise<any>; create: (prompt: string) => Promise<any>; },
  debugContext?: DebugRuntimeContext,
  sandboxConfig?: LuminaSandboxConfig
): Promise<any>
```

## Runtime Steps

1. Emit `sandbox.execute.start`.
2. Clone memory to `sandboxMemory`.
3. Build `sandboxSkills` wrappers from executable skills only.
4. Build VM context:
   - `self.memory`
   - `self.skills`
   - `self.clone`
   - `self.create`
   - `self.sleep(ms)`
   - sandboxed console wrappers
5. Compile pipeline:

- validate no `import/export/require`
- transpile TypeScript (when enabled)
- validate transformed output again

6. Wrap compiled code in async IIFE:

```js
(async () => {
  // generated code
})()
```

7. Run script with configured timeout (`timeoutMs`, default `30000ms`).
8. Emit success/error debug events.
9. Return result or throw wrapped sandbox error.

## Debug Events

- `sandbox.execute.start`
- `sandbox.compile.start`
- `sandbox.compile.success`
- `sandbox.compile.error`
- `sandbox.execute.success`
- `sandbox.execute.error`

## Security Boundary Notes

- Uses VM context isolation, but this is not a full security sandbox for hostile untrusted code.
- `import/export/require` are explicitly rejected.
- Exposed capabilities are intentionally limited to injected `self` API.

## Rebuild Checklist

1. Keep deep-copy memory semantics.
2. Keep async wrapper for generated code.
3. Keep timeout guard.
4. Keep explicit, wrapped error messages for upstream retry logic.

## V2 Runtime Notes

- Import policy is configurable via `sandbox.importPolicy`:
  - `deny`
  - `allowlist`
  - `all`
- Missing external packages can be auto-installed when enabled.
- Runtime throws `SandboxExecutionError` with category:
  - `compile`
  - `runtime`
  - `policy`
  - `install`
- Sandbox exposes:
  - `self.llmFunctions`
  - `self.createLLMFunction(...)`

