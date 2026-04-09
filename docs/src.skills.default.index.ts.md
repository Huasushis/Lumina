# `src/skills/default/index.ts`

Default skill loader and utility helpers.

## Exports

- `loadDefaultSkills(options?)`
  - Loads executable/knowledge skills by boolean or named groups.
  - Default behavior: executable groups enabled, knowledge groups disabled.
- `splitSkills(skills)`
  - Separates mixed skill list into `{ executable, knowledge }`.

## Option Shape

- `executable?: boolean | string[]`
- `knowledge?: boolean | string[]`
