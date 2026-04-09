import { defineSkill } from '../../SkillBuilder.js';
import { AnySkill, ExecutableSkill, SkillSelectorQueryFunction } from '../../types.js';
import { buildSkillSelectorSkill } from './selector.js';

export const basicMathSkills: ExecutableSkill[] = [
  defineSkill('add', (a: number, b: number) => a + b, {
    description: 'Add two numbers and return the sum.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b']
    }
  }),
  defineSkill('subtract', (a: number, b: number) => a - b, {
    description: 'Subtract b from a and return the result.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b']
    }
  }),
  defineSkill('multiply', (a: number, b: number) => a * b, {
    description: 'Multiply two numbers and return the product.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b']
    }
  })
];

export const timeSkills: ExecutableSkill[] = [
  defineSkill('getCurrentTime', () => new Date().toISOString(), {
    description: 'Get current ISO timestamp string.',
    parameters: {}
  })
];

export function createSkillSelectorSkill(
  skills: AnySkill[],
  queryFunction?: SkillSelectorQueryFunction
): ExecutableSkill {
  return buildSkillSelectorSkill(skills, queryFunction, {
    name: '__skillSelector',
    description: 'Select and rank the most relevant skills for a user task query.'
  });
}

export const defaultExecutableSkillGroups: Record<string, ExecutableSkill[]> = {
  basicMath: basicMathSkills,
  time: timeSkills
};
