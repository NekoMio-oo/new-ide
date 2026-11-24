import React, { useMemo, useRef, useState } from 'react';
import YAML from 'yaml';
import { marked } from 'marked';
import katex from 'katex';
import { Upload, CheckCircle2, Trash2, Package, X } from 'lucide-react';
import type { ToolchainManager, ToolchainPackInfo } from '@pocketforge/runtime-bridge';
import {
  Badge,
  Button,
  Chip,
  IconButton,
  ListRow,
  Notice,
  Section,
  TextArea,
  TextInput,
} from '@pocketforge/ui-kit';

export const CodecRegexLabTab: React.FC = () => {
  const [dataInput, setDataInput] = useState(
    '{\n  "ide": "PocketForge",\n  "offline": true,\n  "languages": ["TypeScript", "Rust", "Kotlin"]\n}'
  );
  const [dataOutput, setDataOutput] = useState('');

  const [regexPattern, setRegexPattern] = useState(
    '([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})'
  );
  const [regexSample, setRegexSample] = useState(
    '联系邮箱: dev@pocketforge.io 或 team@android.local'
  );

  const [jwtInput, setJwtInput] = useState(
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwb2NrZXRmb3JnZS11c2VyIiwicm9sZSI6ImRldiIsImlhdCI6MTczMDYwMDAwMH0.signature'
  );

  const regexMatches = useMemo(() => {
    try {
      const re = new RegExp(regexPattern, 'g');
      return Array.from(regexSample.matchAll(re)).map((m) => ({
        full: m[0],
        groups: m.slice(1),
        index: m.index ?? 0,
      }));
    } catch (err) {
      return [
        {
          full: `正则语法错误: ${err instanceof Error ? err.message : String(err)}`,
          groups: [],
          index: -1,
        },
      ];
    }
  }, [regexPattern, regexSample]);

  const decodedJwt = useMemo(() => {
    try {
      const parts = jwtInput.trim().split('.');
      if (parts.length < 2) return '请输入有效的三段式 JWT Token';
      const decodePart = (seg: string) =>
        JSON.stringify(JSON.parse(atob(seg.replace(/-/g, '+').replace(/_/g, '/'))), null, 2);
      return `// Header\n${decodePart(parts[0])}\n\n// Payload\n${decodePart(parts[1])}`;
    } catch {
      return '无法解析 JWT Base64URL 段';
    }
  }, [jwtInput]);

  return (
    <div className="space-y-4">
      <Section
        title="JSON / YAML / Base64"
        className="rounded-sm border border-outline-variant"
        bodyClassName="px-2.5 pb-2.5 pt-2 space-y-2"
        actions={
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                try {
                  setDataOutput(JSON.stringify(YAML.parse(dataInput), null, 2));
                } catch (e) {
                  setDataOutput(String(e));
                }
              }}
            >
              格式化
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                try {
                  setDataOutput(YAML.stringify(YAML.parse(dataInput)));
                } catch (e) {
                  setDataOutput(String(e));
                }
              }}
            >
              转 YAML
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                try {
                  setDataOutput(btoa(unescape(encodeURIComponent(dataInput))));
                } catch (e) {
                  setDataOutput(String(e));
                }
              }}
            >
              Base64
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <TextArea
            rows={5}
            value={dataInput}
            onChange={(e) => setDataInput(e.target.value)}
            aria-label="输入内容"
          />
          <TextArea
            rows={5}
            readOnly
            value={dataOutput}
            placeholder="转换结果…"
            aria-label="转换结果"
            className="text-success"
          />
        </div>
      </Section>

      <Section
        title="正则表达式"
        meta={<Badge tone={regexMatches[0]?.index === -1 ? 'error' : 'neutral'}>{regexMatches.length} 处</Badge>}
        className="rounded-sm border border-outline-variant"
        bodyClassName="px-2.5 pb-2.5 pt-2 space-y-2"
      >
        <TextInput
          value={regexPattern}
          onChange={(e) => setRegexPattern(e.target.value)}
          aria-label="正则表达式"
          className="text-syntax-attribute"
        />
        <TextInput
          value={regexSample}
          onChange={(e) => setRegexSample(e.target.value)}
          aria-label="测试文本"
        />
        <div className="space-y-1">
          {regexMatches.map((m, idx) => (
            <div
              key={idx}
              className="rounded-xs bg-surface-container-lowest px-2 py-1 font-mono text-2xs"
            >
              <span className="text-on-surface-variant">#{idx + 1} </span>
              <span className="text-success">{m.full}</span>
              {m.groups.length > 0 ? (
                <span className="ml-2 text-on-surface-variant">[{m.groups.join(', ')}]</span>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="JWT 解码"
        className="rounded-sm border border-outline-variant"
        bodyClassName="px-2.5 pb-2.5 pt-2 space-y-2"
      >
        <TextInput
          value={jwtInput}
          onChange={(e) => setJwtInput(e.target.value)}
          aria-label="JWT Token"
        />
        <pre className="max-h-52 overflow-auto rounded-xs bg-surface-container-lowest p-2.5 font-mono text-2xs text-on-surface selectable">
          {decodedJwt}
        </pre>
      </Section>
    </div>
  );
};

export const MarkdownNoteTab: React.FC = () => {
  const [mdSource, setMdSource] = useState(
    `# PocketForge 随身架构笔记\n\n支持离线 **GFM Markdown** 与 LaTeX 数学公式渲染：\n\n$$T(n) = O(n \\log n)$$\n\n- [x] 双层触控扩展符号栏\n- [x] SQLite Wasm 离线数据库\n- [x] Android 本地 Linux 守护进程\n`
  );

  const renderedHtml = useMemo(() => {
    const withMath = mdSource.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
      try {
        return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return tex;
      }
    });
    return marked.parse(withMath, { async: false }) as string;
  }, [mdSource]);

  return (
    <div className="grid h-full grid-cols-1 gap-2 md:grid-cols-2">
      <TextArea
        rows={14}
        value={mdSource}
        onChange={(e) => setMdSource(e.target.value)}
        aria-label="Markdown 源码"
        className="h-full resize-none"
      />
      <div className="overflow-auto rounded-sm border border-outline-variant bg-surface-container-low p-3.5 touch-scroll">
        <div className="md-body" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      </div>
    </div>
  );
};

export const ToolchainManagerTab: React.FC<{ toolchains: ToolchainManager }> = ({ toolchains }) => {
  const [packs, setPacks] = useState<ToolchainPackInfo[]>([]);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    setPacks(await toolchains.listPacks());
  };

  React.useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const info = await toolchains.importOfflinePack(file.name, buf);
      setNotice({
        text: `已校验并导入 ${info.name}（SHA256 前缀 ${info.sha256?.slice(0, 10)}）`,
        error: false,
      });
      await reload();
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : String(err), error: true });
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-outline-variant bg-surface-container-low p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-on-surface">离线工具链包</div>
            <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">
              按需挂载重型编译器以控制基础体积；断网环境可从本地存储导入 .tar.zst / .tar.gz 镜像。
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zst,.gz,.tar,.zip"
            onChange={handleFileImport}
            className="hidden"
          />
          <Button
            size="sm"
            variant="filled"
            icon={<Upload size={13} />}
            onClick={() => fileInputRef.current?.click()}
          >
            导入
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="relative">
          <Notice
            tone={notice.error ? 'error' : 'success'}
            actions={
              <IconButton label="关闭提示" size="sm" onClick={() => setNotice(null)}>
                <X size={13} />
              </IconButton>
            }
          >
            {notice.text}
          </Notice>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-sm border border-outline-variant">
        {packs.map((pack) => (
          <div key={pack.id} className="border-b border-outline-variant last:border-b-0">
            <ListRow
              leading={<Package size={15} className="text-primary" />}
              title={pack.name}
              subtitle={pack.description}
              meta={`${pack.sizeMB} MB`}
              trailing={
                pack.bundled ? (
                  <Badge tone="neutral">内置</Badge>
                ) : pack.installed ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={13} />}
                    onClick={() => void toolchains.removePack(pack.id).then(reload)}
                  >
                    卸载
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="tonal"
                    onClick={async () => {
                      await toolchains.markPackInstalled(pack.id);
                      setNotice({ text: `已挂载 ${pack.name}`, error: false });
                      await reload();
                    }}
                  >
                    挂载
                  </Button>
                )
              }
            />
            <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
              {pack.installed ? (
                <span className="flex items-center gap-1 text-2xs text-success">
                  <CheckCircle2 size={11} />
                  {pack.bundled ? '随底座内置' : '已挂载'}
                </span>
              ) : (
                <span className="text-2xs text-on-surface-variant">未挂载</span>
              )}
              {pack.binaries.map((bin) => (
                <Chip key={bin} size="sm">
                  <span className="font-mono">{bin}</span>
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
