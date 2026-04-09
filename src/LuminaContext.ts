import { randomUUID } from 'node:crypto';
import {
  AnySkill,
  ILLMProvider,
  isKnowledgeSkill,
  isLuminaErrorEnvelope,
  KnowledgeSkill,
  LLMFunctionConfig,
  LLMFunctionMode,
  LuminaConfig,
  Message,
  RegisteredLLMFunction,
  RetryPolicy,
  Skill
} from './types.js';
import { Sandbox, SandboxExecutionError } from './Sandbox.js';
import { DebugLogger } from './DebugSink.js';
import { defineSkill, DefineSkillOptions } from './SkillBuilder.js';

interface TextifyResult {
  ok: boolean;
  text: string;
  bytes: number;
  reason?: string;
}

export interface TSFunctionLLMContext {
  history: Message[];
  skills: AnySkill[];
  provider: ILLMProvider;
}

const DEFAULT_FUNCTION_MAX_PARAM_BYTES_BASE = 32 * 1024;
const DEFAULT_FUNCTION_MAX_PARAM_BYTES_ADAPTIVE_MAX = 512 * 1024;

const CONTEXT_WINDOW_ERROR_PATTERNS = [
  /context length/i,
  /context window/i,
  /maximum context/i,
  /too many tokens/i,
  /token limit/i,
  /input is too long/i,
  /request too large/i,
  /payload too large/i
];

export class LuminaContext {
  public memory: Record<string, any>;
  public skills: Map<string, AnySkill>;
  public llmFunctions: Map<string, RegisteredLLMFunction>;
  public history: Message[];
  public provider: ILLMProvider;
  public config: LuminaConfig;

  constructor(
    provider: ILLMProvider,
    memory: Record<string, any> = {},
    skills: Map<string, AnySkill> = new Map(),
    history: Message[] = [],
    config: Partial<LuminaConfig> = {}
  ) {
    const runtimeRetryDefault = config.retry?.maxRuntimeRetries ?? config.maxRetries ?? 3;
    const compileRetryDefault = config.retry?.maxCompileRetries ?? Math.max(3, runtimeRetryDefault * 2);
    const reviewRetryDefault = config.retry?.maxReviewRetries ?? runtimeRetryDefault;

    const importPolicy = config.sandbox?.importPolicy ?? 'deny';
    const autoInstallMissingPackages = config.sandbox?.autoInstallMissingPackages
      ?? (importPolicy === 'allowlist' || importPolicy === 'all');

    this.provider = provider;
    this.memory = memory;
    this.skills = skills;
    this.llmFunctions = new Map();
    this.history = history;
    this.config = {
      maxRetries: runtimeRetryDefault,
      retry: {
        maxRuntimeRetries: runtimeRetryDefault,
        maxCompileRetries: compileRetryDefault,
        maxReviewRetries: reviewRetryDefault
      },
      debug: config.debug ?? { enabled: false },
      sandbox: {
        language: config.sandbox?.language ?? 'typescript',
        timeoutMs: config.sandbox?.timeoutMs ?? 30000,
        importPolicy,
        allowedImports: config.sandbox?.allowedImports ?? [],
        autoInstallMissingPackages,
        installProvider: config.sandbox?.installProvider ?? 'auto',
        packageRegistry: config.sandbox?.packageRegistry,
        maxInstallAttempts: config.sandbox?.maxInstallAttempts ?? 1
      }
    };
  }

  private getRetryPolicy(): Required<RetryPolicy> {
    const maxRuntimeRetries = this.config.retry?.maxRuntimeRetries ?? this.config.maxRetries;
    const maxCompileRetries = this.config.retry?.maxCompileRetries ?? Math.max(3, maxRuntimeRetries * 2);
    const maxReviewRetries = this.config.retry?.maxReviewRetries ?? maxRuntimeRetries;

    return {
      maxRuntimeRetries,
      maxCompileRetries,
      maxReviewRetries
    };
  }

