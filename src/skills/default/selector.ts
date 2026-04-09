import { defineSkill } from '../../SkillBuilder.js';
import {
  AnySkill,
  ExecutableSkill,
  isKnowledgeSkill,
  SkillSelectionCandidate,
  SkillSelectionConstraints,
  SkillSelectionResultItem,
  SkillSelectorQueryFunction
} from '../../types.js';

const DEFAULT_TOP_N = 5;
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'is', 'it', 'of',
  'on', 'or', 'that', 'the', 'this', 'to', 'use', 'with', '请', '帮我', '一下', '然后', '并', '和', '的'
]);

export interface SkillSelectorSkillInput extends SkillSelectionConstraints {
  query: string;
}

export interface SkillSelectorSkillOutput {
  query: string;
  selected: SkillSelectionResultItem[];
  candidatesCount: number;
  strategy: 'heuristic' | 'queryFunction' | 'queryFunction_fallback';
}

export interface BuildSkillSelectorSkillOptions {
  name?: string;
  description?: string;
  defaultTopN?: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5_]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => !STOPWORDS.has(token));
}

function matchesTags(candidate: SkillSelectionCandidate, includeTags: string[], excludeTags: string[]): boolean {
  const tags = candidate.tags ?? [];

  if (includeTags.length > 0) {
    const includeMatched = includeTags.some((tag) => tags.includes(tag));
    if (!includeMatched) {
      return false;
    }
  }

  if (excludeTags.some((tag) => tags.includes(tag))) {
    return false;
  }

  return true;
}

function applyConstraints(
  candidates: SkillSelectionCandidate[],
  constraints: SkillSelectionConstraints = {},
  selfName?: string
): SkillSelectionCandidate[] {
  const includeNames = new Set(constraints.includeNames ?? []);
  const excludeNames = new Set(constraints.excludeNames ?? []);
  if (selfName) {
    excludeNames.add(selfName);
  }

  const includeTags = constraints.includeTags ?? [];
  const excludeTags = constraints.excludeTags ?? [];

  return candidates.filter((candidate) => {
    if (includeNames.size > 0 && !includeNames.has(candidate.name)) {
      return false;
    }

    if (excludeNames.has(candidate.name)) {
      return false;
    }

    return matchesTags(candidate, includeTags, excludeTags);
  });
}

function scoreCandidate(candidate: SkillSelectionCandidate, tokens: string[]): SkillSelectionResultItem {
  let score = 0;
  const reasonParts: string[] = [];

  const name = candidate.name.toLowerCase();
  const description = candidate.description.toLowerCase();
  const tags = (candidate.tags ?? []).map((tag) => tag.toLowerCase());
  const category = (candidate.category ?? '').toLowerCase();

  for (const token of tokens) {
    if (name.includes(token)) {
      score += 5;
      reasonParts.push(`name matches '${token}'`);
      continue;
    }

    if (tags.some((tag) => tag.includes(token))) {
      score += 4;
      reasonParts.push(`tag matches '${token}'`);
      continue;
    }

    if (category.includes(token)) {
      score += 3;
      reasonParts.push(`category matches '${token}'`);
      continue;
    }

    if (description.includes(token)) {
      score += 2;
      reasonParts.push(`description mentions '${token}'`);
    }
  }

  if (score === 0) {
    score = 1;
    reasonParts.push('fallback low-confidence match');
  }

  return {
    name: candidate.name,
    score,
    reason: reasonParts.slice(0, 3).join('; ')
  };
}

function normalizeResults(
  ranked: SkillSelectionResultItem[],
  candidates: SkillSelectionCandidate[]
): SkillSelectionResultItem[] {
  const candidateSet = new Set(candidates.map((candidate) => candidate.name));
  return ranked
    .filter((item) => typeof item?.name === 'string' && candidateSet.has(item.name))
    .map((item) => ({
      name: item.name,
      score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 1,
      reason: typeof item.reason === 'string' && item.reason.length > 0 ? item.reason : 'selected by query function'
    }))
    .sort((a, b) => b.score - a.score);
}

export function buildSkillSelectionCandidates(skills: AnySkill[]): SkillSelectionCandidate[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    kind: isKnowledgeSkill(skill) ? 'knowledge' : 'executable',
    tags: skill.metadata?.tags,
    category: skill.metadata?.category
  }));
}

export function rankSkillCandidatesByHeuristic(
  query: string,
  candidates: SkillSelectionCandidate[],
  constraints: SkillSelectionConstraints = {}
): SkillSelectionResultItem[] {
  const topN = Math.max(1, constraints.topN ?? DEFAULT_TOP_N);
  const filteredCandidates = applyConstraints(candidates, constraints);
  const tokens = tokenize(query);

  const ranked = filteredCandidates
    .map((candidate) => scoreCandidate(candidate, tokens))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return ranked;
}

export function buildSkillSelectorSkill(
  skills: AnySkill[],
  queryFunction?: SkillSelectorQueryFunction,
  options: BuildSkillSelectorSkillOptions = {}
): ExecutableSkill {
  const name = options.name ?? '__skillSelector';
  const defaultTopN = Math.max(1, options.defaultTopN ?? DEFAULT_TOP_N);

  return defineSkill(name, async (input: SkillSelectorSkillInput) => {
    const query = typeof input?.query === 'string' ? input.query : '';
    const constraints: SkillSelectionConstraints = {
      ...input,
      topN: Math.max(1, input?.topN ?? defaultTopN)
    };

    const candidates = applyConstraints(buildSkillSelectionCandidates(skills), constraints, name);

    if (candidates.length === 0) {
      return {
        query,
        selected: [],
        candidatesCount: 0,
        strategy: queryFunction ? 'queryFunction_fallback' : 'heuristic'
      } as SkillSelectorSkillOutput;
    }

    if (!queryFunction) {
      return {
        query,
        selected: rankSkillCandidatesByHeuristic(query, candidates, constraints),
        candidatesCount: candidates.length,
        strategy: 'heuristic'
      } as SkillSelectorSkillOutput;
    }

    try {
      const externalRanked = await queryFunction(query, candidates, constraints);
      const normalized = normalizeResults(externalRanked, candidates)
        .slice(0, constraints.topN ?? defaultTopN);

      if (normalized.length > 0) {
        return {
          query,
          selected: normalized,
          candidatesCount: candidates.length,
          strategy: 'queryFunction'
        } as SkillSelectorSkillOutput;
      }

      return {
        query,
        selected: rankSkillCandidatesByHeuristic(query, candidates, constraints),
        candidatesCount: candidates.length,
        strategy: 'queryFunction_fallback'
      } as SkillSelectorSkillOutput;
    } catch {
      return {
        query,
        selected: rankSkillCandidatesByHeuristic(query, candidates, constraints),
        candidatesCount: candidates.length,
        strategy: 'queryFunction_fallback'
      } as SkillSelectorSkillOutput;
    }
  }, {
    description: options.description ?? 'Select and rank the most relevant skills for a task query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Task query to match against candidate skills.' },
        topN: { type: 'number', description: 'Maximum number of skills to return.' },
        includeNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional whitelist of skill names.'
        },
        excludeNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional blacklist of skill names.'
        },
        includeTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional whitelist of skill tags.'
        },
        excludeTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional blacklist of skill tags.'
        }
      },
      required: ['query']
    }
  });
}
