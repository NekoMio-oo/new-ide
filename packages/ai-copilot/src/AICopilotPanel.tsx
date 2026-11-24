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
  ShieldCheck,
} from 'lucide-react';
import { UnifiedDiffViewer } from '@pocketforge/git-workbench';
import {
  Badge,
  Button,
  Chip,
  IconButton,
  Notice,
  Panel,
  PanelHeader,
  SelectInput,
  TextInput,
} from '@pocketforge/ui-kit';
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
  { label: '解释当前文件', prompt: '请用简洁要点解释当前文件的核心逻辑与数据流。' },
  { label: '排查潜在 Bug', prompt: '请检查当前代码是否存在边界异常、内存或异步隐患，并给出修复后的完整代码。' },
  { label: '重构与优化', prompt: '请在不改变对外行为的前提下优化代码可读性与执行效率，输出完整代码。' },
  { label: '补充注释类型', prompt: '请为关键函数和复杂逻辑补充清晰注释与类型定义，输出完整代码。' },
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
      const fullReply = await streamAICompletion(config, turns, clean, activeFile, (partial) =>
        setStreamingText(partial)
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
      (
        window as unknown as {
          SpeechRecognition?: new () => {
            lang: string;
            onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
            start: () => void;
          };
          webkitSpeechRecognition?: new () => {
            lang: string;
            onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
            start: () => void;
          };
        }
      ).SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => {
            lang: string;
            onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
            start: () => void;
          };
        }
      ).webkitSpeechRecognition;
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
    <Panel>
      <PanelHeader
        title="AI 随身编程助手"
        subtitle={config.model}
        leading={<Sparkles size={15} className="shrink-0 text-tertiary" />}
        actions={
          <>
            {turns.length > 0 ? (
              <IconButton label="清空会话" size="sm" onClick={() => setTurns([])}>
                <Trash2 size={14} />
              </IconButton>
            ) : null}
            <Button
              size="sm"
              variant={config.apiKey ? 'ghost' : 'tonal'}
              icon={<Settings size={13} />}
              onClick={() => setShowSettings((v) => !v)}
              data-testid="ai-config-btn"
            >
              API 配置
            </Button>
          </>
        }
      />

      {showSettings ? (
        <div className="max-h-[46%] shrink-0 space-y-2 overflow-y-auto border-b border-outline-variant bg-surface-container-low p-3 touch-scroll">
          <div className="flex flex-wrap gap-1.5">
            {PROVIDER_PRESETS.map((preset) => {
              const active =
                config.protocol === preset.protocol && config.baseUrl === preset.baseUrl;
              return (
                <Chip
                  key={preset.label}
                  selected={active}
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
                >
                  {preset.label}
                </Chip>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SelectInput
              size="sm"
              label="接口协议"
              value={config.protocol}
              onChange={(e) => {
                const next = { ...config, protocol: e.target.value as AIConfig['protocol'] };
                setConfig(next);
                saveAIConfig(next);
              }}
            >
              <option value="openai-compatible">OpenAI 兼容</option>
              <option value="gemini">Google Gemini</option>
              <option value="claude">Anthropic Claude</option>
            </SelectInput>
            <TextInput
              size="sm"
              label="模型 ID"
              value={config.model}
              onChange={(e) => {
                const next = { ...config, model: e.target.value };
                setConfig(next);
                saveAIConfig(next);
              }}
            />
          </div>

          <TextInput
            size="sm"
            label="API Base URL"
            value={config.baseUrl}
            onChange={(e) => {
              const next = { ...config, baseUrl: e.target.value };
              setConfig(next);
              saveAIConfig(next);
            }}
          />

          <TextInput
            size="sm"
            type="password"
            label={
              <span className="flex items-center gap-1">
                <KeyRound size={11} className="text-warning" />
                API Key（仅保存在本机）
              </span>
            }
            value={config.apiKey}
            placeholder="sk-... / AIza..."
            onChange={(e) => {
              const next = { ...config, apiKey: e.target.value };
              setConfig(next);
              saveAIConfig(next);
            }}
          />

          <div className="flex items-center gap-1.5 pt-0.5 text-2xs text-on-surface-variant">
            <ShieldCheck size={12} className="text-success" />
            密钥仅写入本机存储，不会上传到任何第三方服务。
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-outline-variant px-3 py-2 no-scrollbar">
        {QUICK_CHIPS.map((chip) => (
          <Chip key={chip.label} onClick={() => void runPrompt(chip.prompt)}>
            {chip.label}
          </Chip>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 touch-scroll">
        {turns.length === 0 && !loading ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Badge tone="info">免打字</Badge>
              <span className="text-xs text-on-surface-variant">移动端 AI 编程工作流</span>
            </div>
            <ol className="space-y-2 border-l border-outline-variant pl-3 text-xs leading-relaxed text-on-surface-variant">
              <li>
                <span className="text-on-surface">1.</span> 在编辑器选中代码，下方工具条可直接触发解释、查错、优化或单测。
              </li>
              <li>
                <span className="text-on-surface">2.</span> 运行失败时，终端顶栏「AI 诊断修复」会带着日志与诊断位置发起会话。
              </li>
              <li>
                <span className="text-on-surface">3.</span> 回复中的完整代码可预览 Diff 后一键写入编辑器。
              </li>
            </ol>
          </div>
        ) : null}

        {turns.map((turn) => {
          const isUser = turn.role === 'user';
          return (
            <div key={turn.id} className={isUser ? 'ml-7' : 'mr-1'}>
              <div
                className={`mb-1 flex items-center gap-1.5 text-2xs uppercase tracking-wide ${
                  isUser ? 'justify-end text-on-surface-variant' : 'text-on-surface-variant'
                }`}
              >
                {isUser ? '你' : 'PocketForge AI'}
              </div>
              <div
                className={
                  isUser
                    ? 'rounded-md bg-secondary-container/60 px-3 py-2 text-sm leading-relaxed text-on-secondary-container'
                    : 'border-l-2 border-primary/40 pl-2.5 text-sm leading-relaxed text-on-surface'
                }
              >
                <div className="whitespace-pre-wrap break-words selectable">{turn.content}</div>

                {turn.extractedCode && activeFile ? (
                  <div className="mt-2.5 space-y-2 border-t border-outline-variant pt-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outlined"
                        icon={<Eye size={13} />}
                        onClick={() => setDiffPreviewTurnId((cur) => (cur === turn.id ? null : turn.id))}
                      >
                        {diffPreviewTurnId === turn.id ? '收起 Diff' : '预览 Diff'}
                      </Button>
                      <Button
                        size="sm"
                        variant="filled"
                        icon={<Check size={13} />}
                        data-testid="apply-ai-patch-btn"
                        onClick={async () => {
                          await onApplyCodePatch(activeFile.filepath, turn.extractedCode!);
                          setAppliedTurnIds((prev) => ({ ...prev, [turn.id]: true }));
                        }}
                      >
                        {appliedTurnIds[turn.id]
                          ? '已写入'
                          : `采纳到 ${activeFile.filepath.split('/').pop()}`}
                      </Button>
                    </div>

                    {diffPreviewTurnId === turn.id ? (
                      <UnifiedDiffViewer
                        filepath={activeFile.filepath}
                        oldText={activeFile.content}
                        newText={turn.extractedCode}
                        maxHeightClass="max-h-64"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {loading ? (
          <div className="mr-1 border-l-2 border-tertiary/50 pl-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-2xs uppercase tracking-wide text-tertiary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary" />
              正在生成
            </div>
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-on-surface">
              {streamingText || '…'}
            </div>
          </div>
        ) : null}
      </div>

      {!config.apiKey ? (
        <Notice
          tone="warning"
          icon={<KeyRound size={13} />}
          actions={
            <Button size="sm" variant="text" onClick={() => setShowSettings(true)}>
              填写
            </Button>
          }
        >
          尚未配置 API Key，AI 请求会失败。
        </Notice>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runPrompt(input);
        }}
        className="flex shrink-0 items-center gap-1.5 border-t border-outline-variant bg-surface px-2 py-2"
      >
        <IconButton label="语音输入" size="md" onClick={handleVoiceInput}>
          <Mic size={16} />
        </IconButton>
        <TextInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            activeFile
              ? `针对 ${activeFile.filepath.split('/').pop()} 提问…`
              : '描述需求或粘贴代码…'
          }
          aria-label="AI 提问输入框"
          containerClassName="min-w-0 flex-1"
        />
        <IconButton
          label="发送"
          size="md"
          variant="filled"
          type="submit"
          disabled={loading}
        >
          <Send size={15} />
        </IconButton>
      </form>
    </Panel>
  );
};