  private getRuntimeKnowledgeSkills(): AnySkill[] {
    const policy = this.config.sandbox?.importPolicy ?? 'deny';
    const allowed = this.config.sandbox?.allowedImports ?? [];
    const autoInstall = this.config.sandbox?.autoInstallMissingPackages
      ?? (policy === 'allowlist' || policy === 'all');

    return [
      {
        kind: 'knowledge',
        name: '__runtimeImportPolicy',
        description: 'Runtime import policy constraints for sandbox code generation.',
        content: [
          `importPolicy=${policy}`,
          `allowedImports=${allowed.length > 0 ? allowed.join(', ') : '(none)'}`,
          `autoInstallMissingPackages=${autoInstall}`,
          'If your generated code returns an error object, use: {"__luminaError": true, "code": "...", "message": "...", "details": {...}}'
        ].join('\n')
      }
    ];
  }

  private getSkillsForProvider(): AnySkill[] {
    return [
      ...Array.from(this.skills.values()),
      ...this.getRuntimeKnowledgeSkills()
    ];
  }

  private buildTSFunctionLLMContext(): TSFunctionLLMContext {
    return {
      history: [...this.history],
      skills: Array.from(this.skills.values()),
      provider: this.provider
    };
  }

  private unwrapResultOrThrow(value: any, source: string): any {
    if (isLuminaErrorEnvelope(value)) {
      throw new Error(`[${source}] ${value.code}: ${value.message}`);
    }

    if (value && typeof value === 'object' && value.ok === false && 'error' in value) {
      const message = typeof value.error === 'string'
        ? value.error
        : JSON.stringify(value.error);
      throw new Error(`[${source}] ${message}`);
    }

    return value;
  }

