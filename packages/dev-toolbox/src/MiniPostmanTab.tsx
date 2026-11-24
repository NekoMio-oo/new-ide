import React, { useState } from 'react';
import { Send, BookmarkPlus, Clock, X } from 'lucide-react';
import {
  Badge,
  Button,
  Chip,
  IconButton,
  Section,
  SelectInput,
  TextArea,
  TextInput,
} from '@pocketforge/ui-kit';

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
      const init: RequestInit = { method, headers: parsedHeaders };
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

  const ok = resp ? resp.status >= 200 && resp.status < 400 : false;

  return (
    <div className="space-y-3">
      {collection.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {collection.map((item) => (
            <Chip
              key={item.id}
              className="max-w-[220px]"
              onClick={() => {
                setMethod(item.method);
                setUrl(item.url);
                setHeadersJson(item.headersJson);
                setBody(item.body);
              }}
            >
              <span className="font-mono text-primary">{item.method}</span>
              <span className="truncate">{item.name}</span>
            </Chip>
          ))}
        </div>
      ) : null}

      <form onSubmit={handleSend} className="flex items-center gap-1.5">
        <SelectInput
          size="sm"
          aria-label="请求方法"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          containerClassName="w-[86px] shrink-0"
          className="font-semibold text-primary"
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </SelectInput>
        <TextInput
          size="sm"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://127.0.0.1:8080/api/users"
          aria-label="请求地址"
          containerClassName="min-w-0 flex-1"
        />
        <IconButton label="保存到离线集合" size="sm" onClick={handleSaveCurrent}>
          <BookmarkPlus size={14} />
        </IconButton>
        <Button
          type="submit"
          size="sm"
          variant="filled"
          icon={<Send size={13} />}
          disabled={sending}
        >
          发送
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <TextArea
          label="Headers (JSON)"
          rows={3}
          value={headersJson}
          onChange={(e) => setHeadersJson(e.target.value)}
        />
        {method !== 'GET' ? (
          <TextArea
            label="Request Body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        ) : null}
      </div>

      {resp ? (
        <Section
          title="响应"
          meta={
            <Badge tone={ok ? 'success' : 'error'}>
              {resp.status || 'ERR'}
            </Badge>
          }
          actions={
            <span className="flex items-center gap-1 font-mono text-2xs text-on-surface-variant">
              <Clock size={11} />
              {resp.durationMs} ms
            </span>
          }
          bodyClassName="py-0"
        >
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs text-on-surface selectable">
            {resp.bodyText}
          </pre>
        </Section>
      ) : (
        <div className="flex items-center gap-2 rounded-sm border border-dashed border-outline-variant px-3 py-4 text-xs text-on-surface-variant">
          <X size={13} />
          尚未发送请求
        </div>
      )}
    </div>
  );
};
