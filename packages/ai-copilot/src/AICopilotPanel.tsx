import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Settings,
  Send,
  Mic,
  Check,
  Eye,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { UnifiedDiffViewer } from '@pocketforge/git-workbench';
import {
  PROVIDER_PRESETS,
  extractFirstCodeBlock,
  loadAIConfig,
  saveAIConfig,
  streamAICompletion,
  type AIConfig,
  type ChatTurn,
} from './llmClient';

export interface ExternalAIRequest {
  seq: number;
  prompt: string;
}

interface AICopilotPanelProps {
  activeFile: { filepath: string; content: string } | null;
  externalRequest?: ExternalAIRequest | null;
  onApplyCodePatch: (filepath: string, newContent: string) => Promise<void>;
}

const QUICK_CHIPS = [
  { label: '解释当前文件逻辑', prompt: '请用简洁要点解释当前文件的核心逻辑与数据流。' },
  { label: '排查潜在 Bug', prompt: '请检查当前代码是否存在边界异常、内存或异步隐患，并给出修复后的完整代码。' },
  { label: '重构与性能优化', prompt: '请在不改变对外行为的前提下优化代码可读性与执行效率，输出完整代码。' },
  { label: '补充注释与类型', prompt: '请为关键函数和复杂逻辑补充清晰注释与类型定义，输出完整代码。' },
];

