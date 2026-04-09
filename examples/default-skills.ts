/// <reference types="node" />

import {
  AnySkill,
  DebugRuntimeContext,
  ILLMProvider,
  loadDefaultSkills,
  LuminaContext,
  Message,
  ProviderResponse
} from '../src/index.js';

class MockProvider implements ILLMProvider {
  async generate(
    _history: Message[],
    _skills: AnySkill[],
    _debugContext?: DebugRuntimeContext
  ): Promise<ProviderResponse> {
    return {
      message: {
        intent: 'eval',
        code: `
const sum: number = await self.skills.add(40, 2);
const currentTime: string = await self.skills.getCurrentTime();
const knowledgeCallable: boolean = typeof (self.skills as any).tsSandboxGuide !== 'undefined';

return {
  sum,
  currentTime,
  knowledgeCallable,
  note: 'If this ran successfully, TS transpilation is active.'
};
`
      }
    };
  }
}

async function main() {
  const context = new LuminaContext(new MockProvider(), {}, new Map(), [], {
    maxRetries: 1,
    sandbox: {
      language: 'typescript',
      timeoutMs: 30_000
    }
  });

  context.injectSkills(...loadDefaultSkills({
    executable: ['basicMath', 'time'],
    knowledge: ['tsSandbox']
  }));

  const result = await context.call('run default skills demo');
  console.log('Default skills result =>', JSON.stringify(result, null, 2));
  console.log('Expected knowledgeCallable => false');
}

main().catch((err) => {
  console.error('default-skills example failed:', err);
  process.exit(1);
});
