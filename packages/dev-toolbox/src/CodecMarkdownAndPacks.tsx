import React, { useMemo, useRef, useState } from 'react';
import YAML from 'yaml';
import { marked } from 'marked';
import katex from 'katex';
import { Upload, CheckCircle2, Trash2, Package } from 'lucide-react';
import type { ToolchainManager, ToolchainPackInfo } from '@pocketforge/runtime-bridge';

export const CodecRegexLabTab: React.FC = () => {
  const [dataInput, setDataInput] = useState(
    '{\n  "ide": "PocketForge",\n  "offline": true,\n  "languages": ["TypeScript", "Rust", "Kotlin"]\n}'
  );
  const [dataOutput, setDataOutput] = useState('');

  const [regexPattern, setRegexPattern] = useState('([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})');
  const [regexSample, setRegexSample] = useState('联系邮箱: dev@pocketforge.io 或 team@android.local');

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
      return [{ full: `正则语法错误: ${err instanceof Error ? err.message : String(err)}`, groups: [], index: -1 }];
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
    <div className="space-y-4 text-xs">
      {/* JSON <-> YAML & Base64 */}
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-slate-200">JSON / YAML / Base64 转换器</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                try {
                  setDataOutput(JSON.stringify(YAML.parse(dataInput), null, 2));
                } catch (e) {
                  setDataOutput(String(e));
                }
              }}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-sky-700 text-sky-300"
            >
              格式化 JSON
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  setDataOutput(YAML.stringify(YAML.parse(dataInput)));
                } catch (e) {
                  setDataOutput(String(e));
                }
              }}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-sky-700 text-amber-300"
            >
              转为 YAML
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  setDataOutput(btoa(unescape(encodeURIComponent(dataInput))));
                } catch (e) {
                  setDataOutput(String(e));
                }
              }}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-sky-700 text-emerald-300"
            >
              Base64 编码
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <textarea
            rows={4}
            value={dataInput}
            onChange={(e) => setDataInput(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-slate-200"
          />
          <textarea
            rows={4}
            readOnly
            value={dataOutput}
            placeholder="转换结果将显示在此处..."
            className="bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-emerald-300"
          />
        </div>
      </div>

      {/* Regex Tester */}
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <div className="font-semibold text-slate-200">正则表达式实时高亮匹配实验室</div>
        <input
          type="text"
          value={regexPattern}
          onChange={(e) => setRegexPattern(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-amber-300"
        />
        <input
          type="text"
          value={regexSample}
          onChange={(e) => setRegexSample(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-slate-200"
        />
        <div className="space-y-1">
          {regexMatches.map((m, idx) => (
            <div key={idx} className="px-2 py-1 rounded bg-slate-950 font-mono text-[11px] text-sky-300">
              匹配 #{idx + 1}: <span className="text-emerald-400">{m.full}</span>
              {m.groups.length > 0 && <span className="text-slate-400 ml-2">分组: [{m.groups.join(', ')}]</span>}
            </div>
          ))}
        </div>
      </div>

      {/* JWT Offline Decoder */}
      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        <div className="font-semibold text-slate-200">JWT 令牌离线解码器</div>
        <input
          type="text"
          value={jwtInput}
          onChange={(e) => setJwtInput(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-purple-300"
        />
        <pre className="p-2.5 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-200 overflow-x-auto">
          {decodedJwt}
        </pre>
      </div>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs h-full">
      <textarea
        rows={12}
        value={mdSource}
        onChange={(e) => setMdSource(e.target.value)}
        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 font-mono text-slate-100 outline-none"
      />
      <div
        className="p-4 rounded-xl bg-slate-900 border border-slate-800 prose prose-invert max-w-none overflow-auto space-y-2"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
};

export const ToolchainManagerTab: React.FC<{ toolchains: ToolchainManager }> = ({ toolchains }) => {
  const [packs, setPacks] = useState<ToolchainPackInfo[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
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
      setNotice(`已校验并导入离线工具链包: ${info.name} (SHA256 前缀 ${info.sha256?.slice(0, 10)})`);
      await reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <div className="font-semibold text-slate-100">模块化离线工具链包管理器 (.tar.zst / .tar.gz)</div>
          <div className="text-[11px] text-slate-400">
            按需挂载重型编译器以控制基础 APK 体积，断网环境支持直接从本地存储导入镜像包
          </div>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zst,.gz,.tar,.zip"
            onChange={handleFileImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>导入本地 .tar.zst 离线包</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-3 py-2 rounded-lg bg-emerald-950/60 border border-emerald-700/50 text-emerald-200">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-2"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-sky-400" />
                  {pack.name}
                </span>
                <span className="text-[11px] font-mono text-slate-400">{pack.sizeMB} MB</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{pack.description}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {pack.binaries.map((bin) => (
                  <span key={bin} className="px-1.5 py-0.5 rounded bg-slate-950 font-mono text-[10px] text-sky-300">
                    {bin}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              {pack.installed ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{pack.bundled ? '随底座内置' : '已离线挂载'}</span>
                </span>
              ) : (
                <span className="text-slate-500">未挂载</span>
              )}

              {!pack.bundled && (
                <div>
                  {pack.installed ? (
                    <button
                      type="button"
                      onClick={() => void toolchains.removePack(pack.id).then(reload)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-rose-900/50 text-rose-300"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>卸载释放空间</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await toolchains.markPackInstalled(pack.id);
                        setNotice(`已挂载工具链包 ${pack.name}`);
                        await reload();
                      }}
                      className="px-2.5 py-1 rounded bg-sky-600/25 border border-sky-500/40 hover:bg-sky-600/40 text-sky-300 font-medium"
                    >
                      一键激活挂载
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
