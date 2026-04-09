import { LuminaContext } from './LuminaContext.js';
import { LLMFunctionConfig } from './types.js';

export type LLMFunctionCallable<TArgs extends any[] = any[], TResult = any> = (
  ...args: TArgs
) => Promise<TResult>;

export function defineLLMFunction<TArgs extends any[] = any[], TResult = any>(
  context: LuminaContext,
  config: LLMFunctionConfig
): LLMFunctionCallable<TArgs, TResult> {
  return context.registerLLMFunction(config) as LLMFunctionCallable<TArgs, TResult>;
}

export function registerLLMFunction<TArgs extends any[] = any[], TResult = any>(
  context: LuminaContext,
  config: LLMFunctionConfig
): LLMFunctionCallable<TArgs, TResult> {
  return defineLLMFunction<TArgs, TResult>(context, config);
}
