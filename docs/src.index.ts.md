# `src/index.ts`

This file is the public export gateway for Lumina.

## Responsibilities

- Re-export all public modules from one import path.
- Keep consumer imports stable.

## Current Exports

```ts
export * from './types.js';
export * from './Sandbox.js';
export * from './LLMProvider.js';
export * from './LuminaContext.js';
export * from './DebugSink.js';
```

## Why This Matters

Without this file, users must import deeply from each module path. `index.ts` gives a clean API surface:

```ts
import {
  LuminaContext,
  AliYunBailianProvider,
  DebugLogger,
  ConsoleDebugSink,
  type Skill
} from './src/index.js';
```

## Rebuild Checklist

1. Keep export list synchronized with all public modules.
2. If adding new runtime module, export it here and update docs index.
3. Do not export internal-only helpers unless intentionally public.

