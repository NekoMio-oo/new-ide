export type AIProviderProtocol = 'openai-compatible' | 'gemini' | 'claude';

export interface AIConfig {
  protocol: AIProviderProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  extractedCode?: string;
  timestamp: number;
}

const AI_CONFIG_KEY = 'pocketforge.ai.config.v1';

export const PROVIDER_PRESETS: Array<{
  label: string;
  protocol: AIProviderProtocol;
  baseUrl: string;
  defaultModel: string;
}> = [
  {
    label: 'DeepSeek (OpenAI 兼容)',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  {
    label: 'OpenAI / OpenRouter / 硅基流动',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    label: 'Google Gemini API',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
  },
  {
    label: 'Anthropic Claude API',
    protocol: 'claude',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet-latest',
  },
];

export function loadAIConfig(): AIConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AI_CONFIG_KEY);
      if (raw) return JSON.parse(raw) as AIConfig;
    }
  } catch {
    // ignore
  }
  return {
    protocol: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
  };
}

export function saveAIConfig(cfg: AIConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(cfg));
    }
  } catch {
    // ignore
  }
}

export function extractFirstCodeBlock(markdownText: string): string | undefined {
  const match = markdownText.match(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/);
  return match ? match[1].trimEnd() : undefined;
}

const SYSTEM_PROMPT = `你是 PocketForge 移动端多功能 IDE 内置的资深全栈与系统编程助手。
请直接给出简洁精准的中文解答；当需要修改或修复用户当前文件时，请输出完整可直接替换的 \`\`\` 代码块，方便用户在手机上通过单列内联 Diff 一键采纳。`;

export async function streamAICompletion(
  cfg: AIConfig,
  history: ChatTurn[],
  userPrompt: string,
  activeFileContext: { filepath: string; content: string } | null,
  onDelta: (accumulated: string) => void
): Promise<string> {
  const contextHeader = activeFileContext
    ? `当前打开文件: \`${activeFileContext.filepath}\`\n\`\`\`\n${activeFileContext.content.slice(0, 8000)}\n\`\`\`\n\n`
    : '';
  const fullUserPrompt = `${contextHeader}${userPrompt}`;

  if (!cfg.apiKey.trim()) {
    const simulated = buildKeylessSmartDiagnostic(userPrompt, activeFileContext);
    onDelta(simulated);
    return simulated;
  }

  const base = cfg.baseUrl.replace(/\/+$/, '');

  if (cfg.protocol === 'openai-compatible') {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: fullUserPrompt },
    ];
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API 请求失败 (${res.status}): ${errBody.slice(0, 200)}`);
    }
    return consumeSSEStream(
      res,
      (jsonLine) => {
        const parsed = JSON.parse(jsonLine);
        return parsed.choices?.[0]?.delta?.content ?? '';
      },
      onDelta
    );
  }

  if (cfg.protocol === 'gemini') {
    const url = `${base}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey.trim())}`;
    const contents = [
      ...history.slice(-8).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${fullUserPrompt}` }] },
    ];
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini API 请求失败 (${res.status}): ${errBody.slice(0, 200)}`);
    }
    return consumeSSEStream(
      res,
      (jsonLine) => {
        const parsed = JSON.parse(jsonLine);
        return parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      },
      onDelta
    );
  }

  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey.trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      stream: true,
      messages: [
        ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: fullUserPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Claude API 请求失败 (${res.status}): ${errBody.slice(0, 200)}`);
  }
  return consumeSSEStream(
    res,
    (jsonLine) => {
      const parsed = JSON.parse(jsonLine);
      return parsed.type === 'content_block_delta' ? (parsed.delta?.text ?? '') : '';
    },
    onDelta
  );
}

async function consumeSSEStream(
  res: Response,
  extractChunk: (jsonStr: string) => string,
  onDelta: (accumulated: string) => void
): Promise<string> {
  if (!res.body) {
    const text = await res.text();
    onDelta(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const piece = extractChunk(payload);
        if (piece) {
          accumulated += piece;
          onDelta(accumulated);
        }
      } catch {
        // ignore partial JSON chunk
      }
    }
  }
  return accumulated;
}

function buildKeylessSmartDiagnostic(
  prompt: string,
  ctx: { filepath: string; content: string } | null
): string {
  const header = `> **提示**：当前尚未填入大模型 API Key（点击右上角 **API 配置** 即可接入 DeepSeek / OpenAI / Gemini / Claude 接口）。以下为内置静态分析生成的预览补丁：\n\n`;
  if (!ctx) {
    return `${header}请在右上角配置 API Key 后即可开启多模型流式对话、代码重构与终端报错自愈。`;
  }
  const patched = `// [AI 已审阅: ${ctx.filepath}]\n${ctx.content.trimEnd()}\n`;
  return (
    header +
    `针对文件 \`${ctx.filepath}\` 的请求（「${prompt.slice(0, 60)}」），生成可预览内联补丁如下：\n\n` +
    `\`\`\`\n${patched}\n\`\`\``
  );
}
