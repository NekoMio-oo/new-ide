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
} from 'lucide-react';
import type { FSProvider } from '@pocketforge/runtime-bridge';
import {
  buildOfflinePreviewHtml,
  type PreviewConsoleEntry,
  type PreviewDomSummaryNode,
  type PreviewNetworkEntry,
} from './previewBundler';

interface LivePreviewDevToolsProps {
  fs: FSProvider;
  entryHtmlPath: string;
}

type ViewportPreset = 'responsive' | 'mobile' | 'tablet';
type DevToolsTab = 'console' | 'elements' | 'network' | 'storage';

export const LivePreviewDevTools: React.FC<LivePreviewDevToolsProps> = ({
  fs,
  entryHtmlPath,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const seqRef = useRef(1);

  const [srcDoc, setSrcDoc] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportPreset>('responsive');
  const [devToolsOpen, setDevToolsOpen] = useState(true);
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
        setNetwork((prev) => [
          ...prev.slice(-99),
          {
            id: seqRef.current++,
            ...data.payload,
          },
        ]);
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
      { id: seqRef.current++, level: 'info', text: `> ${expr}`, timestamp: new Date().toLocaleTimeString() },
    ]);
    iframeRef.current?.contentWindow?.postMessage(
      { target: 'pocketforge-preview', cmd: 'eval', expr },
      '*'
    );
    setReplInput('');
  };

  const widthClass =
    viewport === 'mobile'
      ? 'max-w-[375px] mx-auto border-x border-slate-700'
      : viewport === 'tablet'
        ? 'max-w-[768px] mx-auto border-x border-slate-700'
        : 'w-full';

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200 overflow-hidden">
      {/* Preview Address & Viewport Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-xs text-slate-300 truncate flex-1">
          <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-mono truncate">local://{entryHtmlPath}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setViewport('responsive')}
            className={`p-1.5 rounded ${viewport === 'responsive' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            title="自适应全宽"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`p-1.5 rounded ${viewport === 'mobile' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            title="手机视口 (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewport('tablet')}
            className={`p-1.5 rounded ${viewport === 'tablet' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            title="平板视口 (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void reloadPreview()}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
            title="刷新预览"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDevToolsOpen((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
              devToolsOpen ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>DevTools ({logs.length})</span>
          </button>
        </div>
      </div>

      {/* Sandboxed Live Preview Area */}
      <div className="flex-1 min-h-0 bg-slate-900/50 overflow-auto">
        {errorMsg ? (
          <div className="p-4 text-xs text-rose-400 font-mono">{errorMsg}</div>
        ) : (
          <iframe
            ref={iframeRef}
            title="PocketForge Web Preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
            className={`h-full w-full bg-white ${widthClass}`}
            data-testid="live-preview-iframe"
          />
        )}
      </div>

      {/* Built-in Mobile DevTools Drawer */}
      {devToolsOpen && (
        <div className="h-48 flex flex-col bg-slate-950 border-t border-slate-800 shrink-0" data-testid="mobile-devtools">
          <div className="flex items-center justify-between px-2 py-1 bg-slate-900 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-1">
              {(['console', 'elements', 'network', 'storage'] as DevToolsTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-2 py-0.5 rounded capitalize ${
                    activeTab === tab ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab === 'console'
                    ? `Console (${logs.length})`
                    : tab === 'network'
                      ? `Network (${network.length})`
                      : tab === 'elements'
                        ? `Elements (${domNodes.length})`
                        : 'Storage'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setLogs([]);
                setNetwork([]);
              }}
              className="p-1 text-slate-400 hover:text-slate-200"
              title="清空面板记录"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 font-mono text-xs">
            {activeTab === 'console' && (
              <div className="space-y-1">
                {logs.length === 0 ? (
                  <div className="text-slate-500">暂无日志输出，可在页面交互或下方输入 JS 表达式求值</div>
                ) : (
                  logs.map((item) => (
                    <div
                      key={item.id}
                      className={`flex gap-2 border-b border-slate-900 pb-0.5 ${
                        item.level === 'error'
                          ? 'text-rose-400'
                          : item.level === 'warn'
                            ? 'text-amber-300'
                            : item.level === 'result'
                              ? 'text-emerald-400'
                              : 'text-slate-200'
                      }`}
                    >
                      <span className="text-slate-600 shrink-0">{item.timestamp}</span>
                      <span className="break-all">{item.text}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'elements' && (
              <div className="space-y-1">
                {domNodes.map((n, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-900">
                    <span className="text-sky-400">
                      &lt;{n.tag}
                      {n.id ? `#${n.id}` : ''}
                      {n.className ? `.${n.className.trim().replace(/\s+/g, '.')}` : ''}&gt;
                    </span>
                    <span className="text-slate-500">{n.rect}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'network' && (
              <div className="space-y-1">
                {network.length === 0 ? (
                  <div className="text-slate-500">暂无网络抓包记录</div>
                ) : (
                  network.map((req) => (
                    <div key={req.id} className="p-1.5 rounded bg-slate-900/80 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sky-400 font-semibold">
                          {req.method} {req.url}
                        </span>
                        <span className={req.status >= 200 && req.status < 400 ? 'text-emerald-400' : 'text-rose-400'}>
                          {req.status} ({req.durationMs}ms)
                        </span>
                      </div>
                      {req.responsePreview && (
                        <div className="text-[11px] text-slate-400 truncate">{req.responsePreview}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'storage' && (
              <div className="space-y-1">
                {Object.keys(storageMap).length === 0 ? (
                  <div className="text-slate-500">localStorage 为空</div>
                ) : (
                  Object.entries(storageMap).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 border-b border-slate-900 py-0.5">
                      <span className="text-amber-300">{k}</span>
                      <span className="text-slate-300 truncate">{v}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {activeTab === 'console' && (
            <form onSubmit={handleEvalRepl} className="flex items-center border-t border-slate-800 bg-slate-900 px-2 py-1 gap-1.5">
              <span className="text-sky-400 font-mono text-xs">&gt;</span>
              <input
                type="text"
                value={replInput}
                onChange={(e) => setReplInput(e.target.value)}
                placeholder="输入 JS 表达式在预览页实时求值..."
                className="flex-1 bg-transparent text-xs font-mono text-slate-100 outline-none"
              />
              <button type="submit" className="p-1 text-sky-400 hover:text-sky-300">
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
