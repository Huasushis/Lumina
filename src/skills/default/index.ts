import { AnySkill, isKnowledgeSkill } from '../../types.js';
import { defaultExecutableSkillGroups } from './executable.js';
import { defaultKnowledgeSkillGroups } from './knowledge.js';

export interface DefaultSkillLoadOptions {
  executable?: boolean | string[];
  knowledge?: boolean | string[];
}

function pickKeys(option: boolean | string[] | undefined, allKeys: string[], defaultEnabled: boolean): string[] {
  if (Array.isArray(option)) {
    return option;
  }

  if (option === true) {
    return allKeys;
  }

  if (option === false) {
    return [];
  }

  return defaultEnabled ? allKeys : [];
}

export function loadDefaultSkills(options: DefaultSkillLoadOptions = {}): AnySkill[] {
  const executableKeys = Object.keys(defaultExecutableSkillGroups);
  const knowledgeKeys = Object.keys(defaultKnowledgeSkillGroups);

  const selectedExecutableKeys = pickKeys(options.executable, executableKeys, true);
  const selectedKnowledgeKeys = pickKeys(options.knowledge, knowledgeKeys, false);

  const selected: AnySkill[] = [];

  for (const key of selectedExecutableKeys) {
    selected.push(...(defaultExecutableSkillGroups[key] ?? []));
  }

  for (const key of selectedKnowledgeKeys) {
    selected.push(...(defaultKnowledgeSkillGroups[key] ?? []));
  }

  return selected;
}

export function splitSkills(skills: AnySkill[]) {
  return {
    executable: skills.filter((skill) => !isKnowledgeSkill(skill)),
    knowledge: skills.filter(isKnowledgeSkill)
  };
}

export * from './executable.js';
export * from './knowledge.js';
export * from './selector.js';
