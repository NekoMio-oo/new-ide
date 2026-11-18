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

interface TerminalWorkbenchProps {
  bridge: RuntimeBridge;
  projectRoot: string;
  latestRunResult: RunResult | null;
  externalStreamChunk?: { seq: number; text: string } | null;
  onJumpToDiagnostic: (diag: DiagnosticLocation) => void;
  onRequestAIFixError?: (stderrAndStdout: string, diagnostics: DiagnosticLocation[]) => void;
  onInstallApk?: (apkPath: string) => void;
}

const TERM_SHORTCUTS: Array<{ label: string; seq: string }> = [
  { label: 'ESC', seq: '\x1b' },
  { label: 'TAB', seq: '\t' },
  { label: 'CTRL+C', seq: '\x03' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: 'ls', seq: 'ls\r' },
  { label: 'git status', seq: 'git status\r' },
  { label: 'packs', seq: 'packs\r' },
  { label: 'clear', seq: 'clear\r' },
];

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

  const [sessions, setSessions] = useState<PTYSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  activeSessionRef.current = activeSessionId;

  // Mount xterm.js terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: {
        background: '#090d16',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: '#0284c766',
      },
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
    let unsubPty: (() => void) | null = null;
    void bridge.pty.createSession(projectRoot, term.cols || 80, term.rows || 24).then((info) => {
      setSessions([info]);
      setActiveSessionId(info.id);
      unsubPty = bridge.pty.onData(info.id, (chunk) => {
        term.write(chunk);
      });
    });

    return () => {
      unsubPty?.();
      dataDispose.dispose();
      resizeObserver?.disconnect();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    bridge.pty.onData(info.id, (chunk) => {
      if (activeSessionRef.current === info.id) {
        termRef.current?.write(chunk);
      }
    });
  };

  const handleKillActive = async () => {
    if (!activeSessionId || sessions.length <= 1) return;
    await bridge.pty.killSession(activeSessionId);
    const remaining = sessions.filter((s) => s.id !== activeSessionId);
    setSessions(remaining);
    setActiveSessionId(remaining[0]?.id ?? null);
  };

  const sendShortcut = (seq: string) => {
    if (activeSessionId) {
      void bridge.pty.writeInput(activeSessionId, seq);
      termRef.current?.focus();
    }
  };

  const diagnostics = latestRunResult?.diagnostics ?? [];
  const hasBuildError = Boolean(latestRunResult && latestRunResult.exitCode !== 0);

  return (
    <div className="flex flex-col h-full w-full bg-[#090d16] text-slate-200 overflow-hidden">
      {/* Session Header + Action Strip */}
      <div className="flex items-center justify-between px-2 py-1 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSessionId(s.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs shrink-0 ${
                s.id === activeSessionId
                  ? 'bg-sky-600/25 text-sky-300 border border-sky-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <TerminalSquare className="w-3 h-3" />
              <span>{s.title}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={handleNewSession}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="新建终端会话"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {latestRunResult?.artifactApkPath && onInstallApk && (
            <button
              type="button"
              onClick={() => onInstallApk(latestRunResult.artifactApkPath!)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>安装 APK</span>
            </button>
          )}
          {hasBuildError && onRequestAIFixError && (
            <button
              type="button"
              onClick={() =>
                onRequestAIFixError(
                  `${latestRunResult?.stderr ?? ''}\n${latestRunResult?.stdout ?? ''}`,
                  diagnostics
                )
              }
              className="flex items-center gap-1 px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium animate-pulse"
              data-testid="ai-self-heal-btn"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI 诊断修复</span>
            </button>
          )}
          {sessions.length > 1 && (
            <button
              type="button"
              onClick={handleKillActive}
              className="p-1 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300"
              title="关闭当前终端"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Clickable Compiler Error / Warning Diagnostics Strip */}
      {diagnostics.length > 0 && (
        <div className="max-h-24 overflow-y-auto bg-slate-950/90 border-b border-slate-800 px-2 py-1 space-y-1 shrink-0">
          {diagnostics.map((d, i) => (
            <button
              key={`${d.file}-${d.line}-${i}`}
              type="button"
              onClick={() => onJumpToDiagnostic(d)}
              className="w-full flex items-center gap-2 text-left px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-xs"
            >
              <AlertTriangle
                className={`w-3.5 h-3.5 shrink-0 ${
                  d.severity === 'error' ? 'text-rose-400' : 'text-amber-400'
                }`}
              />
              <span className="font-mono text-sky-400 shrink-0">
                {d.file}:{d.line}:{d.column}
              </span>
              <span className="truncate text-slate-300">{d.message}</span>
            </button>
          ))}
        </div>
      )}

      {/* xterm.js Viewport */}
      <div ref={containerRef} className="flex-1 min-h-0 p-1 overflow-hidden" data-testid="xterm-container" />

      {/* Mobile Touch Shell Keybar */}
      <div className="flex items-center gap-1 px-1.5 py-1 bg-slate-900 border-t border-slate-800 overflow-x-auto no-scrollbar shrink-0">
        {TERM_SHORTCUTS.map((item) => (
          <button
            key={item.label}
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => sendShortcut(item.seq)}
            className="px-2 py-1 rounded bg-slate-800 active:bg-sky-600 text-[11px] font-mono text-slate-200 shrink-0"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};
