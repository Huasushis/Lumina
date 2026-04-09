import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  LLMFunctionConfig,
  LLMFunctionState,
  PersistedLLMFunctionDocument,
  PersistedLLMFunctionEntry,
  RegisteredLLMFunction
} from './types.js';

export const DEFAULT_LLM_FUNCTION_STORE_PATH = '.lumina/functions.json';

function createEmptyDocument(): PersistedLLMFunctionDocument {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    functions: {}
  };
}

function normalizeFunctionState(state: Partial<LLMFunctionState> | undefined): LLMFunctionState {
  return {
    mode: state?.mode,
    cachedCode: typeof state?.cachedCode === 'string' ? state.cachedCode : undefined,
    revision: typeof state?.revision === 'number' && Number.isFinite(state.revision)
      ? state.revision
      : 0
  };
}

function normalizeFunctionConfig(config: Partial<LLMFunctionConfig> | undefined, fallbackName: string): LLMFunctionConfig {
  return {
    name: typeof config?.name === 'string' && config.name.length > 0 ? config.name : fallbackName,
    description: typeof config?.description === 'string' ? config.description : '',
    parameters: config?.parameters && typeof config.parameters === 'object' ? config.parameters : {},
    preferredMode: config?.preferredMode,
    maxParameterBytes: typeof config?.maxParameterBytes === 'number' ? config.maxParameterBytes : undefined,
    adaptiveParameterBytes: typeof config?.adaptiveParameterBytes === 'boolean'
      ? config.adaptiveParameterBytes
      : undefined,
    adaptiveParameterBytesMax: typeof config?.adaptiveParameterBytesMax === 'number'
      ? config.adaptiveParameterBytesMax
      : undefined,
    enableCodeCache: typeof config?.enableCodeCache === 'boolean' ? config.enableCodeCache : undefined
  };
}

function normalizeEntry(entry: Partial<PersistedLLMFunctionEntry> | undefined, key: string): PersistedLLMFunctionEntry {
  const config = normalizeFunctionConfig(entry?.config, key);
  const state = normalizeFunctionState(entry?.state);

  return {
    config,
    state,
    updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString()
  };
}

function normalizeDocument(value: unknown): PersistedLLMFunctionDocument {
  if (!value || typeof value !== 'object') {
    return createEmptyDocument();
  }

  const candidate = value as Partial<PersistedLLMFunctionDocument>;
  const functions: Record<string, PersistedLLMFunctionEntry> = {};

  const sourceFunctions = candidate.functions;
  if (sourceFunctions && typeof sourceFunctions === 'object') {
    for (const [name, entry] of Object.entries(sourceFunctions)) {
      if (!name) {
        continue;
      }
      functions[name] = normalizeEntry(entry, name);
    }
  }

  return {
    version: 1,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    functions
  };
}

function toRegistration(entry: PersistedLLMFunctionEntry): RegisteredLLMFunction {
  return {
    config: normalizeFunctionConfig(entry.config, entry.config.name),
    state: normalizeFunctionState(entry.state)
  };
}

function fromRegistration(registration: RegisteredLLMFunction): PersistedLLMFunctionEntry {
  return {
    config: normalizeFunctionConfig(registration.config, registration.config.name),
    state: normalizeFunctionState(registration.state),
    updatedAt: new Date().toISOString()
  };
}

export class LLMFunctionStore {
  private readonly filePath: string;

  constructor(filePath: string = DEFAULT_LLM_FUNCTION_STORE_PATH) {
    this.filePath = path.resolve(filePath);
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public async loadAll(): Promise<Map<string, RegisteredLLMFunction>> {
    const document = await this.readDocument();
    const result = new Map<string, RegisteredLLMFunction>();

    for (const [name, entry] of Object.entries(document.functions)) {
      result.set(name, toRegistration(entry));
    }

    return result;
  }

  public async saveAll(functions: Map<string, RegisteredLLMFunction>): Promise<void> {
    const document = createEmptyDocument();
    document.updatedAt = new Date().toISOString();

    for (const [name, registration] of functions.entries()) {
      document.functions[name] = fromRegistration(registration);
    }

    await this.writeDocument(document);
  }

  public async upsertOne(name: string, registration: RegisteredLLMFunction): Promise<void> {
    const document = await this.readDocument();
    document.functions[name] = fromRegistration(registration);
    document.updatedAt = new Date().toISOString();
    await this.writeDocument(document);
  }

  public async removeOne(name: string): Promise<void> {
    const document = await this.readDocument();
    delete document.functions[name];
    document.updatedAt = new Date().toISOString();
    await this.writeDocument(document);
  }

  private async readDocument(): Promise<PersistedLLMFunctionDocument> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      try {
        const parsed = JSON.parse(raw) as unknown;
        return normalizeDocument(parsed);
      } catch {
        await this.backupCorruptedStore();
        return createEmptyDocument();
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        return createEmptyDocument();
      }
      throw err;
    }
  }

  private async writeDocument(document: PersistedLLMFunctionDocument): Promise<void> {
    await this.ensureParentDirectory();

    const serialized = `${JSON.stringify(document, null, 2)}\n`;
    const temporaryFilePath = `${this.filePath}.${Date.now()}.${process.pid}.tmp`;

    await writeFile(temporaryFilePath, serialized, 'utf8');
    await rename(temporaryFilePath, this.filePath);
  }

  private async ensureParentDirectory(): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
  }

  private async backupCorruptedStore(): Promise<void> {
    try {
      const backupPath = `${this.filePath}.corrupt.${Date.now()}`;
      await rename(this.filePath, backupPath);
    } catch {
      // best effort only; if rename fails we still recover with empty document
    }
  }
}
