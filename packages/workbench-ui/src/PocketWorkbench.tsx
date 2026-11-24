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
  MoreVertical,
  FileCode2,
  FolderOpen,
  Keyboard,
  Sun,
  Moon,
  MonitorSmartphone,
  ChevronRight,
  Type,
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
import type { ThemeMode } from '@pocketforge/m3-theme';
import {
  Button,
  Chip,
  EmptyState,
  IconButton,
  ListRow,
  Section,
  Sheet,
  Snackbar,
  Switch,
  haptic,
  useLongPress,
  useOverflowFade,
  useSoftKeyboard,
  useTheme,
} from '@pocketforge/ui-kit';
import { FileExplorerDrawer } from './FileExplorerDrawer';

export type BottomNavKey = 'editor' | 'terminal' | 'preview' | 'git' | 'toolbox' | 'ai';

interface PocketWorkbenchProps {
  bridge: RuntimeBridge;
  sqlWasmUrl?: string;
}

const MIN_FONT = 11;
const MAX_FONT = 22;

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string; icon: React.ReactNode }> = [
  { mode: 'dark', label: '深色', icon: <Moon size={13} /> },
  { mode: 'light', label: '浅色', icon: <Sun size={13} /> },
  { mode: 'system', label: '跟随系统', icon: <MonitorSmartphone size={13} /> },
];

