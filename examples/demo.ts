/**
 * Lumina Demo - 最小功能版
 *
 * 覆盖：
 * 1) TS 原生函数（自动追加 llm 上下文参数）
 * 2) AI 函数（每次调用都协商 return/code）
 * 3) selector 作为独立 skill 使用（不内置到 Context）
 */

import {
  AliYunBailianProvider,
  AnySkill,
  createSkillSelectorSkill,
  defineLLMFunction,
  loadDefaultSkills,
  LuminaContext,
  TSFunctionLLMContext
} from '../src/index.js';

async function main() {
  console.log('====== Lumina Minimal Demo Start ======\n');

  const provider = new AliYunBailianProvider({
    model: 'qwen-plus',
    enableThinking: false,
    additionalModelParams: {
      temperature: 0.2
    }
  });

  const ctx = new LuminaContext(provider, {}, new Map(), [], {
    maxRetries: 3
  });

  const defaultSkills: AnySkill[] = loadDefaultSkills({
    executable: ['basicMath', 'time'],
    knowledge: ['tsSandbox']
  });
  ctx.injectSkills(...defaultSkills);

  // 1) TS 原生函数：函数定义里无需手动管理 provider/history/skills，运行时自动追加 llmContext
  const addWithLLMContext = ctx.defineTSFunction(
    'addWithLLMContext',
    async (a: number, b: number, llmContext: TSFunctionLLMContext) => {
      return {
        sum: a + b,
        historyLength: llmContext.history.length,
        skillCount: llmContext.skills.length,
        providerType: llmContext.provider.constructor.name
      };
    },
    {
      description: 'Add two numbers and return sum with runtime llm context metadata.',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' }
        },
        required: ['a', 'b']
      }
    }
  );

  const tsFunctionResult = await addWithLLMContext(12, 30);
  console.log('TS function result =>', JSON.stringify(tsFunctionResult, null, 2));

  // 2) selector 独立 skill（由技能集合构造，显式注入）
  const selectorSkill = createSkillSelectorSkill(Array.from(ctx.skills.values()));
  ctx.injectSkill(selectorSkill);

  const selectorOutput = await selectorSkill.execute({
    query: '我需要做基础计算并记录当前时间',
    topN: 3
  });
  console.log('Selector output =>', JSON.stringify(selectorOutput, null, 2));

  // 3) AI 函数：每次调用都做 return/code 协商（无持久化、无代码缓存）
  const summarizeIncident = defineLLMFunction<[string], unknown>(ctx, {
    name: 'summarizeIncident',
    description: 'Summarize an incident report with short action items.',
    parameters: {
      type: 'object',
      properties: {
        report: { type: 'string' }
      },
      required: ['report']
    },
    adaptiveParameterBytes: true,
    adaptiveParameterBytesMax: 1024 * 1024
  });

  const report = [
    '支付服务出现高延迟。',
    '错误集中在高峰时段。',
    '需要输出事件摘要、影响范围、下一步动作。'
  ].join('');

  const aiFunctionResult = await summarizeIncident(report);
  console.log('AI function result =>', JSON.stringify(aiFunctionResult, null, 2));

  console.log('\n====== Lumina Minimal Demo End ======');
}

main().catch((error) => {
  console.error('Minimal demo failed:', error);
  process.exit(1);
});
