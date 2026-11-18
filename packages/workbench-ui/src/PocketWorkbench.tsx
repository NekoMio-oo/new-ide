import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu,
  Play,
  Code2,
  TerminalSquare,
  Eye,
  GitBranch,
  Wrench,
  Sparkles,
  Columns2,
  X,
  Plus,
  Minus,
} from 'lucide-react';
import type {
  DiagnosticLocation,
  FileNode,
  RunProfile,
  RunResult,
  RuntimeBridge,
} from '@pocketforge/runtime-bridge';
import {
  PocketCodeEditor,
  type PocketEditorHandle,
  type QuickAIActionType,
} from '@pocketforge/editor-engine';
import { TerminalWorkbench } from '@pocketforge/terminal-runner';
import { LivePreviewDevTools } from '@pocketforge/preview-devtools';
import { GitWorkbenchPanel } from '@pocketforge/git-workbench';
import { DevToolboxPanel } from '@pocketforge/dev-toolbox';
import { AICopilotPanel, type ExternalAIRequest } from '@pocketforge/ai-copilot';
import { FileExplorerDrawer } from './FileExplorerDrawer';

export type BottomNavKey = 'editor' | 'terminal' | 'preview' | 'git' | 'toolbox' | 'ai';

interface PocketWorkbenchProps {
  bridge: RuntimeBridge;
  sqlWasmUrl?: string;
}

