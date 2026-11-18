import React, { useEffect, useRef, useState } from 'react';
import initSqlJs, { type Database } from 'sql.js';
import { Play, Save, Database as DbIcon } from 'lucide-react';
import type { FSProvider } from '@pocketforge/runtime-bridge';

interface SqliteStudioTabProps {
  fs: FSProvider;
  wasmUrl?: string;
}

const SEED_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ecosystem TEXT NOT NULL,
  stars INTEGER DEFAULT 0
);
INSERT INTO projects (name, ecosystem, stars) VALUES
  ('PocketForge Workbench', 'TypeScript + React', 128),
  ('Native Linux Daemon', 'Go + ARM64 PTY', 96),
  ('FastAPK Builder', 'Kotlin + aapt2', 84);
SELECT * FROM projects ORDER BY stars DESC;
`.trim();

export const SqliteStudioTab: React.FC<SqliteStudioTabProps> = ({ fs, wasmUrl }) => {
  const dbRef = useRef<Database | null>(null);
  const [ready, setReady] = useState(false);
  const [sqlInput, setSqlInput] = useState('SELECT * FROM projects ORDER BY stars DESC;');
  const [tables, setTables] = useState<string[]>([]);
  const [queryResult, setQueryResult] = useState<{ columns: string[]; values: unknown[][] } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('正在初始化 SQLite Wasm 离线引擎...');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const SQL = await initSqlJs(
          wasmUrl ? { locateFile: () => wasmUrl } : undefined
        );
        if (cancelled) return;
        let db: Database;
        if (await fs.exists('data/pocketforge.sqlite')) {
          const bytes = await fs.readBinaryFile('data/pocketforge.sqlite');
          db = new SQL.Database(bytes);
        } else {
          db = new SQL.Database();
          db.run(SEED_SQL);
        }
        dbRef.current = db;
        setReady(true);
        refreshTablesAndRun(db, 'SELECT * FROM projects ORDER BY stars DESC;');
        setStatusMsg('SQLite 3 Wasm 离线引擎已就绪');
      } catch (err) {
        if (!cancelled) {
          setStatusMsg(`SQLite 初始化提示: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
      dbRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshTablesAndRun = (db: Database, query: string) => {
    try {
      const tblRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
      const names = (tblRes[0]?.values ?? []).map((r) => String(r[0]));
      setTables(names);

      const res = db.exec(query);
      if (res.length > 0) {
        setQueryResult({ columns: res[0].columns, values: res[0].values });
      } else {
        setQueryResult({ columns: ['执行结果'], values: [['SQL 语句已成功执行 (0 行返回)']] });
      }
      setStatusMsg(`查询完成，共检测到 ${names.length} 张数据表`);
    } catch (err) {
      setStatusMsg(`SQL 错误: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveDbToVfs = async () => {
    if (!dbRef.current) return;
    const binary = dbRef.current.export();
    await fs.writeBinaryFile('data/pocketforge.sqlite', binary);
    setStatusMsg(`已持久化保存到工作区 data/pocketforge.sqlite (${binary.byteLength} bytes)`);
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2">
          <DbIcon className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300">{statusMsg}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {tables.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                const q = `SELECT * FROM ${t} LIMIT 50;`;
                setSqlInput(q);
                if (dbRef.current) refreshTablesAndRun(dbRef.current, q);
              }}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 font-mono text-sky-300"
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            disabled={!ready}
            onClick={() => void handleSaveDbToVfs()}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300"
          >
            <Save className="w-3.5 h-3.5" />
            <span>导出到工作区</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <textarea
          rows={3}
          value={sqlInput}
          onChange={(e) => setSqlInput(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-2.5 font-mono text-slate-100 outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          disabled={!ready}
          onClick={() => dbRef.current && refreshTablesAndRun(dbRef.current, sqlInput)}
          className="px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold flex flex-col items-center justify-center gap-1 shrink-0"
        >
          <Play className="w-4 h-4" />
          <span>执行</span>
        </button>
      </div>

      {queryResult && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-sky-400">
                {queryResult.columns.map((col) => (
                  <th key={col} className="px-3 py-2 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {queryResult.values.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-800/50">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-1.5 text-slate-200 whitespace-nowrap">
                      {cell === null ? <span className="text-slate-500">NULL</span> : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
