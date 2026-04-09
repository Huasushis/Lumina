import { execFile } from 'node:child_process';
import { builtinModules, createRequire } from 'node:module';
import vm from 'node:vm';
import { promisify } from 'node:util';
import ts from 'typescript';
import {
  AnySkill,
  DebugRuntimeContext,
  ImportPolicy,
  InstallProvider,
  isExecutableSkill,
  isKnowledgeSkill,
  LuminaSandboxConfig,
  SandboxErrorCategory
} from './types.js';

const execFileAsync = promisify(execFile);
const workspaceRequire = createRequire(`${process.cwd().replace(/\\/g, '/')}/package.json`);
const builtinModuleSet = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => name.replace(/^node:/, ''))
]);

function isRelativeModule(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/');
}

function isNodeBuiltin(specifier: string): boolean {
  const normalized = specifier.replace(/^node:/, '');
  return builtinModuleSet.has(specifier) || builtinModuleSet.has(normalized);
}

function getPackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return `${scope}/${name ?? ''}`;
  }
  return specifier.split('/')[0] ?? specifier;
}

function extractModuleSpecifiers(code: string): string[] {
  const specs = new Set<string>();

  const importFromRegex = /\bimport\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  const bareImportRegex = /\bimport\s+['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requireRegex = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const regex of [importFromRegex, bareImportRegex, dynamicImportRegex, requireRegex]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(code)) !== null) {
      specs.add(match[1]);
    }
  }

  return Array.from(specs);
}

function validateImportPolicy(
  specifiers: string[],
  policy: ImportPolicy,
  allowedImports: Set<string>
): { externalPackages: string[]; relativeImports: string[] } {
  const relativeImports = specifiers.filter(isRelativeModule);
  const builtinImports = specifiers.filter(isNodeBuiltin);

  const externalPackages = specifiers
    .filter((item) => !isRelativeModule(item))
    .filter((item) => !isNodeBuiltin(item))
    .map(getPackageName);

  if (policy === 'deny' && (externalPackages.length > 0 || relativeImports.length > 0 || builtinImports.length > 0)) {
    throw new Error(
      `Import policy is deny, but imports were found: ${[...externalPackages, ...relativeImports, ...builtinImports].join(', ')}`
    );
  }

  if (relativeImports.length > 0) {
    throw new Error(`Relative imports are not supported in sandbox: ${relativeImports.join(', ')}`);
  }

  if (policy === 'allowlist') {
    const blocked = externalPackages.filter((pkg) => !allowedImports.has(pkg));
    if (blocked.length > 0) {
      throw new Error(
        `Import allowlist violation. Blocked: ${blocked.join(', ')}. Allowed: ${Array.from(allowedImports).join(', ') || '(empty)'}`
      );
    }
  }

  return {
    externalPackages: Array.from(new Set(externalPackages)),
    relativeImports
  };
}

function compileTypeScript(code: string): string {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      strict: false,
      esModuleInterop: true
    },
    reportDiagnostics: true
  });

  const diagnostics = (result.diagnostics ?? []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error
  );
  if (diagnostics.length > 0) {
    const message = diagnostics
      .map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n'))
      .join(' | ');
    throw new Error(message);
  }

  return result.outputText;
}

function normalizeSkillArguments(skill: { parameters: object }, args: any[]): any[] {
  if (args.length !== 1) {
    return args;
  }

  const first = args[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    return args;
  }

  const parameterSchema = skill.parameters as Record<string, unknown>;
  const required = Array.isArray(parameterSchema.required)
    ? (parameterSchema.required as string[])
    : [];

  if (required.length > 0) {
    return required.map((name) => (first as Record<string, unknown>)[name]);
  }

  const properties = parameterSchema.properties as Record<string, unknown> | undefined;
  if (properties && typeof properties === 'object') {
    return Object.keys(properties).map((name) => (first as Record<string, unknown>)[name]);
  }

  return args;
}