/** Document tab with long-press affordance for tab actions. */
const DocumentTab: React.FC<{
  path: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onLongPress: () => void;
}> = ({ path, active, onSelect, onClose, onLongPress }) => {
  const name = path.split('/').pop() || path;
  const { handlers, consumeSuppressedClick } = useLongPress(onLongPress);

  return (
    <div
      role="tab"
      aria-selected={active}
      title={path}
      {...handlers}
      onClick={() => {
        if (consumeSuppressedClick()) return;
        onSelect();
      }}
      className={`no-select relative flex h-tabbar shrink-0 cursor-pointer items-center gap-1.5 border-r border-outline-variant/60 pl-3 pr-1 font-mono text-xs transition-colors duration-fast ${
        active
          ? 'bg-editor font-medium text-on-surface'
          : 'text-on-surface-variant hover:bg-on-surface/[0.04] hover:text-on-surface'
      }`}
    >
      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-primary" aria-hidden="true" />
      ) : null}
      <span className="max-w-[148px] truncate">{name}</span>
      {active ? (
        <button
          type="button"
          aria-label={`关闭 ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            haptic('tap');
            onClose();
          }}
          className="press ml-0.5 flex h-6 w-6 items-center justify-center rounded-xs text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface"
        >
          <X size={12} />
        </button>
      ) : (
        <span className="w-1.5" aria-hidden="true" />
      )}
    </div>
  );
};

export const PocketWorkbench: React.FC<PocketWorkbenchProps> = ({ bridge, sqlWasmUrl }) => {
  const editorRef = useRef<PocketEditorHandle | null>(null);
  const streamSeqRef = useRef(1);
  const aiSeqRef = useRef(1);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ start: number; base: number; horizontal: boolean; extent: number } | null>(
    null
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navTab, setNavTab] = useState<BottomNavKey>('editor');
  const [splitPreview, setSplitPreview] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [showKeybar, setShowKeybar] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tabMenuPath, setTabMenuPath] = useState<string | null>(null);
  const [splitSize, setSplitSize] = useState(42);

  const tabStrip = useOverflowFade<HTMLDivElement>(`editor:${navTab}`);

  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  useSoftKeyboard();

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

  const breadcrumb = useMemo(() => {
    if (!activeFilePath) return { project: activeProjectRoot || '工作区', file: null as string | null };
    const parts = activeFilePath.split('/');
    return {
      project: parts.length > 1 ? parts[0] : activeProjectRoot || '工作区',
      file: parts[parts.length - 1],
    };
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

  const handleCloseTab = (filepath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = openTabs.filter((t) => t !== filepath);
    setOpenTabs(next);
    if (activeFilePath === filepath) {
      setActiveFilePath(next[next.length - 1] ?? null);
    }
  };

  const handleCloseOtherTabs = (keepPath: string) => {
    setOpenTabs([keepPath]);
    setActiveFilePath(keepPath);
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
      showToast(`已启动实时预览：${profile.entryFile}`);
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

  /** Drag the split divider — vertical in portrait, horizontal in landscape. */
  const handleSplitDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const horizontal = window.innerWidth > window.innerHeight && window.innerHeight <= 560;
    dragRef.current = {
      start: horizontal ? event.clientX : event.clientY,
      base: splitSize,
      horizontal,
      extent: horizontal
        ? splitRef.current?.clientWidth ?? window.innerWidth
        : splitRef.current?.clientHeight ?? window.innerHeight,
    };
  };

  const handleSplitMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const current = drag.horizontal ? event.clientX : event.clientY;
    const deltaPct = ((current - drag.start) / Math.max(1, drag.extent)) * 100;
    setSplitSize(Math.min(75, Math.max(20, Math.round(drag.base + deltaPct))));
  };

  const handleSplitUp = () => {
    dragRef.current = null;
  };

  const bottomItems: Array<{ key: BottomNavKey; label: string; icon: React.ReactNode }> = [
    { key: 'editor', label: '代码', icon: <Code2 size={19} /> },
    { key: 'terminal', label: '终端', icon: <TerminalSquare size={19} /> },
    { key: 'preview', label: '预览', icon: <Eye size={19} /> },
    { key: 'git', label: 'Git', icon: <GitBranch size={19} /> },
    { key: 'toolbox', label: '工具箱', icon: <Wrench size={19} /> },
    { key: 'ai', label: 'AI 助手', icon: <Sparkles size={19} /> },
  ];

  return (
    <div className="no-select relative flex h-dvh w-screen flex-col overflow-hidden bg-surface text-on-surface">
      <div className="app-stage flex min-h-0 flex-1 flex-col">
      {/* ── Top app bar: file context on the left, primary action on the right ── */}
      <header className="shrink-0 bg-surface pt-safe">
        <div className="flex h-appbar items-center gap-0.5 pl-1 pr-1.5">
          <IconButton label="资源管理器" size="lg" onClick={() => setDrawerOpen(true)}>
            <Menu size={19} />
          </IconButton>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="press flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 py-1 text-left"
            title={activeFilePath ?? '工作区'}
          >
            <FolderOpen size={13} className="shrink-0 text-on-surface-variant/80" />
            <span className="app-header-title truncate font-mono text-xs text-on-surface-variant">
              {breadcrumb.project}
            </span>
            {breadcrumb.file ? (
              <>
                <ChevronRight size={12} className="app-header-title shrink-0 text-on-surface-variant/50" />
                <span className="truncate font-mono text-sm text-on-surface">{breadcrumb.file}</span>
              </>
            ) : null}
          </button>

          {splitPreview ? (
            <button
              type="button"
              title="关闭分屏预览"
              onClick={() => {
                haptic('tap');
                setSplitPreview(false);
              }}
              className="press hidden shrink-0 items-center gap-1 rounded-xs bg-primary/12 px-1.5 py-0.5 font-mono text-2xs text-primary xs:flex"
            >
              分屏 ×
            </button>
          ) : null}

          <Button
            variant="filled"
            size="sm"
            icon={<Play size={14} className="fill-current" />}
            className="ml-0.5 px-2.5 font-semibold"
            onClick={() => void handleRunActive()}
            data-testid="run-project-btn"
            title={runProfiles[0] ? `运行 ${runProfiles[0].entryFile}` : '运行当前文件'}
          >
            <span className="hidden xs:inline">运行</span>
          </Button>

          <IconButton label="更多" size="lg" onClick={() => setMenuOpen(true)}>
            <MoreVertical size={18} />
          </IconButton>
        </div>
      </header>

      {/* ── Document tabs ── */}
      {navTab === 'editor' && openTabs.length > 0 ? (
        <div
          ref={tabStrip.ref}
          className={`no-scrollbar flex h-tabbar shrink-0 items-stretch overflow-x-auto border-b border-outline-variant bg-surface-container ${
            tabStrip.overflowing ? 'edge-fade' : ''
          }`}
          role="tablist"
        >
          {openTabs.map((tabPath) => (
            <DocumentTab
              key={tabPath}
              path={tabPath}
              active={tabPath === activeFilePath}
              onSelect={() => setActiveFilePath(tabPath)}
              onClose={() => handleCloseTab(tabPath)}
              onLongPress={() => setTabMenuPath(tabPath)}
            />
          ))}
        </div>
      ) : null}

      {/* ── Content stage ── */}
      <main className="app-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {navTab === 'editor' ? (
          <div
            ref={splitRef}
            className="split-pane flex h-full w-full flex-col overflow-hidden"
            style={{ '--split-size': `${splitSize}%` } as React.CSSProperties}
          >
            {splitPreview ? (
              <>
                <div
                  data-pane="preview"
                  className="shrink-0 overflow-hidden border-b border-outline-variant"
                  style={{ height: `${splitSize}%` }}
                >
                  <LivePreviewDevTools fs={bridge.fs} entryHtmlPath={previewHtmlEntry} compact />
                </div>
                <div
                  role="separator"
                  aria-label="调整预览与编辑器比例"
                  onPointerDown={handleSplitDown}
                  onPointerMove={handleSplitMove}
                  onPointerUp={handleSplitUp}
                  onPointerCancel={handleSplitUp}
                  className="split-handle group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center bg-surface-container-low hover:bg-surface-container active:bg-primary/10"
                >
                  <span className="h-[3px] w-10 rounded-full bg-outline transition-colors group-hover:bg-on-surface-variant group-active:bg-primary" />
                </div>
              </>
            ) : null}

            <div className="min-h-0 flex-1">
              {activeFilePath ? (
                <PocketCodeEditor
                  filepath={activeFilePath}
                  content={fileContent}
                  fontSize={fontSize}
                  showKeybar={showKeybar}
                  onChange={handleEditorChange}
                  onQuickAIAction={handleQuickAIAction}
                  editorRef={editorRef}
                />
              ) : (
                <EmptyState
                  icon={<FileCode2 size={20} />}
                  title="未打开文件"
                  description="从资源管理器选择一个文件开始编辑，或从模板新建工程。"
                  action={
                    <Button
                      variant="outlined"
                      icon={<FolderOpen size={14} />}
                      onClick={() => setDrawerOpen(true)}
                    >
                      打开资源管理器
                    </Button>
                  }
                />
              )}
            </div>
          </div>
        ) : null}

        {/* Keep Terminal mounted so PTY state & scrollback persist across tabs */}
        <div className={navTab === 'terminal' ? 'flex min-h-0 flex-1' : 'hidden'}>
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

        {navTab === 'preview' ? (
          <div className="h-full animate-panel-in">
            <LivePreviewDevTools fs={bridge.fs} entryHtmlPath={previewHtmlEntry} />
          </div>
        ) : null}

        {navTab === 'git' ? (
          <div className="h-full animate-panel-in">
            <GitWorkbenchPanel
              bridge={bridge}
              repoDir={activeProjectRoot}
              onFileRestored={() => void loadActiveFile(activeFilePath)}
            />
          </div>
        ) : null}

        {navTab === 'toolbox' ? (
          <div className="h-full animate-panel-in">
            <DevToolboxPanel bridge={bridge} sqlWasmUrl={sqlWasmUrl} />
          </div>
        ) : null}

        {navTab === 'ai' ? (
          <div className="h-full animate-panel-in">
            <AICopilotPanel
              activeFile={activeFilePath ? { filepath: activeFilePath, content: fileContent } : null}
              externalRequest={externalAIReq}
              onApplyCodePatch={async (targetPath, nextCode) => {
                await bridge.fs.writeFile(targetPath, nextCode);
                if (targetPath === activeFilePath) {
                  setFileContent(nextCode);
                }
                showToast(`已采纳 AI 补丁 → ${targetPath}`);
              }}
            />
          </div>
        ) : null}
      </main>
      </div>

      {/* ── Navigation bar (rail in landscape, see styles.css) ── */}
      <nav className="app-nav flex shrink-0 items-stretch border-t border-outline-variant bg-surface-container-low pb-safe">
        {bottomItems.map((item) => {
          const active = navTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? 'page' : undefined}
              title={item.label}
              onClick={() => {
                if (active) return;
                haptic('select');
                setNavTab(item.key);
              }}
              className="app-nav-item press flex flex-1 flex-col items-center justify-center gap-0.5 pb-1.5 pt-1"
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-fast ${
                  active
                    ? 'bg-primary/14 text-primary'
                    : 'text-on-surface-variant group-hover:text-on-surface'
                }`}
              >
                {item.icon}
              </span>
              <span
                data-label
                className={`text-2xs leading-none ${
                  active ? 'font-semibold text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <Snackbar message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <FileExplorerDrawer
        open={drawerOpen}
        tree={tree}
        activeFilePath={activeFilePath}
        bridge={bridge}
        onSelectFile={handleOpenFile}
        onClose={() => setDrawerOpen(false)}
        onRefresh={refreshWorkspaceTree}
      />

      {/* ── Tab action sheet (long-press) ── */}
      <Sheet
        open={Boolean(tabMenuPath)}
        onClose={() => setTabMenuPath(null)}
        title={tabMenuPath?.split('/').pop()}
        description={tabMenuPath ?? undefined}
        testId="tab-actions-sheet"
      >
        <div className="px-1.5 pb-3">
          <ListRow
            leading={<X size={15} />}
            title="关闭"
            onClick={() => {
              if (tabMenuPath) handleCloseTab(tabMenuPath);
              setTabMenuPath(null);
            }}
          />
          <ListRow
            leading={<X size={15} />}
            title="关闭其他标签"
            onClick={() => {
              if (tabMenuPath) handleCloseOtherTabs(tabMenuPath);
              setTabMenuPath(null);
            }}
          />
        </div>
      </Sheet>

      {/* ── Workspace / appearance sheet ── */}
      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="工作区"
        description={`${breadcrumb.project}${activeFilePath ? ` · ${openTabs.length} 个标签` : ''}`}
        testId="workspace-sheet"
      >
        <div className="pb-2">
          <Section
            bodyClassName="py-0"
            title="视图"
          >
            <ListRow
              leading={<FolderOpen size={15} />}
              title="资源管理器"
              subtitle="浏览、新建文件与工程模板"
              onClick={() => {
                setMenuOpen(false);
                setDrawerOpen(true);
              }}
            />
            <ListRow
              leading={<Columns2 size={15} />}
              title="分屏预览"
              subtitle="编辑器上方实时预览 Web 工程"
              onClick={() => {
                setSplitPreview((v) => {
                  if (!v) setNavTab('editor');
                  return !v;
                });
              }}
              trailing={
                <span onClick={(event) => event.stopPropagation()}>
                  <Switch
                    label="分屏预览"
                    checked={splitPreview}
                    onChange={(next) => {
                      setSplitPreview(next);
                      if (next) setNavTab('editor');
                    }}
                  />
                </span>
              }
            />
            <ListRow
              leading={<Keyboard size={15} />}
              title="辅助键盘"
              subtitle="符号行与光标滑动面板"
              onClick={() => setShowKeybar((v) => !v)}
              trailing={
                <span onClick={(event) => event.stopPropagation()}>
                  <Switch label="辅助键盘" checked={showKeybar} onChange={setShowKeybar} />
                </span>
              }
            />
          </Section>

          <Section title="编辑器">
            <ListRow
              leading={<Type size={15} />}
              title="字号"
              subtitle="仅影响代码编辑区"
              trailing={
                <div className="flex items-center gap-0.5">
                  <IconButton
                    label="缩小字号"
                    size="sm"
                    onClick={() => setFontSize((s) => Math.max(MIN_FONT, s - 1))}
                  >
                    <Minus size={13} />
                  </IconButton>
                  <span className="w-7 text-center font-mono text-sm text-on-surface">{fontSize}</span>
                  <IconButton
                    label="放大字号"
                    size="sm"
                    onClick={() => setFontSize((s) => Math.min(MAX_FONT, s + 1))}
                  >
                    <Plus size={13} />
                  </IconButton>
                </div>
              }
            />
          </Section>

          <Section title="外观">
            <div className="flex gap-1.5 px-3 py-2.5">
              {THEME_OPTIONS.map((option) => (
                <Chip
                  key={option.mode}
                  icon={option.icon}
                  selected={themeMode === option.mode}
                  onClick={() => setThemeMode(option.mode)}
                  size="lg"
                  className="flex-1 justify-center"
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="运行环境">
            <ListRow
              leading={<TerminalSquare size={15} />}
              title={bridge.mode === 'android-native' ? 'Linux 容器 (原生守护进程)' : '离线内核 (WASM)'}
              subtitle={
                bridge.mode === 'android-native'
                  ? 'PTY、工具链与文件系统运行在设备本地'
                  : '浏览器沙箱内核，无网络依赖'
              }
              trailing={
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    bridge.mode === 'android-native' ? 'bg-success' : 'bg-primary'
                  }`}
                />
              }
            />
          </Section>
        </div>
      </Sheet>
    </div>
  );
};
