/// <reference types="node" />

import {
  AnySkill,
  defineSkill,
  DebugRuntimeContext,
  ILLMProvider,
  LuminaContext,
  Message,
  ProviderResponse
} from '../src/index.js';

class MockProvider implements ILLMProvider {
  async generate(
    history: Message[],
    _skills: AnySkill[],
    debugContext?: DebugRuntimeContext
  ): Promise<ProviderResponse> {
    const lastMessage = history[history.length - 1]?.content ?? '';

    debugContext?.logger.emit({
      source: 'provider',
      level: 'debug',
      event: 'provider.mock.generate',
      callId: debugContext.callId,
      payload: {
        historyCount: history.length,
        lastMessage
      }
    });

    if (lastMessage.includes('sum')) {
      const evalResponse: ProviderResponse = {
        message: {
          intent: 'eval',
          code: `
const result = await self.skills.add(2, 3);
self.memory.lastResult = result;
return { mode: 'eval', result, memoryLast: self.memory.lastResult };
`
        }
      };

      debugContext?.logger.emit({
        source: 'provider',
        level: 'trace',
        event: 'provider.mock.response',
        callId: debugContext.callId,
        payload: evalResponse
      });

      return evalResponse;

    }

    const returnResponse: ProviderResponse = {
      message: {
        intent: 'return',
        value: {
          mode: 'return',
          echoed: lastMessage
        }
      }
    };

    debugContext?.logger.emit({
      source: 'provider',
      level: 'trace',
      event: 'provider.mock.response',
      callId: debugContext.callId,
      payload: returnResponse
    });

    return returnResponse;
  }
}

const addSkill = defineSkill('add', (a: number, b: number) => a + b, {
  description: 'Add two numbers',
  parameters: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: { type: 'number' }
    },
    required: ['a', 'b']
  }
});

async function main() {
  const context = new LuminaContext(
    new MockProvider(),
    {},
    new Map(),
    [],
    {
      maxRetries: 2,
      debug: {
        enabled: true,
        level: 'trace',
        filePath: './logs/debug-local.jsonl',
        mirrorToConsole: false,
        memoryLimit: 200
      }
    }
  );

  context.injectSkill(addSkill);

  const returnResult = await context.call('just return this input');
  const evalResult = await context.call('please sum');

  console.log('Return call =>', JSON.stringify(returnResult));
  console.log('Eval call =>', JSON.stringify(evalResult));
  console.log('Context memory =>', JSON.stringify(context.memory));
  console.log('Debug log file => logs/debug-local.jsonl');
}

main().catch((err) => {
  console.error('debug-local example failed:', err);
  process.exit(1);
});