function isPackageInstalled(packageName: string): boolean {
  try {
    workspaceRequire.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ['--version'], { cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

async function selectInstallProvider(provider: InstallProvider): Promise<'pnpm' | 'npm'> {
  if (provider === 'pnpm') {
    return 'pnpm';
  }
  if (provider === 'npm') {
    return 'npm';
  }

  if (await commandExists('pnpm')) {
    return 'pnpm';
  }
  return 'npm';
}

async function installPackage(
  packageName: string,
  config: LuminaSandboxConfig
): Promise<void> {
  const provider = await selectInstallProvider(config.installProvider ?? 'auto');
  const registry = config.packageRegistry;

  if (provider === 'pnpm') {
    const args = ['add', packageName];
    if (registry) {
      args.push('--registry', registry);
    }
    await execFileAsync('pnpm', args, { cwd: process.cwd() });
    return;
  }

  const args = ['install', packageName];
  if (registry) {
    args.push('--registry', registry);
  }
  await execFileAsync('npm', args, { cwd: process.cwd() });
}

async function ensurePackagesAvailable(
  packageNames: string[],
  config: LuminaSandboxConfig,
  debugContext?: DebugRuntimeContext
): Promise<void> {
  const callId = debugContext?.callId;
  const missing = packageNames.filter((item) => !isPackageInstalled(item));
  if (missing.length === 0) {
    return;
  }

  const policy = config.importPolicy ?? 'deny';
  const shouldAutoInstall = config.autoInstallMissingPackages
    ?? (policy === 'allowlist' || policy === 'all');

  if (!shouldAutoInstall) {
    throw new Error(
      `Missing packages detected: ${missing.join(', ')}. Enable autoInstallMissingPackages or install them manually.`
    );
  }

  const maxInstallAttempts = config.maxInstallAttempts ?? 1;

  for (const pkg of missing) {
    let attempt = 0;
    while (attempt < maxInstallAttempts) {
      attempt++;
      debugContext?.logger.emit({
        source: 'sandbox',
        level: 'debug',
        event: 'sandbox.install.attempt',
        callId,
        payload: {
          packageName: pkg,
          attempt,
          maxInstallAttempts
        }
      });

      try {
        await installPackage(pkg, config);
        debugContext?.logger.emit({
          source: 'sandbox',
          level: 'info',
          event: 'sandbox.install.success',
          callId,
          payload: {
            packageName: pkg,
            attempt
          }
        });
        break;
      } catch (err) {
        if (attempt >= maxInstallAttempts) {
          throw err;
        }
      }
    }
  }
}

function buildSandboxRequire(
  policy: ImportPolicy,
  allowedImports: Set<string>
): (specifier: string) => unknown {
  return (specifier: string) => {
    if (isRelativeModule(specifier)) {
      throw new Error(`Relative imports are not supported in sandbox: ${specifier}`);
    }

    if (isNodeBuiltin(specifier)) {
      if (policy === 'deny') {
        throw new Error(`Import policy deny blocks builtin module: ${specifier}`);
      }
      return workspaceRequire(specifier);
    }

    const packageName = getPackageName(specifier);
    if (policy === 'deny') {
      throw new Error(`Import policy deny blocks package: ${packageName}`);
    }

    if (policy === 'allowlist' && !allowedImports.has(packageName)) {
      throw new Error(`Import policy allowlist blocks package: ${packageName}`);
    }

    return workspaceRequire(specifier);
  };
}

export class SandboxExecutionError extends Error {
  public readonly category: SandboxErrorCategory;
  public readonly sourceCode: string;
  public readonly runtimeCode?: string;
  public readonly aiCodeFrame: boolean;

  constructor(
    category: SandboxErrorCategory,
    message: string,
    options: {
      sourceCode: string;
      runtimeCode?: string;
      aiCodeFrame?: boolean;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'SandboxExecutionError';
    this.category = category;
    this.sourceCode = options.sourceCode;
    this.runtimeCode = options.runtimeCode;
    this.aiCodeFrame = options.aiCodeFrame ?? false;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class Sandbox {
  /**
   * Executes the given code in an isolated environment.
   */
  static async runCode(
    code: string,
    memory: Record<string, any>,
    skills: Map<string, AnySkill>,
    contextMethods: {
      clone: () => Promise<any>;
      create: (prompt: string) => Promise<any>;
      llmFunctions?: Record<string, (...args: any[]) => Promise<any>>;
      createLLMFunction?: (config: { name: string; description: string; parameters?: object }) => Promise<string> | string;
    },
    debugContext?: DebugRuntimeContext,
    sandboxConfig: LuminaSandboxConfig = {}
  ): Promise<any> {
    const callId = debugContext?.callId;
    const language = sandboxConfig.language ?? 'typescript';
    const timeoutMs = sandboxConfig.timeoutMs ?? 30000;
    const importPolicy = sandboxConfig.importPolicy ?? 'deny';
    const allowedImports = new Set(sandboxConfig.allowedImports ?? []);

    const executableSkillNames: string[] = [];
    const knowledgeSkillNames: string[] = [];
    for (const [name, skill] of skills.entries()) {
      if (isKnowledgeSkill(skill)) {
        knowledgeSkillNames.push(name);
      } else {
        executableSkillNames.push(name);
      }
    }

    debugContext?.logger.emit({
      source: 'sandbox',
      level: 'debug',
      event: 'sandbox.execute.start',
      callId,
      payload: {
        code,
        memoryKeys: Object.keys(memory),
        language,
        timeoutMs,
        importPolicy,
        allowedImports: Array.from(allowedImports),
        executableSkillNames,
        knowledgeSkillNames,
        llmFunctionCount: Object.keys(contextMethods.llmFunctions ?? {}).length
      }
    });

    // We deep copy the memory before passing to sandbox
    const sandboxMemory = structuredClone(memory);

    // Bind skills into an object with callable functions
    const sandboxSkills: Record<string, Function> = {};
    for (const [name, skill] of skills.entries()) {
      if (!isExecutableSkill(skill)) {
        continue;
      }
      sandboxSkills[name] = async (...args: any[]) => {
        const normalizedArgs = normalizeSkillArguments(skill, args);
        return await skill.execute(...normalizedArgs);
      };
    }

    let runtimeCode = code;
    let specifiers: string[] = [];

    debugContext?.logger.emit({
      source: 'sandbox',
      level: 'trace',
      event: 'sandbox.compile.start',
      callId,
      payload: {
        language,
        inputLength: code.length
      }
    });

    try {
      specifiers = extractModuleSpecifiers(runtimeCode);
      const policyResult = validateImportPolicy(specifiers, importPolicy, allowedImports);

      debugContext?.logger.emit({
        source: 'sandbox',
        level: 'debug',
        event: 'sandbox.policy.checked',
        callId,
        payload: {
          importPolicy,
          specifiers,
          externalPackages: policyResult.externalPackages
        }
      });

      if (language === 'typescript') {
        runtimeCode = compileTypeScript(runtimeCode);
      }

      specifiers = Array.from(new Set([...specifiers, ...extractModuleSpecifiers(runtimeCode)]));
      const postCompilePolicy = validateImportPolicy(specifiers, importPolicy, allowedImports);
      await ensurePackagesAvailable(postCompilePolicy.externalPackages, sandboxConfig, debugContext);

      debugContext?.logger.emit({
        source: 'sandbox',
        level: 'trace',
        event: 'sandbox.compile.success',
        callId,
        payload: {
          language,
          outputLength: runtimeCode.length
        }
      });
    } catch (e: any) {
      const error = e instanceof Error ? e : new Error(String(e));
      const category: SandboxErrorCategory = /allowlist|policy|import|Relative imports/.test(error.message)
        ? 'policy'
        : /Missing packages|install/i.test(error.message)
          ? 'install'
          : 'compile';

      debugContext?.logger.emit({
        source: 'sandbox',
        level: 'error',
        event: 'sandbox.compile.error',
        callId,
        payload: {
          language,
          importPolicy,
          error: error.message,
          code
        }
      });

      throw new SandboxExecutionError(category, error.message, {
        sourceCode: code,
        runtimeCode
      });
    }

    // Assemble the sandbox context
    const sandboxContext = {
      self: {
        memory: sandboxMemory,
        skills: sandboxSkills,
        llmFunctions: contextMethods.llmFunctions ?? {},
        createLLMFunction: contextMethods.createLLMFunction,
        clone: contextMethods.clone,
        create: contextMethods.create,
        sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
      },
      require: buildSandboxRequire(importPolicy, allowedImports),
      module: { exports: {} },
      exports: {},
      console: {
        log: (...args: any[]) => console.log('[Sandbox]', ...args),
        error: (...args: any[]) => console.error('[Sandbox Error]', ...args),
        warn: (...args: any[]) => console.warn('[Sandbox Warn]', ...args)
      }
    };

    // Create the Node VM context
    vm.createContext(sandboxContext);

    // We wrap the compiled code in an async function to allow await
    const wrappedCode = `(async () => {\n${runtimeCode}\n})()`;

    try {
      const script = new vm.Script(wrappedCode);
      const result = await script.runInContext(sandboxContext, {
        timeout: timeoutMs
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
      const error = e instanceof Error ? e : new Error(String(e));
      const aiCodeFrame = /evalmachine|anonymous/.test(error.stack ?? '');

      debugContext?.logger.emit({
        source: 'sandbox',
        level: 'error',
        event: 'sandbox.execute.error',
        callId,
        payload: {
          error: error.message,
          aiCodeFrame,
          code
        }
      });

      throw new SandboxExecutionError('runtime', error.message, {
        sourceCode: code,
        runtimeCode,
        aiCodeFrame,
        cause: error
      });
    }
  }
}
