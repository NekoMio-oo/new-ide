import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  Plus,
  Trash2,
  AlertTriangle,
  Sparkles,
  PackageCheck,
  TerminalSquare,
} from 'lucide-react';
import type {
  DiagnosticLocation,
  PTYSessionInfo,
  RunResult,
  RuntimeBridge,
} from '@pocketforge/runtime-bridge';
import {
  Button,
  IconButton,
  Panel,
  StatusStrip,
  haptic,
  useResolvedScheme,
} from '@pocketforge/ui-kit';
import { schemeFor, terminalAnsiFor, type ResolvedScheme } from '@pocketforge/m3-theme';

interface TerminalWorkbenchProps {
  bridge: RuntimeBridge;
  projectRoot: string;
  latestRunResult: RunResult | null;
  externalStreamChunk?: { seq: number; text: string } | null;
  onJumpToDiagnostic: (diag: DiagnosticLocation) => void;
  onRequestAIFixError?: (stderrAndStdout: string, diagnostics: DiagnosticLocation[]) => void;
  onInstallApk?: (apkPath: string) => void;
}

const TERM_SHORTCUTS: Array<{ label: string; seq: string; title: string }> = [
  { label: 'ESC', seq: '\x1b', title: 'Escape' },
  { label: 'TAB', seq: '\t', title: 'Tab 补全' },
  { label: '^C', seq: '\x03', title: '中断当前进程' },
  { label: '↑', seq: '\x1b[A', title: '上一条历史命令' },
  { label: '↓', seq: '\x1b[B', title: '下一条历史命令' },
  { label: 'ls', seq: 'ls\r', title: '列出文件' },
  { label: 'status', seq: 'git status\r', title: 'git status' },
  { label: 'packs', seq: 'packs\r', title: '查看工具链包' },
  { label: 'clear', seq: 'clear\r', title: '清屏' },
];

const buildTerminalTheme = (scheme: ResolvedScheme) => {
  const s = schemeFor(scheme);
  return {
    background: s.editor,
    foreground: s.onSurface,
    cursor: s.editorCursor,
    cursorAccent: s.editor,
    selectionBackground: s.editorSelection,
    ...terminalAnsiFor(scheme),
  };
};