export const PocketWorkbench: React.FC<PocketWorkbenchProps> = ({ bridge, sqlWasmUrl }) => {
  const editorRef = useRef<PocketEditorHandle | null>(null);
  const streamSeqRef = useRef(1);
  const aiSeqRef = useRef(1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navTab, setNavTab] = useState<BottomNavKey>('editor');
  const [splitPreview, setSplitPreview] = useState(false);
  const [fontSize, setFontSize] = useState(14);

  const [tree, setTree] = useState<FileNode[]>([]);
  const [openTabs, setOpenTabs] = useState<string[]>([
    'web-nebula-app/app.js',
    'web-nebula-app/index.html',
    'python-algo-kit/main.py',
    'systems-polyglot/src/main.rs',
  ]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>('web-nebula-app/app.js');
  const [fileContent, setFileContent] = useState<string>('');

  const [runProfiles, setRunProfiles] = useState<RunProfile[]>([]);
  const [latestRunResult, setLatestRunResult] = useState<RunResult | null>(null);
  const [streamChunk, setStreamChunk] = useState<{ seq: number; text: string } | null>(null);
  const [externalAIReq, setExternalAIReq] = useState<ExternalAIRequest | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const activeProjectRoot = useMemo(() => {
    if (!activeFilePath) return 'web-nebula-app';
    return activeFilePath.includes('/') ? activeFilePath.split('/')[0] : '';
  }, [activeFilePath]);

  const previewHtmlEntry = useMemo(() => {
    if (activeFilePath?.endsWith('.html')) return activeFilePath;
    if (activeProjectRoot) return `${activeProjectRoot}/index.html`;
    return 'web-nebula-app/index.html';
  }, [activeFilePath, activeProjectRoot]);

  const refreshWorkspaceTree = useCallback(async () => {
    const nodes = await bridge.fs.listTree();
    setTree(nodes);
  }, [bridge.fs]);

  const loadActiveFile = useCallback(
    async (targetPath: string | null) => {
      if (!targetPath) {
        setFileContent('');
        return;
      }
      if (await bridge.fs.exists(targetPath)) {
        const txt = await bridge.fs.readFile(targetPath);
        setFileContent(txt);
      }
      const profiles = await bridge.runner.detectRunProfiles(
        targetPath.includes('/') ? targetPath.split('/')[0] : '',
        targetPath
      );
      setRunProfiles(profiles);
    },
    [bridge.fs, bridge.runner]
  );

  useEffect(() => {
    void refreshWorkspaceTree();
  }, [refreshWorkspaceTree]);

  useEffect(() => {
    void loadActiveFile(activeFilePath);
  }, [activeFilePath, loadActiveFile]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 3200);
  };

  const handleOpenFile = (filepath: string) => {
    if (!openTabs.includes(filepath)) {
      setOpenTabs((prev) => [...prev, filepath]);
    }
    setActiveFilePath(filepath);
    setNavTab('editor');
  };

  const handleCloseTab = (filepath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = openTabs.filter((t) => t !== filepath);
    setOpenTabs(next);
    if (activeFilePath === filepath) {
      setActiveFilePath(next[next.length - 1] ?? null);
    }
  };

  const handleEditorChange = (nextContent: string) => {
    setFileContent(nextContent);
    if (activeFilePath) {
      void bridge.fs.writeFile(activeFilePath, nextContent);
    }
  };

  const handleRunActive = async () => {
    const profile = runProfiles[0];
    if (!profile) {
      showToast('当前文件暂无匹配的一键运行器');
      return;
    }
    if (profile.ecosystem === 'web') {
      setSplitPreview(true);
      setNavTab('editor');
      showToast(`已启动实时预览: ${profile.entryFile}`);
      return;
    }

    setNavTab('terminal');
    const result = await bridge.runner.execute(profile, (chunk) => {
      setStreamChunk({ seq: streamSeqRef.current++, text: chunk });
    });
    setLatestRunResult(result);
    await refreshWorkspaceTree();
  };

  const handleJumpToDiagnostic = async (diag: DiagnosticLocation) => {
    handleOpenFile(diag.file);
    setTimeout(() => {
      editorRef.current?.jumpToLocation(diag.line, diag.column);
    }, 80);
  };

  const handleQuickAIAction = (
    action: QuickAIActionType,
    selectedCode: string,
    filepath: string
  ) => {
    const actionMap: Record<QuickAIActionType, string> = {
      explain: `请详细解释以下选自 \`${filepath}\` 的代码片段逻辑：\n\`\`\`\n${selectedCode}\n\`\`\``,
      fix: `请检查以下选自 \`${filepath}\` 的代码片段是否存在 Bug 或隐患，并给出修复后的完整文件代码：\n\`\`\`\n${selectedCode}\n\`\`\``,
      optimize: `请优化以下代码片段的性能与可读性，并输出可直接替换的完整文件代码：\n\`\`\`\n${selectedCode}\n\`\`\``,
      test: `请针对以下代码片段设计关键边界测试用例：\n\`\`\`\n${selectedCode}\n\`\`\``,
    };
    setNavTab('ai');
    setExternalAIReq({ seq: aiSeqRef.current++, prompt: actionMap[action] });
  };

  const handleRequestAIFixError = (rawLogs: string, diagnostics: DiagnosticLocation[]) => {
    const summary = diagnostics.map((d) => `${d.file}:${d.line}:${d.column} ${d.message}`).join('\n');
    setNavTab('ai');
    setExternalAIReq({
      seq: aiSeqRef.current++,
      prompt: `终端编译/运行出现如下报错，请诊断根因并输出修复后的完整文件代码以便我一键采纳：\n\n${summary}\n\n原始日志：\n${rawLogs.slice(0, 1500)}`,
    });
  };

  const handleInstallApk = async (apkPath: string) => {
    const res = await bridge.requestInstallApk(apkPath);
    showToast(res.message);
  };

  const bottomItems: Array<{ key: BottomNavKey; label: string; icon: React.ReactNode }> = [
    { key: 'editor', label: '代码', icon: <Code2 className="w-4 h-4" /> },
    { key: 'terminal', label: '终端', icon: <TerminalSquare className="w-4 h-4" /> },
    { key: 'preview', label: '预览', icon: <Eye className="w-4 h-4" /> },
    { key: 'git', label: 'Git', icon: <GitBranch className="w-4 h-4" /> },
    { key: 'toolbox', label: '工具箱', icon: <Wrench className="w-4 h-4" /> },
    { key: 'ai', label: 'AI 助手', icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-dvh w-screen bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Top Mobile App Bar */}
      <header className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            aria-label="打开文件树"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="truncate">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-tight text-white">PocketForge</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  bridge.mode === 'android-native'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-sky-500/20 text-sky-300'
                }`}
              >
                {bridge.mode === 'android-native' ? 'Linux Container' : 'Offline Core'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden sm:flex items-center bg-slate-800 rounded-lg px-1">
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.max(11, s - 1))}
              className="p-1 text-slate-300 hover:text-white"
              title="缩小字号"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-mono px-1 text-slate-400">{fontSize}</span>
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.min(22, s + 1))}
              className="p-1 text-slate-300 hover:text-white"
              title="放大字号"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setSplitPreview((v) => !v);
              setNavTab('editor');
            }}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
              splitPreview
                ? 'bg-sky-600/30 text-sky-300 border border-sky-500/50'
                : 'bg-slate-800 text-slate-300'
            }`}
            title="上下分屏实时预览"
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">分屏</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRunActive()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
            data-testid="run-project-btn"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>运行</span>
          </button>
        </div>
      </header>

      {/* Open File Tabs Strip (shown in Editor mode) */}
      {navTab === 'editor' && openTabs.length > 0 && (
        <div className="flex items-center bg-slate-900/90 border-b border-slate-800 overflow-x-auto no-scrollbar shrink-0">
          {openTabs.map((tabPath) => {
            const name = tabPath.split('/').pop() || tabPath;
            const active = tabPath === activeFilePath;
            return (
              <div
                key={tabPath}
                onClick={() => setActiveFilePath(tabPath)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-slate-800/80 cursor-pointer shrink-0 ${
                  active
                    ? 'bg-[#0b1120] text-sky-300 border-b-2 border-b-sky-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="font-mono">{name}</span>
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(tabPath, e)}
                  className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast Banner */}
      {toastMsg && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full bg-slate-900/95 border border-sky-500/50 text-xs text-sky-200 shadow-xl">
          {toastMsg}
        </div>
      )}

      {/* Main Content Stage */}
      <main className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        {navTab === 'editor' && (
          <div className="flex flex-col h-full w-full overflow-hidden">
            {splitPreview && (
              <div className="h-[42%] border-b-2 border-sky-900/70 shrink-0 overflow-hidden">
                <LivePreviewDevTools fs={bridge.fs} entryHtmlPath={previewHtmlEntry} />
              </div>
            )}
            <div className="flex-1 min-h-0">
              {activeFilePath ? (
                <PocketCodeEditor
                  filepath={activeFilePath}
                  content={fileContent}
                  fontSize={fontSize}
                  onChange={handleEditorChange}
                  onQuickAIAction={handleQuickAIAction}
                  editorRef={editorRef}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-slate-500">
                  点击左上角菜单打开或新建文件
                </div>
              )}
            </div>
          </div>
        )}

        {/* Keep Terminal mounted so PTY state & scrollback persist across tabs */}
        <div className={navTab === 'terminal' ? 'flex-1 min-h-0 flex' : 'hidden'}>
          <TerminalWorkbench
            bridge={bridge}
            projectRoot={activeProjectRoot}
            latestRunResult={latestRunResult}
            externalStreamChunk={streamChunk}
            onJumpToDiagnostic={handleJumpToDiagnostic}
            onRequestAIFixError={handleRequestAIFixError}
            onInstallApk={handleInstallApk}
          />
        </div>

        {navTab === 'preview' && (
          <LivePreviewDevTools fs={bridge.fs} entryHtmlPath={previewHtmlEntry} />
        )}

        {navTab === 'git' && (
          <GitWorkbenchPanel
            bridge={bridge}
            repoDir={activeProjectRoot}
            onFileRestored={() => void loadActiveFile(activeFilePath)}
          />
        )}

        {navTab === 'toolbox' && <DevToolboxPanel bridge={bridge} sqlWasmUrl={sqlWasmUrl} />}

        {navTab === 'ai' && (
          <AICopilotPanel
            activeFile={activeFilePath ? { filepath: activeFilePath, content: fileContent } : null}
            externalRequest={externalAIReq}
            onApplyCodePatch={async (targetPath, nextCode) => {
              await bridge.fs.writeFile(targetPath, nextCode);
              if (targetPath === activeFilePath) {
                setFileContent(nextCode);
              }
              showToast(`已采纳 AI 内联补丁 -> ${targetPath}`);
            }}
          />
        )}
      </main>

      {/* Thumb-Friendly Mobile Bottom Navigation Bar */}
      <nav className="grid grid-cols-6 bg-slate-900 border-t border-slate-800 pb-safe shrink-0 z-20">
        {bottomItems.map((item) => {
          const active = navTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setNavTab(item.key)}
              className={`flex flex-col items-center justify-center py-1.5 gap-0.5 text-[10px] transition-colors ${
                active ? 'text-sky-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Slide-Over File Explorer Drawer */}
      <FileExplorerDrawer
        open={drawerOpen}
        tree={tree}
        activeFilePath={activeFilePath}
        bridge={bridge}
        onSelectFile={handleOpenFile}
        onClose={() => setDrawerOpen(false)}
        onRefresh={refreshWorkspaceTree}
      />
    </div>
  );
};