export const AICopilotPanel: React.FC<AICopilotPanelProps> = ({
  activeFile,
  externalRequest,
  onApplyCodePatch,
}) => {
  const [config, setConfig] = useState<AIConfig>(() => loadAIConfig());
  const [showSettings, setShowSettings] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [loading, setLoading] = useState(false);
  const [diffPreviewTurnId, setDiffPreviewTurnId] = useState<string | null>(null);
  const [appliedTurnIds, setAppliedTurnIds] = useState<Record<string, boolean>>({});
  const handledSeqRef = useRef<number>(0);

  const runPrompt = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean || loading) return;

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: clean,
      timestamp: Date.now(),
    };
    const nextHistory = [...turns, userTurn];
    setTurns(nextHistory);
    setInput('');
    setLoading(true);
    setStreamingText('');

    try {
      const fullReply = await streamAICompletion(
        config,
        turns,
        clean,
        activeFile,
        (partial) => setStreamingText(partial)
      );
      const codeBlock = extractFirstCodeBlock(fullReply);
      const assistantTurn: ChatTurn = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: fullReply,
        extractedCode: codeBlock,
        timestamp: Date.now(),
      };
      setTurns([...nextHistory, assistantTurn]);
      if (codeBlock) setDiffPreviewTurnId(assistantTurn.id);
    } catch (err) {
      setTurns([
        ...nextHistory,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `请求出错: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  useEffect(() => {
    if (externalRequest && externalRequest.seq !== handledSeqRef.current) {
      handledSeqRef.current = externalRequest.seq;
      void runPrompt(externalRequest.prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRequest]);

  const handleVoiceInput = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => { lang: string; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; start: () => void }; webkitSpeechRecognition?: new () => { lang: string; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; start: () => void } })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; start: () => void } })
        .webkitSpeechRecognition;
    if (!SpeechRec) {
      setInput((prev) => prev + ' 请帮我检查并优化当前文件的异常处理 ');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'zh-CN';
    rec.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript ?? '';
      if (transcript) setInput((prev) => `${prev} ${transcript}`.trim());
    };
    rec.start();
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold">AI 随身编程助手</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
            {config.model}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => setTurns([])}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"
              title="清空会话"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
              config.apiKey ? 'bg-slate-800 text-emerald-300' : 'bg-purple-600/25 text-purple-300 border border-purple-500/40'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>API 配置</span>
          </button>
        </div>
      </div>

      {/* Collapsible Multi-Provider API Settings */}
      {showSettings && (
        <div className="p-3 bg-slate-900/95 border-b border-slate-800 space-y-2.5 text-xs shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  const next: AIConfig = {
                    ...config,
                    protocol: preset.protocol,
                    baseUrl: preset.baseUrl,
                    model: preset.defaultModel,
                  };
                  setConfig(next);
                  saveAIConfig(next);
                }}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-sky-900/60 text-slate-200 text-[11px]"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5">接口协议</label>
              <select
                value={config.protocol}
                onChange={(e) => {
                  const next = { ...config, protocol: e.target.value as AIConfig['protocol'] };
                  setConfig(next);
                  saveAIConfig(next);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5"
              >
                <option value="openai-compatible">OpenAI 兼容 (/chat/completions)</option>
                <option value="gemini">Google Gemini API</option>
                <option value="claude">Anthropic Claude API</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-0.5">模型名称 (Model ID)</label>
              <input
                type="text"
                value={config.model}
                onChange={(e) => {
                  const next = { ...config, model: e.target.value };
                  setConfig(next);
                  saveAIConfig(next);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-0.5">API Base URL</label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => {
                const next = { ...config, baseUrl: e.target.value };
                setConfig(next);
                saveAIConfig(next);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 font-mono"
            />
          </div>

          <div>
            <label className="flex items-center gap-1 text-[11px] text-slate-400 mb-0.5">
              <KeyRound className="w-3 h-3 text-amber-400" />
              <span>API Key (仅保存在手机本地存储)</span>
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => {
                const next = { ...config, apiKey: e.target.value };
                setConfig(next);
                saveAIConfig(next);
              }}
              placeholder="sk-... / AIza..."
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 font-mono"
            />
          </div>
        </div>
      )}

      {/* One-Tap Quick Action Pills */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-900 overflow-x-auto no-scrollbar shrink-0">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => void runPrompt(chip.prompt)}
            className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 hover:border-purple-500/50 text-xs text-slate-300 shrink-0"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Conversation & Inline Diff Patch Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 text-xs">
        {turns.length === 0 && !loading && (
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-slate-400 space-y-1.5">
            <div className="text-slate-200 font-medium">移动端免打字 AI 编程工作流</div>
            <p>1. 在编辑器选中任意代码片段，可直接点击悬浮胶囊触发解释、查错、优化或单测生成。</p>
            <p>2. 编译或运行出错时，点击终端顶栏「AI 诊断修复」即可生成单列内联 Diff 补丁一键采纳。</p>
          </div>
        )}

        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`rounded-xl p-3 space-y-2 ${
              turn.role === 'user'
                ? 'bg-sky-950/50 border border-sky-800/50 ml-6'
                : 'bg-slate-900 border border-slate-800 mr-2'
            }`}
          >
            <div className="text-[11px] font-semibold text-slate-400">
              {turn.role === 'user' ? '你' : 'PocketForge AI'}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed text-slate-200 font-sans">
              {turn.content}
            </div>

            {turn.extractedCode && activeFile && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDiffPreviewTurnId((cur) => (cur === turn.id ? null : turn.id))
                    }
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{diffPreviewTurnId === turn.id ? '收起内联 Diff' : '预览内联 Diff'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onApplyCodePatch(activeFile.filepath, turn.extractedCode!);
                      setAppliedTurnIds((prev) => ({ ...prev, [turn.id]: true }));
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                    data-testid="apply-ai-patch-btn"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{appliedTurnIds[turn.id] ? '已写入编辑器' : `一键采纳到 ${activeFile.filepath.split('/').pop()}`}</span>
                  </button>
                </div>

                {diffPreviewTurnId === turn.id && (
                  <UnifiedDiffViewer
                    filepath={activeFile.filepath}
                    oldText={activeFile.content}
                    newText={turn.extractedCode}
                    maxHeightClass="max-h-60"
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="rounded-xl p-3 bg-slate-900 border border-purple-500/40 space-y-1">
            <div className="text-[11px] text-purple-300 animate-pulse">AI 正在流式生成响应...</div>
            <div className="whitespace-pre-wrap text-slate-200">{streamingText || '...'}</div>
          </div>
        )}
      </div>

      {/* Bottom Input + Voice Trigger */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runPrompt(input);
        }}
        className="flex items-center gap-1.5 p-2 bg-slate-900 border-t border-slate-800 shrink-0"
      >
        <button
          type="button"
          onClick={handleVoiceInput}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0"
          title="语音口述需求"
        >
          <Mic className="w-4 h-4" />
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            activeFile
              ? `针对 ${activeFile.filepath.split('/').pop()} 提问或描述修改指令...`
              : '输入编程问题或代码生成需求...'
          }
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-purple-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="p-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