export const TerminalWorkbench: React.FC<TerminalWorkbenchProps> = ({
  bridge,
  projectRoot,
  latestRunResult,
  externalStreamChunk,
  onJumpToDiagnostic,
  onRequestAIFixError,
  onInstallApk,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const scheme = useResolvedScheme();
  const [sessions, setSessions] = useState<PTYSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  activeSessionRef.current = activeSessionId;
  const unsubsRef = useRef<Map<string, () => void>>(new Map());

  const subscribeSession = (sessionId: string) => {
    const unsub = bridge.pty.onData(sessionId, (chunk) => {
      if (activeSessionRef.current === sessionId) {
        termRef.current?.write(chunk);
      }
    });
    unsubsRef.current.set(sessionId, unsub);
  };

  // Mount xterm.js terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12.5,
      lineHeight: 1.25,
      fontFamily: '"JetBrains Mono", "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: buildTerminalTheme('dark'),
      convertEol: true,
      scrollback: 2000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    try {
      term.open(containerRef.current);
      fitAddon.fit();
    } catch {
      // Ignore Canvas / matchMedia limitations in headless jsdom test environments
    }

    termRef.current = term;
    fitRef.current = fitAddon;

    const dataDispose = term.onData((data) => {
      if (activeSessionRef.current) {
        void bridge.pty.writeInput(activeSessionRef.current, data);
      }
    });

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            try {
              fitAddon.fit();
              if (activeSessionRef.current) {
                void bridge.pty.resize(activeSessionRef.current, term.cols, term.rows);
              }
            } catch {
              // ignore
            }
          })
        : null;
    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Spawn initial PTY session
    void bridge.pty.createSession(projectRoot, term.cols || 80, term.rows || 24).then((info) => {
      setSessions([info]);
      setActiveSessionId(info.id);
      subscribeSession(info.id);
    });

    return () => {
      for (const unsub of unsubsRef.current.values()) unsub();
      unsubsRef.current.clear();
      dataDispose.dispose();
      resizeObserver?.disconnect();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the terminal palette in sync with the active colour scheme.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = buildTerminalTheme(scheme);
  }, [scheme]);

  // Stream runner output into terminal view
  useEffect(() => {
    if (externalStreamChunk && termRef.current) {
      termRef.current.write(externalStreamChunk.text);
    }
  }, [externalStreamChunk]);

  const handleNewSession = async () => {
    const cols = termRef.current?.cols || 80;
    const rows = termRef.current?.rows || 24;
    const info = await bridge.pty.createSession(projectRoot, cols, rows);
    setSessions((prev) => [...prev, info]);
    setActiveSessionId(info.id);
    termRef.current?.clear();
    subscribeSession(info.id);
  };

  const handleKillActive = async () => {
    if (!activeSessionId || sessions.length <= 1) return;
    await bridge.pty.killSession(activeSessionId);
    unsubsRef.current.get(activeSessionId)?.();
    unsubsRef.current.delete(activeSessionId);
    const remaining = sessions.filter((s) => s.id !== activeSessionId);
    setSessions(remaining);
    setActiveSessionId(remaining[0]?.id ?? null);
  };

  const sendShortcut = (seq: string) => {
    haptic('tap');
    if (activeSessionId) {
      void bridge.pty.writeInput(activeSessionId, seq);
      termRef.current?.focus();
    }
  };

  const diagnostics = latestRunResult?.diagnostics ?? [];
  const hasBuildError = Boolean(latestRunResult && latestRunResult.exitCode !== 0);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.length - errorCount;

  return (
    <Panel>
      {/* Session strip */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-outline-variant bg-surface px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {sessions.map((s) => {
            const active = s.id === activeSessionId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  haptic('select');
                  setActiveSessionId(s.id);
                }}
                className={`press flex h-7 shrink-0 items-center gap-1.5 rounded-xs border px-2 font-mono text-xs ${
                  active
                    ? 'border-transparent bg-secondary-container text-on-secondary-container'
                    : 'border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface'
                }`}
              >
                <TerminalSquare size={12} />
                <span className="max-w-[120px] truncate">{s.title}</span>
              </button>
            );
          })}
          <IconButton label="新建终端会话" size="sm" onClick={() => void handleNewSession()}>
            <Plus size={14} />
          </IconButton>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {latestRunResult?.artifactApkPath && onInstallApk ? (
            <Button
              size="sm"
              variant="tonal"
              icon={<PackageCheck size={13} />}
              onClick={() => onInstallApk(latestRunResult.artifactApkPath!)}
            >
              安装 APK
            </Button>
          ) : null}
          {sessions.length > 1 ? (
            <IconButton label="关闭当前终端" size="sm" onClick={() => void handleKillActive()}>
              <Trash2 size={14} />
            </IconButton>
          ) : null}
        </div>
      </div>

      {/* Build failures surface as a single actionable strip, not a modal. */}
      {hasBuildError ? (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-outline-variant bg-error-container/30 pl-3 pr-1.5">
          <AlertTriangle size={14} className="shrink-0 text-error" />
          <span className="min-w-0 flex-1 truncate text-xs text-on-error-container">
            运行失败 · 退出码 {latestRunResult?.exitCode}
            {errorCount > 0 ? ` · ${errorCount} 个错误` : ''}
            {warningCount > 0 ? ` · ${warningCount} 个警告` : ''}
          </span>
          {onRequestAIFixError ? (
            <Button
              size="sm"
              variant="outlined"
              icon={<Sparkles size={13} />}
              className="border-error/40 text-on-error-container"
              data-testid="ai-self-heal-btn"
              onClick={() =>
                onRequestAIFixError(
                  `${latestRunResult?.stderr ?? ''}\n${latestRunResult?.stdout ?? ''}`,
                  diagnostics
                )
              }
            >
              AI 诊断修复
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Clickable diagnostics — tap a row to jump to the exact location. */}
      {diagnostics.length > 0 ? (
        <div className="max-h-[104px] shrink-0 overflow-y-auto border-b border-outline-variant bg-surface touch-scroll">
          {diagnostics.map((d, i) => (
            <button
              key={`${d.file}-${d.line}-${i}`}
              type="button"
              onClick={() => {
                haptic('select');
                onJumpToDiagnostic(d);
              }}
              className="press flex w-full items-start gap-2 border-b border-outline-variant/50 px-3 py-1.5 text-left last:border-b-0 hover:bg-on-surface/[0.05]"
            >
              <AlertTriangle
                size={12}
                className={`mt-[2px] shrink-0 ${d.severity === 'error' ? 'text-error' : 'text-warning'}`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-2xs text-on-surface-variant">
                  {d.file}:{d.line}:{d.column}
                </div>
                <div className="truncate text-xs text-on-surface">{d.message}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {/* xterm.js viewport */}
      <div
        ref={containerRef}
        className="term-host min-h-0 flex-1 overflow-hidden bg-editor"
        data-testid="xterm-container"
      />

      {/* Touch shell keybar */}
      <div className="no-select flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t border-outline-variant bg-surface-container-low px-1.5 no-scrollbar">
        {TERM_SHORTCUTS.map((item) => (
          <button
            key={item.label}
            type="button"
            title={item.title}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => sendShortcut(item.seq)}
            className="press h-7 shrink-0 rounded-xs border border-outline-variant bg-surface-container px-2 font-mono text-xs text-on-surface-variant active:border-primary/50 active:bg-primary/12 active:text-primary"
          >
            {item.label}
          </button>
        ))}
      </div>

      <StatusStrip
        className="hidden sm:flex"
        items={[
          { key: 'cwd', label: projectRoot || '/', title: '工作目录' },
          ...(activeSessionId
            ? [{ key: 'cols', label: `${termRef.current?.cols ?? 80}×${termRef.current?.rows ?? 24}` }]
            : []),
        ]}
      />
    </Panel>
  );
};
