import vm from 'node:vm';
import { DebugRuntimeContext, Skill } from './types.js';

export class Sandbox {
  /**
   * Executes the given code in an isolated environment.
   */
  static async runCode(
    code: string,
    memory: Record<string, any>,
    skills: Map<string, Skill>,
    contextMethods: {
      clone: () => Promise<any>;
      create: (prompt: string) => Promise<any>;
    },
    debugContext?: DebugRuntimeContext
  ): Promise<any> {
    const callId = debugContext?.callId;
    debugContext?.logger.emit({
      source: 'sandbox',
      level: 'debug',
      event: 'sandbox.execute.start',
      callId,
      payload: {
        code,
        memoryKeys: Object.keys(memory),
        skillNames: Array.from(skills.keys())
      }
    });

    // We deep copy the memory before passing to sandbox
    const sandboxMemory = structuredClone(memory);

    // Bind skills into an object with callable functions
    const sandboxSkills: Record<string, Function> = {};
    for (const [name, skill] of skills.entries()) {
      sandboxSkills[name] = async (...args: any[]) => await skill.execute(...args);
    }

    // Assemble the sandbox context
    const sandboxContext = {
      self: {
        memory: sandboxMemory,
        skills: sandboxSkills,
        clone: contextMethods.clone,
        create: contextMethods.create,
        sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
      },
      console: {
        log: (...args: any[]) => console.log('[Sandbox]', ...args),
        error: (...args: any[]) => console.error('[Sandbox Error]', ...args),
        warn: (...args: any[]) => console.warn('[Sandbox Warn]', ...args)
      }
    };

    // Create the Node VM context
    vm.createContext(sandboxContext);

    // We wrap the user code in an async function to allow await
    const wrappedCode = `(async () => {\n${code}\n})()`;

    try {
      const script = new vm.Script(wrappedCode);
      const result = await script.runInContext(sandboxContext, {
        timeout: 30000 // 30s execution timeout limit
      });

      debugContext?.logger.emit({
        source: 'sandbox',
        level: 'debug',
        event: 'sandbox.execute.success',
        callId,
        payload: {
          result,
          updatedMemory: sandboxMemory
        }
      });

      return result;
    } catch (e: any) {
      debugContext?.logger.emit({
        source: 'sandbox',
        level: 'error',
        event: 'sandbox.execute.error',
        callId,
        payload: {
          error: e?.message ?? String(e),
          code
        }
      });

      throw new Error(`Sandbox Execution Error: ${e.message}`);
    }
  }
}
