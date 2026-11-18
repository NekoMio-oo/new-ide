import React, { useState } from 'react';
import { Send, BookmarkPlus, Clock } from 'lucide-react';

interface SavedRequestItem {
  id: string;
  name: string;
  method: string;
  url: string;
  headersJson: string;
  body: string;
}

const SAVED_REQ_KEY = 'pocketforge.postman.v1';

const DEFAULT_COLLECTION: SavedRequestItem[] = [
  {
    id: 'local-daemon-health',
    name: '本地 Linux 守护进程健康检查',
    method: 'GET',
    url: 'http://127.0.0.1:19527/api/health',
    headersJson: '{\n  "Accept": "application/json"\n}',
    body: '',
  },
  {
    id: 'mock-json-echo',
    name: '离线 Data URI JSON 回显测试',
    method: 'GET',
    url: 'data:application/json,%7B%22service%22%3A%22PocketForge%22%2C%22offline%22%3Atrue%2C%22items%22%3A%5B1%2C2%2C3%5D%7D',
    headersJson: '{}',
    body: '',
  },
];

export const MiniPostmanTab: React.FC = () => {
  const [collection, setCollection] = useState<SavedRequestItem[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_REQ_KEY);
      return raw ? (JSON.parse(raw) as SavedRequestItem[]) : DEFAULT_COLLECTION;
    } catch {
      return DEFAULT_COLLECTION;
    }
  });

  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState(DEFAULT_COLLECTION[1].url);
  const [headersJson, setHeadersJson] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState('{\n  "hello": "pocketforge"\n}');
  const [sending, setSending] = useState(false);
  const [resp, setResp] = useState<{
    status: number;
    durationMs: number;
    bodyText: string;
    headers: Record<string, string>;
  } | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const t0 = performance.now();
    try {
      const parsedHeaders = JSON.parse(headersJson || '{}') as Record<string, string>;
      const init: RequestInit = {
        method,
        headers: parsedHeaders,
      };
      if (method !== 'GET' && method !== 'HEAD' && body.trim()) {
        init.body = body;
      }
      const res = await fetch(url, init);
      const rawText = await res.text();
      let formatted = rawText;
      try {
        formatted = JSON.stringify(JSON.parse(rawText), null, 2);
      } catch {
        // keep plain text
      }
      const hdrs: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        hdrs[k] = v;
      });
      setResp({
        status: res.status,
        durationMs: Math.round(performance.now() - t0),
        bodyText: formatted,
        headers: hdrs,
      });
    } catch (err) {
      setResp({
        status: 0,
        durationMs: Math.round(performance.now() - t0),
        bodyText: `请求失败: ${err instanceof Error ? err.message : String(err)}`,
        headers: {},
      });
    } finally {
      setSending(false);
    }
  };

  const handleSaveCurrent = () => {
    const next: SavedRequestItem = {
      id: `req-${Date.now()}`,
      name: `${method} ${url.slice(0, 32)}`,
      method,
      url,
      headersJson,
      body,
    };
    const updated = [next, ...collection.slice(0, 19)];
    setCollection(updated);
    try {
      localStorage.setItem(SAVED_REQ_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Saved Collection Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {collection.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setMethod(item.method);
              setUrl(item.url);
              setHeadersJson(item.headersJson);
              setBody(item.body);
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-sky-500/50 text-slate-300 shrink-0"
          >
            <span className="font-mono text-sky-400 mr-1">{item.method}</span>
            <span>{item.name}</span>
          </button>
        ))}
      </div>

      {/* Request Builder */}
      <form onSubmit={handleSend} className="flex gap-1.5">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 font-mono text-sky-400 font-semibold"
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://127.0.0.1:8080/api/users"
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100 outline-none focus:border-sky-500"
        />
        <button
          type="button"
          onClick={handleSaveCurrent}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          title="保存到离线集合"
        >
          <BookmarkPlus className="w-4 h-4" />
        </button>
        <button
          type="submit"
          disabled={sending}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span>发送</span>
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">Headers (JSON)</label>
          <textarea
            rows={3}
            value={headersJson}
            onChange={(e) => setHeadersJson(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-slate-200"
          />
        </div>
        {method !== 'GET' && (
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Request Body</label>
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-slate-200"
            />
          </div>
        )}
      </div>

      {/* Response Viewer */}
      {resp && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
            <span
              className={`font-mono font-semibold ${
                resp.status >= 200 && resp.status < 400 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              Status: {resp.status || 'ERR'}
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <Clock className="w-3 h-3" />
              {resp.durationMs} ms
            </span>
          </div>
          <pre className="p-3 max-h-64 overflow-auto font-mono text-xs text-slate-200 whitespace-pre-wrap">
            {resp.bodyText}
          </pre>
        </div>
      )}
    </div>
  );
};
