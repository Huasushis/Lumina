# `src/SkillBuilder.ts`

Declarative helpers for defining skills like regular functions.

## Exports

- `defineSkill(...)`
  - Function-first or name+function overloads.
  - Produces executable skill objects.
  - Infers a simple JSON-schema-like parameter object when not provided.
- `defineKnowledge(name, { description, content })`
  - Produces knowledge-only skill objects (prompt context, non-callable).
- `defineSkills(map, options?)`
  - Batch converts plain function maps to executable skills.

## Notes

- This module is additive and backward-compatible.
- Existing object-literal `Skill` definitions still work.
