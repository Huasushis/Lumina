/// <reference types="node" />

import {
  AnySkill,
  DebugRuntimeContext,
  defineLLMFunction,
  ILLMProvider,
  LuminaContext,
  Message,
  ProviderResponse
} from '../src/index.js';

class MockProvider implements ILLMProvider {
  async generate(
    history: Message[],
    _skills: AnySkill[],
    _debugContext?: DebugRuntimeContext
  ): Promise<ProviderResponse> {
    const last = history[history.length - 1]?.content ?? '';

    if (last.includes('[LLM_FUNCTION_MODE_NEGOTIATION]')) {
      if (last.includes('Function name: add')) {
        return {
          message: {
            intent: 'return',
            value: { mode: 'return' }
          }
        };
      }

      return {
        message: {
          intent: 'return',
          value: { mode: 'code' }
        }
      };
    }

    if (last.includes('[LLM_FUNCTION_RETURN_CALL]')) {
      const argLine = last
        .split('\n')
        .find((line) => line.startsWith('Arguments JSON:'));

      const args = argLine
        ? JSON.parse(argLine.replace('Arguments JSON:', '').trim()) as [number, number]
        : [0, 0];

      return {
        message: {
          intent: 'return',
          value: Number(args[0]) + Number(args[1])
        }
      };
    }

    if (last.includes('[LLM_FUNCTION_CODE_GENERATION]')) {
      if (last.includes('Function name: multiply')) {
        return {
          message: {
            intent: 'eval',
            code: `
const a: number = Number(__luminaInput.a ?? 0);
const b: number = Number(__luminaInput.b ?? 0);
if (Number.isNaN(a) || Number.isNaN(b)) {
  return {
    __luminaError: true,
    code: 'INVALID_PARAM',
    message: 'a and b must be numbers'
  };
}
return a * b;
`
          }
        };
      }

      return {
        message: {
          intent: 'eval',
          code: `
const a: number = Number(__luminaInput.a ?? 0);
const b: number = Number(__luminaInput.b ?? 0);
return a + b;
`
        }
      };
    }

    // fallback for generic context.call() prompts
    return {
      message: {
        intent: 'return',
        value: {
          mode: 'fallback',
          text: last
        }
      }
    };
  }
}

async function main() {
  const context = new LuminaContext(new MockProvider(), {}, new Map(), [], {
    maxRetries: 2,
    retry: {
      maxRuntimeRetries: 2,
      maxCompileRetries: 3,
      maxReviewRetries: 1
    },
    sandbox: {
      language: 'typescript',
      importPolicy: 'deny'
    }
  });

  const add = defineLLMFunction<[number, number], number>(context, {
    name: 'add',
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

  const multiply = defineLLMFunction<[number, number], number>(context, {
    name: 'multiply',
    description: 'Multiply two numbers',
    preferredMode: 'code',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b']
    }
  });

  const addResult = await add(2, 3);
  const mulResult1 = await multiply(6, 7);
  const mulResult2 = await multiply(8, 9);

  const multiplyState = context.llmFunctions.get('multiply')?.state;

  console.log('add(2,3) =>', addResult);
  console.log('multiply(6,7) =>', mulResult1);
  console.log('multiply(8,9) =>', mulResult2);
  console.log('multiply cached revision =>', multiplyState?.revision);
}

main().catch((err) => {
  console.error('llm-function-basic failed:', err);
  process.exit(1);
});
