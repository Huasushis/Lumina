import { defineKnowledge } from '../../SkillBuilder.js';
import { KnowledgeSkill } from '../../types.js';

export const tsSandboxGuide: KnowledgeSkill = defineKnowledge('tsSandboxGuide', {
  description: 'Guidance for writing TypeScript code inside Lumina sandbox.',
  content: [
    'Write asynchronous TypeScript snippets that end with a return statement.',
    'Use self.skills.*, self.memory, self.clone(), self.create(prompt), self.sleep(ms), and self.llmFunctions.* where available.',
    'import/export/require capability depends on runtime importPolicy; follow policy errors to repair code.',
    'Prefer small deterministic steps and clear variable names.'
  ].join('\n')
});

export const recursiveContextGuide: KnowledgeSkill = defineKnowledge('recursiveContextGuide', {
  description: 'Guidance for recursive and meta skill orchestration.',
  content: [
    'Use const child = await self.clone() to branch safely from current context.',
    'Use await self.create(prompt) to create a fresh context with focused role/prompt.',
    'Use self.llmFunctions.<name>(...args) for nested internal LLM function calls when available.',
    'Delegate subtasks to child contexts when decomposition is beneficial.',
    'Aggregate child results and return a final structured object.'
  ].join('\n')
});

export const errorEnvelopeGuide: KnowledgeSkill = defineKnowledge('errorEnvelopeGuide', {
  description: 'How to surface return/code errors with structured JSON for outer throw handling.',
  content: [
    'When arguments are missing or validation fails, return a structured envelope object:',
    '{"__luminaError": true, "code": "MISSING_PARAM", "message": "parameter a is required", "details": {...}}',
    'In code mode you may either return this envelope object or throw it; runtime will convert it to an error path.',
    'In return mode prefer intent=return with value set to the same envelope object.',
    'Use retryable=true in envelope when caller can fix and retry.'
  ].join('\n')
});

export const defaultKnowledgeSkillGroups: Record<string, KnowledgeSkill[]> = {
  tsSandbox: [tsSandboxGuide, errorEnvelopeGuide],
  recursive: [recursiveContextGuide],
  errors: [errorEnvelopeGuide]
};
