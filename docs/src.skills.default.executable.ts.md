# `src/skills/default/executable.ts`

Built-in executable skill groups shipped with Lumina.

## Groups

- `basicMath`
  - `add(a, b)`
  - `subtract(a, b)`
  - `multiply(a, b)`
- `time`
  - `getCurrentTime()`

## Design

- Skills are defined using `defineSkill(...)`.
- Parameter schemas are explicit for stable prompting.
- Exported as `defaultExecutableSkillGroups` for selective loading.
