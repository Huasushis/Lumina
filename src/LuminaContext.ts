import { randomUUID } from 'node:crypto';
import { ILLMProvider, LuminaConfig, Message, Skill } from './types.js';
import { Sandbox } from './Sandbox.js';
import { DebugLogger } from './DebugSink.js';

export class LuminaContext {
  public memory: Record<string, any>;
  public skills: Map<string, Skill>;
  public history: Message[];
  public provider: ILLMProvider;
  public config: LuminaConfig;

  constructor(
    provider: ILLMProvider,
    memory: Record<string, any> = {},
    skills: Map<string, Skill> = new Map(),
    history: Message[] = [],
    config: Partial<LuminaConfig> = {}
  ) {
    this.provider = provider;
    this.memory = memory;
    this.skills = skills;
    this.history = history;
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      debug: config.debug ?? { enabled: false }
    };
  }

  /**
   * Clone current context. Produces a deep copy of memory but keeps history shallow copied.
   */
  public async clone(): Promise<LuminaContext> {
    const memoryClone = structuredClone(this.memory);
    const historyClone = [...this.history];
    const skillsClone = new Map(this.skills); // shallow copy the map of stateless functions
    return new LuminaContext(
      this.provider,
      memoryClone,
      skillsClone,
      historyClone,
      this.config
    );
  }

  /**
   * Create a fresh context. History and memory are clear.
   */
  public async create(systemPrompt?: string): Promise<LuminaContext> {
    const history: Message[] = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
    return new LuminaContext(
      this.provider,
      {},
      new Map(this.skills), // inherit skills by default or let user manually inject? We'll inherit.
      history,
      this.config
    );
  }

  /**
   * Register a new skill for the context.
   */
  public injectSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  /**
   * Core execute function. Exposed as a callable.
   */
  public async call(taskDescription: string): Promise<any> {
    const callId = randomUUID();
    const debugLogger = new DebugLogger(this.config.debug);

    debugLogger.emit({
      source: 'context',
      level: 'info',
      event: 'context.call.start',
      callId,
      payload: {
        taskDescription,
        historyLength: this.history.length,
        skillCount: this.skills.size,
        maxRetries: this.config.maxRetries
      }
    });

    this.history.push({ role: 'user', content: taskDescription });

    let attempts = 0;
    while (attempts <= this.config.maxRetries) {
      debugLogger.emit({
        source: 'context',
        level: 'debug',
        event: 'context.call.attempt',
        callId,
        payload: {
          attempt: attempts + 1
        }
      });

      const response = await this.provider.generate(
        this.history,
        Array.from(this.skills.values()),
        { callId, logger: debugLogger }
      );
      const llmMessage = response.message;

      debugLogger.emit({
        source: 'context',
        level: 'debug',
        event: 'context.intent.received',
        callId,
        payload: llmMessage
      });

      if (llmMessage.intent === 'return') {
        // Appending the thought/response history
        this.history.push({ role: 'assistant', content: JSON.stringify(llmMessage) });

        debugLogger.emit({
          source: 'context',
          level: 'info',
          event: 'context.call.return',
          callId,
          payload: {
            value: llmMessage.value
          }
        });

        return llmMessage.value;
      }

      if (llmMessage.intent === 'eval') {
        this.history.push({ role: 'assistant', content: JSON.stringify(llmMessage) });

        debugLogger.emit({
          source: 'context',
          level: 'trace',
          event: 'context.eval.code',
          callId,
          payload: {
            code: llmMessage.code
          }
        });

        try {
          const result = await Sandbox.runCode(
            llmMessage.code,
            this.memory,
            this.skills,
            {
              clone: () => this.clone(),
              create: (prompt: string) => this.create(prompt)
            },
            { callId, logger: debugLogger }
          );

          debugLogger.emit({
            source: 'context',
            level: 'info',
            event: 'context.call.eval_success',
            callId,
            payload: {
              result
            }
          });

          return result;
        } catch (err: any) {
          attempts++;
          const errorMessage = `Execution error: ${err.message}. Please fix your code and try again.`;
          this.history.push({ role: 'user', content: errorMessage });

          debugLogger.emit({
            source: 'context',
            level: attempts > this.config.maxRetries ? 'error' : 'warn',
            event: 'context.call.retry',
            callId,
            payload: {
              attempts,
              maxRetries: this.config.maxRetries,
              error: err?.message ?? String(err)
            }
          });
          
          if (attempts > this.config.maxRetries) {
            debugLogger.emit({
              source: 'context',
              level: 'error',
              event: 'context.call.failed',
              callId,
              payload: {
                attempts,
                error: err?.message ?? String(err)
              }
            });
            throw new Error(`Execution failed after ${this.config.maxRetries} retries. Last error: ${err.message}`);
          }
        }
      } else {
        debugLogger.emit({
          source: 'context',
          level: 'error',
          event: 'context.intent.unknown',
          callId,
          payload: llmMessage
        });
        throw new Error(`Unknown intent received from LLM: ${(llmMessage as any).intent}`);
      }
    }

    debugLogger.emit({
      source: 'context',
      level: 'error',
      event: 'context.call.unreachable',
      callId,
      payload: {
        reason: 'loop ended without return'
      }
    });

    throw new Error('Context call finished unexpectedly without result.');
  }

  /**
   * Export the context as an executable function so it can be passed around transparently.
   */
  public exportAsFunction() {
    return async (taskDescription: string) => {
      return await this.call(taskDescription);
    };
  }
}
