import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  Smartphone,
  Tablet,
  Monitor,
  Bug,
  Trash2,
  Send,
  Globe,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import type { FSProvider } from '@pocketforge/runtime-bridge';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Panel,
  SegmentedTabs,
  Toolbar,
  haptic,
} from '@pocketforge/ui-kit';
import {
  buildOfflinePreviewHtml,
  type PreviewConsoleEntry,
  type PreviewDomSummaryNode,
  type PreviewNetworkEntry,
} from './previewBundler';

interface LivePreviewDevToolsProps {
  fs: FSProvider;
  entryHtmlPath: string;
  /** Split-pane mode: start with DevTools collapsed and drop viewport presets. */
  compact?: boolean;
}

type ViewportPreset = 'responsive' | 'mobile' | 'tablet';
type DevToolsTab = 'console' | 'elements' | 'network' | 'storage';

const VIEWPORTS: Array<{ id: ViewportPreset; label: string; icon: React.ReactNode }> = [
  { id: 'responsive', label: '自适应', icon: <Monitor size={14} /> },
  { id: 'mobile', label: '手机 375', icon: <Smartphone size={14} /> },
  { id: 'tablet', label: '平板 768', icon: <Tablet size={14} /> },
];

const LEVEL_TONE: Record<string, string> = {
  error: 'text-error',
  warn: 'text-warning',
  result: 'text-success',
  info: 'text-on-surface',
  log: 'text-on-surface',
};