  private textifyArguments(args: any[], maxBytes: number): TextifyResult {
    try {
      const text = JSON.stringify(args);
      const bytes = Buffer.byteLength(text, 'utf8');
      if (bytes > maxBytes) {
        return {
          ok: false,
          text,
          bytes,
          reason: `Arguments exceed max bytes (${bytes} > ${maxBytes})`
        };
      }

      return {
        ok: true,
        text,
        bytes
      };
    } catch (err) {
      return {
        ok: false,
        text: '',
        bytes: 0,
        reason: `Arguments are not textifiable: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  private isLikelyContextWindowError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return CONTEXT_WINDOW_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  }

  private resolveEffectiveMaxParameterBytes(registration: RegisteredLLMFunction, args: any[]): number {
    if (
      typeof registration.config.maxParameterBytes === 'number'
      && Number.isFinite(registration.config.maxParameterBytes)
      && registration.config.maxParameterBytes > 0
    ) {
      return registration.config.maxParameterBytes;
    }

    if (registration.config.adaptiveParameterBytes === false) {
      return DEFAULT_FUNCTION_MAX_PARAM_BYTES_BASE;
    }

    const adaptiveCeiling = (
      typeof registration.config.adaptiveParameterBytesMax === 'number'
      && Number.isFinite(registration.config.adaptiveParameterBytesMax)
      && registration.config.adaptiveParameterBytesMax > 0
    )
      ? registration.config.adaptiveParameterBytesMax
      : DEFAULT_FUNCTION_MAX_PARAM_BYTES_ADAPTIVE_MAX;

    try {
      const text = JSON.stringify(args);
      const bytes = Buffer.byteLength(text, 'utf8');
      if (bytes <= DEFAULT_FUNCTION_MAX_PARAM_BYTES_BASE) {
        return DEFAULT_FUNCTION_MAX_PARAM_BYTES_BASE;
      }

      const withHeadroom = Math.ceil(bytes * 1.15);
      return Math.min(Math.max(withHeadroom, DEFAULT_FUNCTION_MAX_PARAM_BYTES_BASE), adaptiveCeiling);
    } catch {
      return DEFAULT_FUNCTION_MAX_PARAM_BYTES_BASE;
    }
  }

  private normalizeLLMFunctionConfig(config: LLMFunctionConfig): LLMFunctionConfig {
    return {
      ...config,
      adaptiveParameterBytes: config.adaptiveParameterBytes ?? true,
      adaptiveParameterBytesMax: config.adaptiveParameterBytesMax ?? DEFAULT_FUNCTION_MAX_PARAM_BYTES_ADAPTIVE_MAX
    };
  }

  private getLLMFunctionCallableMap(): Record<string, (...args: any[]) => Promise<any>> {
    const result: Record<string, (...args: any[]) => Promise<any>> = {};
    for (const name of this.llmFunctions.keys()) {
      result[name] = async (...args: any[]) => await this.invokeLLMFunction(name, ...args);
    }
    return result;
  }

  private async reviewCodeAndGetPatch(
    taskDescription: string,
    code: string,
    errorMessage: string,
    callId: string,
    logger: DebugLogger
  ): Promise<string | null> {
    logger.emit({
      source: 'context',
      level: 'debug',
      event: 'context.review.start',
      callId,
      payload: {
        taskDescription,
        errorMessage
      }
    });

    const reviewRequest = [
      '[REVIEW_CODE_TASK]',
      `Original task: ${taskDescription}`,
      `Runtime error: ${errorMessage}`,
      'Please review the failing code and return only a patched eval response.',
      'You must output JSON as {"intent":"eval","code":"..."}.',
      'Failing code:',
      code
    ].join('\n');

    const reviewHistory: Message[] = [
      ...this.history,
      { role: 'user', content: reviewRequest }
    ];

    const response = await this.provider.generate(
      reviewHistory,
      this.getSkillsForProvider(),
      { callId, logger }
    );

    if (response.message.intent === 'eval') {
      logger.emit({
        source: 'context',
        level: 'info',
        event: 'context.review.success',
        callId,
        payload: {
          patchedCodeLength: response.message.code.length
        }
      });
      return response.message.code;
    }

    logger.emit({
      source: 'context',
      level: 'warn',
      event: 'context.review.failed',
      callId,
      payload: {
        reason: 'review response was not eval intent',
        response: response.message
      }
    });
    return null;
  }

  private async regenerateLLMFunctionCodeFromError(
    registration: RegisteredLLMFunction,
    previousCode: string,
    errorMessage: string,
    callId: string,
    logger: DebugLogger
  ): Promise<string | null> {
    const repairPrompt = [
      '[LLM_FUNCTION_CODE_REPAIR]',
      `Function name: ${registration.config.name}`,
      `Description: ${registration.config.description}`,
      `Parameters schema: ${JSON.stringify(registration.config.parameters)}`,
      `Execution error: ${errorMessage}`,
      'Please return repaired TypeScript code as intent=eval.',
      'Previous code:',
      previousCode
    ].join('\n');

    const response = await this.provider.generate(
      [{ role: 'user', content: repairPrompt }],
      this.getSkillsForProvider(),
      { callId, logger }
    );

    if (response.message.intent === 'eval') {
      return response.message.code;
    }

    if (
      response.message.intent === 'return'
      && response.message.value
      && typeof response.message.value === 'object'
      && typeof (response.message.value as { code?: unknown }).code === 'string'
    ) {
      return (response.message.value as { code: string }).code;
    }

    return null;
  }

  private async generateLLMFunctionCode(
    registration: RegisteredLLMFunction,
    callId: string,
    logger: DebugLogger
  ): Promise<string> {
    const prompt = [
      '[LLM_FUNCTION_CODE_GENERATION]',
      `Function name: ${registration.config.name}`,
      `Description: ${registration.config.description}`,
      `Parameters schema: ${JSON.stringify(registration.config.parameters)}`,
      'Generate reusable TypeScript code (eval intent) that reads input from `const __luminaInput = ...`.',
      'Return final result at the end.',
      'If validation fails, return a lumina error envelope object and throw it (or return it for outer throw handling).'
    ].join('\n');

    const response = await this.provider.generate(
      [{ role: 'user', content: prompt }],
      this.getSkillsForProvider(),
      { callId, logger }
    );

    if (response.message.intent === 'eval') {
      return response.message.code;
    }

    if (
      response.message.intent === 'return'
      && response.message.value
      && typeof response.message.value === 'object'
      && typeof (response.message.value as { code?: unknown }).code === 'string'
    ) {
      return (response.message.value as { code: string }).code;
    }

    throw new Error('LLM function code generation did not return eval code.');
  }

  private buildFunctionInputObject(config: LLMFunctionConfig, args: any[]): Record<string, any> {
    const schema = config.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    };

    const paramNames = Array.isArray(schema.required)
      ? schema.required
      : schema.properties
        ? Object.keys(schema.properties)
        : args.map((_, index) => `arg${index}`);

    const input: Record<string, any> = {};
    for (let i = 0; i < args.length; i++) {
      input[paramNames[i] ?? `arg${i}`] = args[i];
    }
    return input;
  }

  private async runLLMFunctionCode(
    registration: RegisteredLLMFunction,
    args: any[],
    code: string,
    callId: string,
    logger: DebugLogger
  ): Promise<any> {
    const inputObject = this.buildFunctionInputObject(registration.config, args);
    const serializedInput = JSON.stringify(inputObject);
    const invocationCode = `const __luminaInput = ${serializedInput};\n${code}`;

    const result = await Sandbox.runCode(
      invocationCode,
      this.memory,
      this.skills,
      {
        clone: () => this.clone(),
        create: (prompt: string) => this.create(prompt),
        llmFunctions: this.getLLMFunctionCallableMap(),
        createLLMFunction: async (config) => await this.registerLLMFunctionFromSandbox(config)
      },
      { callId, logger },
      this.config.sandbox
    );

    return this.unwrapResultOrThrow(result, `llmFunction:${registration.config.name}:code`);
  }

  private async runLLMFunctionCodeWithRecovery(
    registration: RegisteredLLMFunction,
    args: any[],
    initialCode: string,
    callId: string,
    logger: DebugLogger
  ): Promise<any> {
    const retryPolicy = this.getRetryPolicy();

    let compileAttempts = 0;
    let runtimeAttempts = 0;
    let reviewAttempts = 0;
    let activeCode = initialCode;

    while (
      compileAttempts <= retryPolicy.maxCompileRetries
      && runtimeAttempts <= retryPolicy.maxRuntimeRetries
    ) {
      try {
        return await this.runLLMFunctionCode(registration, args, activeCode, callId, logger);
      } catch (err) {
        const sandboxError = err instanceof SandboxExecutionError
          ? err
          : new SandboxExecutionError('runtime', err instanceof Error ? err.message : String(err), {
            sourceCode: activeCode,
            runtimeCode: activeCode,
            aiCodeFrame: true,
            cause: err
          });

        if (sandboxError.category === 'runtime') {
          runtimeAttempts++;

          if (sandboxError.aiCodeFrame && reviewAttempts < retryPolicy.maxReviewRetries) {
            reviewAttempts++;
            const patchedCode = await this.reviewCodeAndGetPatch(
              `llm function ${registration.config.name}`,
              activeCode,
              sandboxError.message,
              callId,
              logger
            );

            if (patchedCode) {
              activeCode = patchedCode;
              registration.state.revision += 1;
              continue;
            }
          }

          if (runtimeAttempts > retryPolicy.maxRuntimeRetries) {
            throw new Error(
              `LLM function runtime retries exhausted (${runtimeAttempts}/${retryPolicy.maxRuntimeRetries}). Last error: ${sandboxError.message}`
            );
          }

          const regeneratedCode = await this.regenerateLLMFunctionCodeFromError(
            registration,
            activeCode,
            sandboxError.message,
            callId,
            logger
          );

          if (!regeneratedCode) {
            throw sandboxError;
          }

          activeCode = regeneratedCode;
          registration.state.revision += 1;
          continue;
        }

        compileAttempts++;
        if (compileAttempts > retryPolicy.maxCompileRetries) {
          throw new Error(
            `LLM function compile retries exhausted (${compileAttempts}/${retryPolicy.maxCompileRetries}). Last error: ${sandboxError.message}`
          );
        }

        const regeneratedCode = await this.regenerateLLMFunctionCodeFromError(
          registration,
          activeCode,
          sandboxError.message,
          callId,
          logger
        );

        if (!regeneratedCode) {
          throw sandboxError;
        }

        activeCode = regeneratedCode;
        registration.state.revision += 1;
      }
    }

    throw new Error(
      `LLM function execution exhausted retries. compileAttempts=${compileAttempts}, runtimeAttempts=${runtimeAttempts}`
    );
  }

  private async negotiateLLMFunctionMode(
    registration: RegisteredLLMFunction,
    args: any[],
    callId: string,
    logger: DebugLogger
  ): Promise<LLMFunctionMode> {
    if (registration.config.preferredMode) {
      return registration.config.preferredMode;
    }

    const maxParameterBytes = this.resolveEffectiveMaxParameterBytes(registration, args);
    const textified = this.textifyArguments(args, maxParameterBytes);

    const negotiationPrompt = [
      '[LLM_FUNCTION_MODE_NEGOTIATION]',
      `Function name: ${registration.config.name}`,
      `Description: ${registration.config.description}`,
      `Parameters schema: ${JSON.stringify(registration.config.parameters)}`,
      `Args textifiable: ${textified.ok}`,
      `Args bytes: ${textified.bytes}`,
      `Effective max bytes: ${maxParameterBytes}`,
      `Args textify reason: ${textified.reason ?? 'ok'}`,
      'Choose execution mode and return JSON as intent=return, value={"mode":"return"|"code"}.',
      'If arguments are not safely textifiable, choose code mode.'
    ].join('\n');

    const response = await this.provider.generate(
      [{ role: 'user', content: negotiationPrompt }],
      this.getSkillsForProvider(),
      { callId, logger }
    );

    if (response.message.intent === 'eval') {
      return 'code';
    }

    const value = response.message.value;
    if (typeof value === 'string' && (value === 'return' || value === 'code')) {
      return value;
    }

    if (value && typeof value === 'object' && typeof (value as { mode?: unknown }).mode === 'string') {
      const mode = (value as { mode: string }).mode;
      if (mode === 'return' || mode === 'code') {
        return mode;
      }
    }

    return textified.ok ? 'return' : 'code';
  }

  public registerLLMFunction(config: LLMFunctionConfig): (...args: any[]) => Promise<any> {
    const normalizedConfig = this.normalizeLLMFunctionConfig(config);
    const existing = this.llmFunctions.get(normalizedConfig.name);

    if (existing) {
      existing.config = {
        ...existing.config,
        ...normalizedConfig
      };
      return async (...args: any[]) => await this.invokeLLMFunction(normalizedConfig.name, ...args);
    }

    this.llmFunctions.set(normalizedConfig.name, {
      config: normalizedConfig,
      state: {
        mode: normalizedConfig.preferredMode,
        revision: 0
      }
    });

    return async (...args: any[]) => await this.invokeLLMFunction(normalizedConfig.name, ...args);
  }

  public async invokeLLMFunction(name: string, ...args: any[]): Promise<any> {
    const registration = this.llmFunctions.get(name);
    if (!registration) {
      throw new Error(`LLM function not registered: ${name}`);
    }

    const callId = randomUUID();
    const logger = new DebugLogger(this.config.debug);

    logger.emit({
      source: 'context',
      level: 'info',
      event: 'context.llm_function.start',
      callId,
      payload: {
        name,
        argsCount: args.length,
        lastMode: registration.state.mode
      }
    });

    let mode = registration.config.preferredMode
      ?? await this.negotiateLLMFunctionMode(registration, args, callId, logger);

    registration.state.mode = mode;

    if (mode === 'return') {
      const maxParameterBytes = this.resolveEffectiveMaxParameterBytes(registration, args);
      const textified = this.textifyArguments(args, maxParameterBytes);

      if (!textified.ok) {
        mode = 'code';
        registration.state.mode = mode;
      } else {
        const returnPrompt = [
          '[LLM_FUNCTION_RETURN_CALL]',
          `Function: ${registration.config.name}`,
          `Description: ${registration.config.description}`,
          `Parameters schema: ${JSON.stringify(registration.config.parameters)}`,
          `Effective max bytes: ${maxParameterBytes}`,
          `Arguments JSON: ${textified.text}`,
          'You should prefer intent=return. If argument validation fails, return a lumina error envelope object.'
        ].join('\n');

        try {
          const result = await this.call(returnPrompt);
          return this.unwrapResultOrThrow(result, `llmFunction:${registration.config.name}:return`);
        } catch (err) {
          if (!this.isLikelyContextWindowError(err)) {
            throw err;
          }

          logger.emit({
            source: 'context',
            level: 'warn',
            event: 'context.llm_function.return_mode_context_overflow',
            callId,
            payload: {
              name,
              error: err instanceof Error ? err.message : String(err),
              action: 'fallback_to_code_mode'
            }
          });

          mode = 'code';
          registration.state.mode = mode;
        }
      }
    }

    const generatedCode = await this.generateLLMFunctionCode(registration, callId, logger);
    registration.state.revision += 1;

    return await this.runLLMFunctionCodeWithRecovery(registration, args, generatedCode, callId, logger);
  }

  private async registerLLMFunctionFromSandbox(
    config: { name: string; description: string; parameters?: object }
  ): Promise<string> {
    this.registerLLMFunction({
      name: config.name,
      description: config.description,
      parameters: config.parameters ?? {}
    });

    return config.name;
  }

  public defineTSFunction<TArgs extends any[], TResult>(
    name: string,
    fn: (...args: [...TArgs, TSFunctionLLMContext]) => Promise<TResult> | TResult,
    options: Omit<DefineSkillOptions, 'name'> = {}
  ): (...args: TArgs) => Promise<TResult> {
    const skill = defineSkill(name, async (...args: any[]) => {
      return await fn(...args as TArgs, this.buildTSFunctionLLMContext());
    }, options);

    this.injectSkill(skill);

    return async (...args: TArgs) => {
      return await skill.execute(...args) as TResult;
    };
  }

  /**
   * Clone current context. Produces a deep copy of memory but keeps history shallow copied.
   */
  public async clone(): Promise<LuminaContext> {
    const memoryClone = structuredClone(this.memory);
    const historyClone = [...this.history];
    const skillsClone = new Map(this.skills);
    const cloned = new LuminaContext(
      this.provider,
      memoryClone,
      skillsClone,
      historyClone,
      this.config
    );

    cloned.llmFunctions = new Map(
      Array.from(this.llmFunctions.entries()).map(([name, registration]) => [
        name,
        {
          config: { ...registration.config },
          state: {
            ...registration.state
          }
        }
      ])
    );

    return cloned;
  }

  /**
   * Create a fresh context. History and memory are clear.
   */
  public async create(systemPrompt?: string): Promise<LuminaContext> {
    const history: Message[] = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
    const created = new LuminaContext(
      this.provider,
      {},
      new Map(this.skills),
      history,
      this.config
    );

    created.llmFunctions = new Map(
      Array.from(this.llmFunctions.entries()).map(([name, registration]) => [
        name,
        {
          config: { ...registration.config },
          state: {
            ...registration.state
          }
        }
      ])
    );

    return created;
  }

  /**
   * Register a new skill for the context.
   */
  public injectSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  /**
   * Register multiple skills in one call.
   */
  public injectSkills(...skills: AnySkill[]): void {
    for (const skill of skills) {
      this.skills.set(skill.name, skill);
    }
  }

  /**
   * Register a knowledge-only skill.
   */
  public injectKnowledge(skill: KnowledgeSkill): void {
    if (!isKnowledgeSkill(skill)) {
      throw new Error('injectKnowledge only accepts knowledge skills.');
    }
    this.skills.set(skill.name, skill);
  }

  /**
   * Register a map of plain TS functions as executable skills.
   * Every function call automatically appends a runtime LLM context object.
   */
  public injectFunctionMap(functionMap: Record<string, (...args: any[]) => any>): void {
    for (const [name, fn] of Object.entries(functionMap)) {
      this.injectSkill(defineSkill(name, async (...args: any[]) => {
        return await fn(...args, this.buildTSFunctionLLMContext());
      }));
    }
  }

  /**
   * Core execute function. Exposed as a callable.
   */
  public async call(taskDescription: string): Promise<any> {
    const callId = randomUUID();
    const debugLogger = new DebugLogger(this.config.debug);
    const retryPolicy = this.getRetryPolicy();

    debugLogger.emit({
      source: 'context',
      level: 'info',
      event: 'context.call.start',
      callId,
      payload: {
        taskDescription,
        historyLength: this.history.length,
        skillCount: this.skills.size,
        retryPolicy
      }
    });

    this.history.push({ role: 'user', content: taskDescription });

    let compileAttempts = 0;
    let runtimeAttempts = 0;
    let reviewAttempts = 0;

    while (
      compileAttempts <= retryPolicy.maxCompileRetries
      && runtimeAttempts <= retryPolicy.maxRuntimeRetries
    ) {
      debugLogger.emit({
        source: 'context',
        level: 'debug',
        event: 'context.call.attempt',
        callId,
        payload: {
          compileAttempts,
          runtimeAttempts,
          reviewAttempts
        }
      });

      const response = await this.provider.generate(
        this.history,
        this.getSkillsForProvider(),
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
        this.history.push({ role: 'assistant', content: JSON.stringify(llmMessage) });
        const finalValue = this.unwrapResultOrThrow(llmMessage.value, 'context.call.return');

        debugLogger.emit({
          source: 'context',
          level: 'info',
          event: 'context.call.return',
          callId,
          payload: {
            value: finalValue
          }
        });

        return finalValue;
      }

      if (llmMessage.intent === 'eval') {
        this.history.push({ role: 'assistant', content: JSON.stringify(llmMessage) });

        let activeCode = llmMessage.code;

        while (true) {
          try {
            const result = await Sandbox.runCode(
              activeCode,
              this.memory,
              this.skills,
              {
                clone: () => this.clone(),
                create: (prompt: string) => this.create(prompt),
                llmFunctions: this.getLLMFunctionCallableMap(),
                createLLMFunction: async (config) => await this.registerLLMFunctionFromSandbox(config)
              },
              { callId, logger: debugLogger },
              this.config.sandbox
            );

            const finalResult = this.unwrapResultOrThrow(result, 'context.call.eval');

            debugLogger.emit({
              source: 'context',
              level: 'info',
              event: 'context.call.eval_success',
              callId,
              payload: {
                result: finalResult
              }
            });

            return finalResult;
          } catch (err: any) {
            const sandboxError = err instanceof SandboxExecutionError
              ? err
              : new SandboxExecutionError('runtime', err?.message ?? String(err), {
                sourceCode: activeCode,
                runtimeCode: activeCode,
                aiCodeFrame: true,
                cause: err
              });

            if (sandboxError.category === 'runtime') {
              runtimeAttempts++;

              if (
                sandboxError.aiCodeFrame
                && reviewAttempts < retryPolicy.maxReviewRetries
              ) {
                reviewAttempts++;
                const patchedCode = await this.reviewCodeAndGetPatch(
                  taskDescription,
                  activeCode,
                  sandboxError.message,
                  callId,
                  debugLogger
                );

                if (patchedCode) {
                  activeCode = patchedCode;
                  this.history.push({
                    role: 'assistant',
                    content: JSON.stringify({ intent: 'eval', code: patchedCode })
                  });
                  continue;
                }
              }

              if (runtimeAttempts > retryPolicy.maxRuntimeRetries) {
                throw new Error(
                  `Runtime retries exhausted (${runtimeAttempts}/${retryPolicy.maxRuntimeRetries}). Last error: ${sandboxError.message}`
                );
              }

              const runtimeErrorMessage = [
                '[RUNTIME_ERROR]',
                `error=${sandboxError.message}`,
                `runtimeAttempts=${runtimeAttempts}/${retryPolicy.maxRuntimeRetries}`,
                'Please fix runtime logic and return a valid response.'
              ].join('\n');

              this.history.push({ role: 'user', content: runtimeErrorMessage });

              break;
            }

            compileAttempts++;
            if (compileAttempts > retryPolicy.maxCompileRetries) {
              throw new Error(
                `Compile retries exhausted (${compileAttempts}/${retryPolicy.maxCompileRetries}). Last error: ${sandboxError.message}`
              );
            }

            const compileErrorMessage = [
              '[COMPILE_OR_POLICY_ERROR]',
              `category=${sandboxError.category}`,
              `error=${sandboxError.message}`,
              `compileAttempts=${compileAttempts}/${retryPolicy.maxCompileRetries}`,
              'Please fix compile/policy/install issues and regenerate code.'
            ].join('\n');

            this.history.push({ role: 'user', content: compileErrorMessage });

            break;
          }
        }
      } else {
        throw new Error(`Unknown intent received from LLM: ${(llmMessage as any).intent}`);
      }
    }

    throw new Error(
      `Context call finished without result. compileAttempts=${compileAttempts}, runtimeAttempts=${runtimeAttempts}`
    );
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
