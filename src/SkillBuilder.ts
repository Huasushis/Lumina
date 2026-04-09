import { ExecutableSkill, KnowledgeSkill } from './types.js';

export interface DefineSkillOptions {
  name?: string;
  description?: string;
  parameters?: object;
}

export interface DefineKnowledgeOptions {
  description: string;
  content: string;
}

function inferParameterNames(fn: (...args: any[]) => any): string[] {
  const source = fn
    .toString()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  const match = source.match(/^[\s\S]*?\(([^)]*)\)/) ?? source.match(/^([^=\s]+)\s*=>/);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(',')
    .map((param) => param.trim().replace(/\?.*$/, '').replace(/:.+$/, '').trim())
    .filter(Boolean);
}

function inferParametersSchema(fn: (...args: any[]) => any): object {
  const names = inferParameterNames(fn);
  if (names.length === 0) {
    return {};
  }

  const properties: Record<string, object> = {};
  for (const name of names) {
    properties[name] = { type: 'any' };
  }

  return {
    type: 'object',
    properties,
    required: names
  };
}

function toReadableDescription(name: string): string {
  return `Executable skill: ${name}`;
}

export function defineSkill(fn: (...args: any[]) => any, options?: DefineSkillOptions): ExecutableSkill;
export function defineSkill(
  name: string,
  fn: (...args: any[]) => any,
  options?: Omit<DefineSkillOptions, 'name'>
): ExecutableSkill;
export function defineSkill(
  nameOrFn: string | ((...args: any[]) => any),
  fnOrOptions?: ((...args: any[]) => any) | Omit<DefineSkillOptions, 'name'>,
  maybeOptions?: Omit<DefineSkillOptions, 'name'>
): ExecutableSkill {
  let fn: (...args: any[]) => any;
  let options: DefineSkillOptions | undefined;
  let inferredName: string;

  if (typeof nameOrFn === 'function') {
    fn = nameOrFn;
    options = fnOrOptions as DefineSkillOptions | undefined;
    inferredName = options?.name ?? fn.name ?? 'anonymousSkill';
  } else {
    fn = fnOrOptions as (...args: any[]) => any;
    options = maybeOptions;
    inferredName = nameOrFn;
  }

  return {
    kind: 'executable',
    name: inferredName,
    description: options?.description ?? toReadableDescription(inferredName),
    parameters: options?.parameters ?? inferParametersSchema(fn),
    execute: fn
  };
}

export function defineKnowledge(name: string, options: DefineKnowledgeOptions): KnowledgeSkill {
  return {
    kind: 'knowledge',
    name,
    description: options.description,
    content: options.content
  };
}

export function defineSkills(
  map: Record<string, (...args: any[]) => any>,
  options?: {
    descriptionPrefix?: string;
  }
): ExecutableSkill[] {
  return Object.entries(map).map(([name, fn]) =>
    defineSkill(name, fn, {
      description: options?.descriptionPrefix
        ? `${options.descriptionPrefix}${name}`
        : toReadableDescription(name)
    })
  );
}
