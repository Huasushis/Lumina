/**
 * Lumina Demo - 复杂端到端场景
 *
 * 覆盖：
 * 1) wrapper 模式 skill 筛选（非递归）
 * 2) LLM 函数代码持久化 + 自动加载
 * 3) 在生成代码内创建新的 LLM 函数并持久化
 * 4) 新 context 重载后直接调用已持久化函数
 * 5) 长上下文入参下的自适应参数字节策略
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AliYunBailianProvider,
  AnySkill,
  createSkillSelectorSkill,
  defineLLMFunction,
  LuminaContext,
  SkillSelectionCandidate,
  SkillSelectionConstraints,
  SkillSelectionResultItem,
  loadDefaultSkills
} from '../src/index.js';

async function llmRankSkills(
  provider: AliYunBailianProvider,
  query: string,
  candidates: SkillSelectionCandidate[],
  constraints: SkillSelectionConstraints = {}
): Promise<SkillSelectionResultItem[]> {
  const prompt = [
    '[DEMO_SKILL_SELECTOR_QUERY]',
    `query=${query}`,
    `constraints=${JSON.stringify(constraints)}`,
    `candidates=${JSON.stringify(candidates)}`,
    'Return JSON: {"intent":"return", "value":{"selected":[{"name":"...","score":0-100,"reason":"..."}]}}',
    'Only use candidate names.'
  ].join('\n');

  const response = await provider.generate(
    [{ role: 'user', content: prompt }],
    [],
    undefined
  );

  if (response.message.intent !== 'return') {
    return [];
  }

  const selected = (
    response.message.value
    && typeof response.message.value === 'object'
    && Array.isArray((response.message.value as { selected?: unknown[] }).selected)
      ? (response.message.value as { selected: unknown[] }).selected
      : []
  )
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Partial<SkillSelectionResultItem>;
      if (typeof candidate.name !== 'string' || candidate.name.length === 0) {
        return null;
      }

      return {
        name: candidate.name,
        score: typeof candidate.score === 'number' ? candidate.score : 1,
        reason: typeof candidate.reason === 'string' ? candidate.reason : 'selected by llm'
      } as SkillSelectionResultItem;
    })
    .filter((item): item is SkillSelectionResultItem => item !== null)
    .sort((a, b) => b.score - a.score);

  return selected;
}

async function main() {
  console.log('====== Lumina Complex Demo Start ======\n');

  const provider = new AliYunBailianProvider({
    model: 'qwen-plus',
    enableThinking: false
  });

  const persistenceFile = resolve('.lumina/functions.json');

  const baseSkills: AnySkill[] = loadDefaultSkills({
    executable: ['basicMath', 'time'],
    knowledge: ['tsSandbox', 'recursive']
  });

  const selectorSkill = createSkillSelectorSkill(
    baseSkills,
    (query, candidates, constraints) => llmRankSkills(provider, query, candidates, constraints)
  );

  const ctx = new LuminaContext(provider, { project: 'Lumina demo' }, new Map(), [], {
    maxRetries: 3,
    persistence: {
      enabled: true,
      autoLoad: true,
      autoSave: true,
      filePath: persistenceFile
    },
    skillFilter: {
      enabled: true,
      selectorSkillName: '__skillSelector',
      topN: 4,
      applyToLLMFunctions: true
    }
  });

  ctx.injectSkills(...baseSkills, selectorSkill);

  const summarizeTask = defineLLMFunction<[string], unknown>(ctx, {
    name: 'summarizeTask',
    description: 'Summarize user context and return key action items.',
    parameters: {
      type: 'object',
      properties: {
        context: { type: 'string' }
      },
      required: ['context']
    },
    adaptiveParameterBytes: true,
    adaptiveParameterBytesMax: 1024 * 1024
  });

  const longContext = `事件日志:\n${'服务A响应抖动，排查网络与缓存。\n'.repeat(1200)}`;

  console.log('--- Step 1: 触发 summarizeTask（长上下文，自适应参数） ---');
  const summaryResult = await summarizeTask(longContext);
  console.log('summaryResult:', JSON.stringify(summaryResult, null, 2));

  console.log('\n--- Step 2: 在 eval 代码中创建内部 LLM 函数 priorityClassifier ---');
  const dynamicCreationResult = await ctx.call([
    '请输出 eval 代码并严格执行以下步骤：',
    '1) 使用 await self.createLLMFunction 创建函数，name="priorityClassifier"，description="Classify incident priority"，parameters 为 {text:string}。',
    '2) 调用 await self.llmFunctions.priorityClassifier("payment outage and critical errors")。',
    '3) 调用 await self.skills.__skillSelector({ query: "排障+计算+时间", topN: 3 })。',
    '4) return { createdFunction: "priorityClassifier", classification: <调用结果>, selectedSkills: <selector结果> }。'
  ].join('\n'));
  console.log('dynamicCreationResult:', JSON.stringify(dynamicCreationResult, null, 2));

  console.log('\n--- Step 3: 检查持久化文件内容 ---');
  if (!existsSync(persistenceFile)) {
    throw new Error(`Persistence file not found: ${persistenceFile}`);
  }

  const persistedRaw = readFileSync(persistenceFile, 'utf8');
  const persistedDoc = JSON.parse(persistedRaw) as {
    functions?: Record<string, unknown>;
  };
  const functionNames = Object.keys(persistedDoc.functions ?? {});
  console.log('persisted functions:', functionNames);

  console.log('\n--- Step 4: 新建 context 验证自动加载 ---');
  const reloadCtx = new LuminaContext(provider, {}, new Map(), [], {
    maxRetries: 3,
    persistence: {
      enabled: true,
      autoLoad: true,
      autoSave: true,
      filePath: persistenceFile
    },
    skillFilter: {
      enabled: true,
      selectorSkillName: '__skillSelector',
      topN: 4,
      applyToLLMFunctions: true
    }
  });

  reloadCtx.injectSkills(...baseSkills, selectorSkill);

  const reloadSummaryResult = await reloadCtx.invokeLLMFunction(
    'summarizeTask',
    longContext.slice(0, 8000)
  );
  console.log('reload summarizeTask result:', JSON.stringify(reloadSummaryResult, null, 2));

  if (functionNames.includes('priorityClassifier')) {
    const reloadPriorityResult = await reloadCtx.invokeLLMFunction(
      'priorityClassifier',
      'urgent incident with production impact'
    );
    console.log('reload priorityClassifier result:', JSON.stringify(reloadPriorityResult, null, 2));
  } else {
    console.log('priorityClassifier was not persisted in this run; skip reload invoke.');
  }

  console.log('\n--- Step 5: 单独演示 selector skill 输出（Top-N + reason） ---');
  const selectorOutput = await selectorSkill.execute({
    query: '我需要先计算指标，再判断当前时间窗口是否需要告警',
    topN: 3
  });
  console.log('selector output:', JSON.stringify(selectorOutput, null, 2));

  console.log('\n====== Lumina Complex Demo End ======');
}

main().catch((error) => {
  console.error('Complex demo failed:', error);
  process.exit(1);
});
