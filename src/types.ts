export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type DebugLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface DebugEvent {
  timestamp: string;
  level: DebugLevel;
  source: 'context' | 'provider' | 'sandbox' | 'system';
  event: string;
  callId?: string;
  payload?: unknown;
}

export interface DebugSink {
  log(event: DebugEvent): void;
}

export interface DebugLoggerLike {
  emit(event: Omit<DebugEvent, 'timestamp'>): void;
}

export interface DebugConfig {
  enabled?: boolean;
  level?: DebugLevel;
  filePath?: string;
  mirrorToConsole?: boolean;
  maxFieldLength?: number;
  memoryLimit?: number;
  sink?: DebugSink;
}

export interface DebugRuntimeContext {
  callId: string;
  logger: DebugLoggerLike;
}

export interface Skill {
  name: string;
  description: string;
  parameters: object; // JSON schema for parameters
  execute: (...args: any[]) => Promise<any> | any;
}

export interface LuminaConfig {
  maxRetries: number;
  debug?: DebugConfig;
}

export type LLMResponse = 
  | { intent: 'return'; value: any }
  | { intent: 'eval'; code: string };

export interface ProviderResponse {
  message: LLMResponse;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ILLMProvider {
  /**
   * Generates a response based on the conversation history and available skills.
   */
  generate(
    history: Message[],
    skills: Skill[],
    debugContext?: DebugRuntimeContext
  ): Promise<ProviderResponse>;
}