export const LivePreviewDevTools: React.FC<LivePreviewDevToolsProps> = ({
  fs,
  entryHtmlPath,
  compact = false,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const seqRef = useRef(1);

  const [srcDoc, setSrcDoc] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportPreset>('responsive');
  const [devToolsOpen, setDevToolsOpen] = useState(!compact);
  const [activeTab, setActiveTab] = useState<DevToolsTab>('console');
  const [replInput, setReplInput] = useState('');

  const [logs, setLogs] = useState<PreviewConsoleEntry[]>([]);
  const [network, setNetwork] = useState<PreviewNetworkEntry[]>([]);
  const [domNodes, setDomNodes] = useState<PreviewDomSummaryNode[]>([]);
  const [storageMap, setStorageMap] = useState<Record<string, string>>({});

  const reloadPreview = useCallback(async () => {
    try {
      const bundled = await buildOfflinePreviewHtml(fs, entryHtmlPath);
      setSrcDoc(bundled);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [fs, entryHtmlPath]);

  useEffect(() => {
    void reloadPreview();
    const unsub = fs.onChange(() => {
      void reloadPreview();
    });
    return unsub;
  }, [fs, reloadPreview]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.source !== 'pocketforge-preview') return;
      if (data.kind === 'console') {
        setLogs((prev) => [
          ...prev.slice(-199),
          {
            id: seqRef.current++,
            level: data.payload.level,
            text: data.payload.text,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      } else if (data.kind === 'network') {
        setNetwork((prev) => [...prev.slice(-99), { id: seqRef.current++, ...data.payload }]);
      } else if (data.kind === 'snapshot') {
        setDomNodes(data.payload.dom || []);
        setStorageMap(data.payload.storage || {});
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const handleEvalRepl = (e: React.FormEvent) => {
    e.preventDefault();
    const expr = replInput.trim();
    if (!expr) return;
    setLogs((prev) => [
      ...prev,
      {
        id: seqRef.current++,
        level: 'info',
        text: `> ${expr}`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
    iframeRef.current?.contentWindow?.postMessage(
      { target: 'pocketforge-preview', cmd: 'eval', expr },
      '*'
    );
    setReplInput('');
  };

  const frameWidth =
    viewport === 'mobile' ? 'max-w-[375px]' : viewport === 'tablet' ? 'max-w-[768px]' : 'max-w-none';

  const errorCount = logs.filter((l) => l.level === 'error').length;

  return (
    <Panel>
      {/* Browser-style address + viewport controls */}
      <Toolbar className="justify-between gap-2">
        <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-outline-variant bg-surface-container-lowest px-2">
          <Globe size={12} className={errorMsg ? 'text-error' : 'text-success'} />
          <span className="truncate font-mono text-2xs text-on-surface-variant" title={entryHtmlPath}>
            local://{entryHtmlPath}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!compact ? (
            <>
              {VIEWPORTS.map((preset) => (
                <IconButton
                  key={preset.id}
                  label={preset.label}
                  size="sm"
                  active={viewport === preset.id}
                  onClick={() => setViewport(preset.id)}
                >
                  {preset.icon}
                </IconButton>
              ))}
              <span className="mx-0.5 h-4 w-px bg-outline-variant" />
            </>
          ) : null}
          <IconButton label="刷新预览" size="sm" onClick={() => void reloadPreview()}>
            <RefreshCw size={14} />
          </IconButton>
          <Button
            size="sm"
            variant={devToolsOpen ? 'tonal' : 'outlined'}
            icon={<Bug size={13} />}
            className="ml-0.5"
            onClick={() => {
              haptic('select');
              setDevToolsOpen((v) => !v);
            }}
          >
            <span className="font-mono">{logs.length}</span>
            {errorCount > 0 ? <span className="text-error">·{errorCount}</span> : null}
          </Button>
        </div>
      </Toolbar>

      {/* Sandboxed live page */}
      <div className="relative min-h-0 flex-1 overflow-auto bg-surface-container-low">
        {errorMsg ? (
          <EmptyState
            icon={<AlertTriangle size={20} />}
            title="无法加载预览"
            description={errorMsg}
            action={
              <Button variant="outlined" icon={<RefreshCw size={14} />} onClick={() => void reloadPreview()}>
                重新加载
              </Button>
            }
          />
        ) : (
          <iframe
            ref={iframeRef}
            title="PocketForge Web Preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
            className={`h-full w-full mx-auto bg-white ${frameWidth}`}
            data-testid="live-preview-iframe"
          />
        )}
      </div>

      {/* Built-in mobile DevTools */}
      {devToolsOpen ? (
        <div
          className={`flex shrink-0 flex-col border-t border-outline-variant bg-surface ${
            compact ? 'h-[52%] max-h-[220px] min-h-[120px]' : 'h-[44%] max-h-[300px] min-h-[150px]'
          }`}
          data-testid="mobile-devtools"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-outline-variant">
            <SegmentedTabs
              bordered={false}
              value={activeTab}
              onChange={setActiveTab}
              tabs={[
                { id: 'console', label: 'Console', count: logs.length },
                { id: 'elements', label: 'Elements', count: domNodes.length },
                { id: 'network', label: 'Network', count: network.length },
                { id: 'storage', label: 'Storage' },
              ]}
            />
            <IconButton
              label="清空面板记录"
              size="sm"
              className="mr-1"
              onClick={() => {
                setLogs([]);
                setNetwork([]);
              }}
            >
              <Trash2 size={13} />
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-xs touch-scroll">
            {activeTab === 'console' ? (
              logs.length === 0 ? (
                <div className="px-1 py-3 text-on-surface-variant/80">
                  暂无日志。可交互页面，或在下方输入 JS 表达式求值。
                </div>
              ) : (
                logs.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-2 border-b border-outline-variant/40 py-1 last:border-b-0"
                  >
                    <span className="shrink-0 text-2xs text-on-surface-variant/60">
                      {item.timestamp}
                    </span>
                    <span className={`break-all ${LEVEL_TONE[item.level] ?? 'text-on-surface'}`}>
                      {item.text}
                    </span>
                  </div>
                ))
              )
            ) : null}

            {activeTab === 'elements' ? (
              domNodes.length === 0 ? (
                <div className="px-1 py-3 text-on-surface-variant/80">未捕获到 DOM 快照</div>
              ) : (
                domNodes.map((n, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 border-b border-outline-variant/40 py-1 last:border-b-0"
                  >
                    <span className="truncate text-syntax-tag">
                      &lt;{n.tag}
                      {n.id ? `#${n.id}` : ''}
                      {n.className ? `.${n.className.trim().replace(/\s+/g, '.')}` : ''}&gt;
                    </span>
                    <span className="shrink-0 text-2xs text-on-surface-variant">{n.rect}</span>
                  </div>
                ))
              )
            ) : null}

            {activeTab === 'network' ? (
              network.length === 0 ? (
                <div className="px-1 py-3 text-on-surface-variant/80">暂无网络请求记录</div>
              ) : (
                network.map((req) => (
                  <div
                    key={req.id}
                    className="border-b border-outline-variant/40 py-1.5 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-syntax-function">
                        {req.method} {req.url}
                      </span>
                      <Badge tone={req.status >= 200 && req.status < 400 ? 'success' : 'error'}>
                        {req.status} · {req.durationMs}ms
                      </Badge>
                    </div>
                    {req.responsePreview ? (
                      <div className="mt-0.5 truncate text-2xs text-on-surface-variant">
                        {req.responsePreview}
                      </div>
                    ) : null}
                  </div>
                ))
              )
            ) : null}

            {activeTab === 'storage' ? (
              Object.keys(storageMap).length === 0 ? (
                <div className="px-1 py-3 text-on-surface-variant/80">localStorage 为空</div>
              ) : (
                Object.entries(storageMap).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between gap-2 border-b border-outline-variant/40 py-1 last:border-b-0"
                  >
                    <span className="shrink-0 text-syntax-attribute">{k}</span>
                    <span className="truncate text-on-surface">{v}</span>
                  </div>
                ))
              )
            ) : null}
          </div>

          {activeTab === 'console' ? (
            <form
              onSubmit={handleEvalRepl}
              className="flex shrink-0 items-center gap-1.5 border-t border-outline-variant bg-surface-container-low px-2 py-1"
            >
              <ChevronRight size={12} className="shrink-0 text-primary" />
              <input
                type="text"
                value={replInput}
                onChange={(e) => setReplInput(e.target.value)}
                placeholder="输入 JS 表达式，回车在预览页求值"
                className="min-w-0 flex-1 bg-transparent font-mono text-xs text-on-surface outline-none placeholder:text-on-surface-variant/55"
              />
              <IconButton label="执行表达式" size="sm" type="submit">
                <Send size={13} />
              </IconButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
};
