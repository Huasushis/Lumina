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

export type ImportPolicy = 'deny' | 'allowlist' | 'all';

export type InstallProvider = 'auto' | 'pnpm' | 'npm';

export interface RetryPolicy {
  maxRuntimeRetries?: number;
  maxCompileRetries?: number;
  maxReviewRetries?: number;
}

export type SandboxErrorCategory = 'compile' | 'runtime' | 'policy' | 'install';

export interface SkillMetadata {
  tags?: string[];
  category?: string;
  examples?: Array<{
    input: unknown;
    output: unknown;
  }>;
  deprecated?: boolean;
  version?: string;
}

export interface ExecutableSkill {
  kind?: 'executable';
  name: string;
  description: string;
  parameters: object; // JSON schema for parameters
  execute: (...args: any[]) => Promise<any> | any;
  metadata?: SkillMetadata;
}

export interface KnowledgeSkill {
  kind: 'knowledge';
  name: string;
  description: string;
  content: string;
  metadata?: SkillMetadata;
}

// Backward-compatible alias used by existing code.
export type Skill = ExecutableSkill;

export type AnySkill = ExecutableSkill | KnowledgeSkill;

export function isKnowledgeSkill(skill: AnySkill): skill is KnowledgeSkill {
  return skill.kind === 'knowledge';
}

export function isExecutableSkill(skill: AnySkill): skill is ExecutableSkill {
  return !isKnowledgeSkill(skill);
}

export interface SkillSelectionCandidate {
  name: string;
  description: string;
  kind: 'executable' | 'knowledge';
  tags?: string[];
  category?: string;
}

export interface SkillSelectionResultItem {
  name: string;
  score: number;
  reason: string;
}

export interface SkillSelectionConstraints {
  topN?: number;
  includeNames?: string[];
  excludeNames?: string[];
  includeTags?: string[];
  excludeTags?: string[];
}

export type SkillSelectorQueryFunction = (
  query: string,
  candidates: SkillSelectionCandidate[],
  constraints?: SkillSelectionConstraints
) => Promise<SkillSelectionResultItem[]>;

export interface LuminaSandboxConfig {
  language?: 'javascript' | 'typescript';
  timeoutMs?: number;
  importPolicy?: ImportPolicy;
  allowedImports?: string[];
  autoInstallMissingPackages?: boolean;
  installProvider?: InstallProvider;
  packageRegistry?: string;
  maxInstallAttempts?: number;
}

export interface LLMFunctionPersistenceConfig {
  enabled?: boolean;
  filePath?: string;
  autoLoad?: boolean;
  autoSave?: boolean;
}

export interface SkillFilterConfig extends SkillSelectionConstraints {
  enabled?: boolean;
  applyToLLMFunctions?: boolean;
  selectorSkillName?: string;
}

export interface LuminaConfig {
  maxRetries: number;
  retry?: RetryPolicy;
  debug?: DebugConfig;
  sandbox?: LuminaSandboxConfig;
  persistence?: LLMFunctionPersistenceConfig;
  skillFilter?: SkillFilterConfig;
}

export type LLMFunctionMode = 'return' | 'code';

export interface LLMFunctionConfig {
  name: string;
  description: string;
  parameters: object;
  preferredMode?: LLMFunctionMode;
  maxParameterBytes?: number;
  adaptiveParameterBytes?: boolean;
  adaptiveParameterBytesMax?: number;
  enableCodeCache?: boolean;
}

export interface LLMFunctionState {
  mode?: LLMFunctionMode;
  cachedCode?: string;
  revision: number;
}

export interface RegisteredLLMFunction {
  config: LLMFunctionConfig;
  state: LLMFunctionState;
}

export interface PersistedLLMFunctionEntry {
  config: LLMFunctionConfig;
  state: LLMFunctionState;
  updatedAt: string;
}

export interface PersistedLLMFunctionDocument {
  version: 1;
  updatedAt: string;
  functions: Record<string, PersistedLLMFunctionEntry>;
}

export interface LLMErrorEnvelope {
  __luminaError: true;
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
}

export function isLuminaErrorEnvelope(value: unknown): value is LLMErrorEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LLMErrorEnvelope>;
  return candidate.__luminaError === true
    && typeof candidate.code === 'string'
    && typeof candidate.message === 'string';
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
    skills: AnySkill[],
    debugContext?: DebugRuntimeContext
  ): Promise<ProviderResponse>;
}
