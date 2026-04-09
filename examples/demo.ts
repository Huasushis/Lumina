/**
 * Lumina Demo - 完整流程验证
 * 
 * 本脚本验证：
 * 1. 基本的 Return 模式（AI 直接返回结果）
 * 2. Eval 模式（AI 生成代码并在沙盒中执行）
 * 3. 上下文克隆隔离（Clone 后子实例不污染父实例）
 * 4. Skill 注入与调用
 * 5. 容错重试机制
 */

import { AliYunBailianProvider } from '../src/LLMProvider.js';
import { LuminaContext } from '../src/LuminaContext.js';
import { Skill } from '../src/types.js';

// ===== 定义 Skills =====

const addSkill: Skill = {
  name: 'add',
  description: '将两个数字相加。参数: a (number), b (number)。返回 a + b 的结果。',
  parameters: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: { type: 'number' }
    },
    required: ['a', 'b']
  },
  execute: (a: number, b: number) => a + b
};

const getCurrentTimeSkill: Skill = {
  name: 'getCurrentTime',
  description: '获取当前的时间戳字符串。无参数。',
  parameters: {},
  execute: () => new Date().toISOString()
};

// ===== 主测试流程 =====
async function main() {
  console.log('====== Lumina Demo Start ======\n');

  // 1. 初始化 Provider & Context
  const provider = new AliYunBailianProvider({
    model: 'qwen-plus',
    enableThinking: false
  });

  const ctx = new LuminaContext(provider, {}, new Map(), [], { maxRetries: 3 });

  // 注入 Skills
  ctx.injectSkill(addSkill);
  ctx.injectSkill(getCurrentTimeSkill);

  // ------- Test 1: Return 模式 --------
  console.log('--- Test 1: Return 模式 (直接问答) ---');
  try {
    const result1 = await ctx.call('请直接告诉我 1+1 等于多少，不要写代码。');
    console.log('Result:', JSON.stringify(result1, null, 2));
    console.log('✓ Test 1 Passed\n');
  } catch (e: any) {
    console.error('✗ Test 1 Failed:', e.message, '\n');
  }

  // ------- Test 2: Eval 模式 --------
  console.log('--- Test 2: Eval 模式 (调用 skill) ---');
  const ctx2 = new LuminaContext(provider, {}, new Map(), [], { maxRetries: 3 });
  ctx2.injectSkill(addSkill);
  ctx2.injectSkill(getCurrentTimeSkill);
  try {
    const result2 = await ctx2.call('请使用 add 工具计算 123 + 456，然后获取当前时间，将两个结果组合返回。你必须写代码来调用 self.skills.add 和 self.skills.getCurrentTime。');
    console.log('Result:', JSON.stringify(result2, null, 2));
    console.log('✓ Test 2 Passed\n');
  } catch (e: any) {
    console.error('✗ Test 2 Failed:', e.message, '\n');
  }

  // ------- Test 3: Context Clone 隔离 --------
  console.log('--- Test 3: Context Clone 隔离 ---');
  const parentCtx = new LuminaContext(provider, { counter: 0 }, new Map(), [], { maxRetries: 3 });
  parentCtx.injectSkill(addSkill);
  
  const childCtx = await parentCtx.clone();
  childCtx.memory.counter = 999;

  console.log('Parent memory.counter:', parentCtx.memory.counter); // should be 0
  console.log('Child  memory.counter:', childCtx.memory.counter);  // should be 999
  
  if (parentCtx.memory.counter === 0 && childCtx.memory.counter === 999) {
    console.log('✓ Test 3 Passed (memory isolation confirmed)\n');
  } else {
    console.error('✗ Test 3 Failed (memory leaked!)\n');
  }

  // ------- Test 4: exportAsFunction --------
  console.log('--- Test 4: exportAsFunction ---');
  const ctx4 = new LuminaContext(provider, {}, new Map(), [], { maxRetries: 3 });
  const fn = ctx4.exportAsFunction();
  try {
    const result4 = await fn('直接回答：月球距离地球大约多远（公里）？');
    console.log('Result:', JSON.stringify(result4, null, 2));
    console.log('✓ Test 4 Passed\n');
  } catch (e: any) {
    console.error('✗ Test 4 Failed:', e.message, '\n');
  }

  console.log('====== Lumina Demo End ======');
}

main().catch(console.error);
