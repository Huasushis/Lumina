import OpenAI from 'openai';
import {
  DebugRuntimeContext,
  ILLMProvider,
  Message,
  ProviderResponse,
  Skill
} from './types.js';

export interface AliYunProviderOptions {
  model?: string;
  enableThinking?: boolean;
}

export class AliYunBailianProvider implements ILLMProvider {
  private client: OpenAI;
  private model: string;
  private enableThinking: boolean;

  constructor(options: AliYunProviderOptions = {}) {
    this.model = options.model || 'qwen-plus';
    this.enableThinking = options.enableThinking ?? false;

    // Use DASHSCOPE_API_KEY from environment
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error('DASHSCOPE_API_KEY environment variable is missing.');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  }

  async generate(
    history: Message[],
    skills: Skill[],
    debugContext?: DebugRuntimeContext
  ): Promise<ProviderResponse> {
    const callId = debugContext?.callId;
    debugContext?.logger.emit({
      source: 'provider',
      level: 'debug',
      event: 'provider.generate.start',
      callId,
      payload: {
        model: this.model,
        historyCount: history.length,
        skillCount: skills.length,
        enableThinking: this.enableThinking
      }
    });

    const formattedSkills = skills.map(skill => `- ${skill.name}: ${skill.description}`);
    
    // We append a strict system prompt to enforce the JSON output format and behavioral constraints.
    const systemInstruction = `
你是一个运行在 Lumina 沙盒中的智能函数单元。你的记忆是不可变的（可以通过自决逻辑复制）。
当前环境中你有以下可用工具：
${formattedSkills.length > 0 ? formattedSkills.join('\n') : '无可用工具'}

你的目标是完成用户传入的任务。你有两种选择：
1. **直接求值 (Return):** 如果你可以直接得出结论，请输出 JSON 格式：
{
  "intent": "return",
  "value": <你的执行结果(可以是对象、字符串随意)>
}

2. **即时代码执行 (Eval):** 如果你需要调用工具函数、拆解任务或递归调用自身（通过 const child = await self.clone()），请写一段合法的异步 JavaScript 代码。你的代码最后必须能 return 一个结果，这个结果将作为此次调用的返回值。请输出 JSON 格式：
{
  "intent": "eval",
  "code": "<你的完整异步 JS 代码段>"
}

注意：
- 暴露的方法为 self.skills[工具名] 或 self.clone() / self.create(prompt)。
- 你必须严格输出上述两种且仅两种的 JSON 格式，不要包含其他解释性文本。如果不遵守规范，沙盒将无法解析你的意图。
`;

    // Ensure we have a system prompt
    const messagesToSend: any[] = [
      { role: 'system', content: systemInstruction },
      ...history
    ];

    const createParams: any = {
      model: this.model,
      messages: messagesToSend,
      response_format: { type: 'json_object' }
    };

    if (this.enableThinking) {
      // DashScope specific param
      createParams.enable_thinking = true;
    }

    const response = await this.client.chat.completions.create(createParams);
    
    const content = response.choices[0]?.message?.content || '{}';
    debugContext?.logger.emit({
      source: 'provider',
      level: 'trace',
      event: 'provider.response.raw',
      callId,
      payload: {
        content,
        finishReason: response.choices[0]?.finish_reason,
        usage: response.usage
      }
    });

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      debugContext?.logger.emit({
        source: 'provider',
        level: 'error',
        event: 'provider.response.parse_error',
        callId,
        payload: {
          error: err instanceof Error ? err.message : String(err),
          content
        }
      });
      throw new Error(`Failed to parse LLM response as JSON: ${content}`);
    }

    debugContext?.logger.emit({
      source: 'provider',
      level: 'debug',
      event: 'provider.response.parsed',
      callId,
      payload: parsed
    });

    return {
      message: parsed,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      } : undefined
    };
  }
}
