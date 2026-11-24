import React, { useEffect, useRef, useState } from 'react';
import initSqlJs, { type Database } from 'sql.js';
import { Play, Save, Database as DbIcon } from 'lucide-react';
import type { FSProvider } from '@pocketforge/runtime-bridge';
import { Badge, Button, Chip, Section, TextArea } from '@pocketforge/ui-kit';

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
  const [queryResult, setQueryResult] = useState<{ columns: string[]; values: unknown[][] } | null>(
    null
  );
  const [statusMsg, setStatusMsg] = useState<string>('正在初始化 SQLite Wasm 离线引擎…');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const SQL = await initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
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
        setStatusMsg('SQLite 3 Wasm 引擎已就绪');
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
      const tblRes = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
      );
      const names = (tblRes[0]?.values ?? []).map((r) => String(r[0]));
      setTables(names);

      const res = db.exec(query);
      if (res.length > 0) {
        setQueryResult({ columns: res[0].columns, values: res[0].values });
      } else {
        setQueryResult({ columns: ['执行结果'], values: [['SQL 语句已成功执行 (0 行返回)']] });
      }
      setStatusMsg(`查询完成，共 ${names.length} 张数据表`);
    } catch (err) {
      setStatusMsg(`SQL 错误: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveDbToVfs = async () => {
    if (!dbRef.current) return;
    const binary = dbRef.current.export();
    await fs.writeBinaryFile('data/pocketforge.sqlite', binary);
    setStatusMsg(`已保存到工作区 data/pocketforge.sqlite (${binary.byteLength} bytes)`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-outline-variant bg-surface-container-low px-2.5 py-2">
        <DbIcon size={14} className="shrink-0 text-success" />
        <span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">{statusMsg}</span>
        <Button
          size="sm"
          variant="outlined"
          icon={<Save size={13} />}
          disabled={!ready}
          onClick={() => void handleSaveDbToVfs()}
        >
          导出到工作区
        </Button>
      </div>

      {tables.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-2xs uppercase tracking-wide text-on-surface-variant">
            数据表
          </span>
          {tables.map((t) => (
            <Chip
              key={t}
              onClick={() => {
                const q = `SELECT * FROM ${t} LIMIT 50;`;
                setSqlInput(q);
                if (dbRef.current) refreshTablesAndRun(dbRef.current, q);
              }}
            >
              <span className="font-mono">{t}</span>
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <TextArea
          rows={3}
          value={sqlInput}
          onChange={(e) => setSqlInput(e.target.value)}
          aria-label="SQL 语句"
          containerClassName="min-w-0 flex-1"
        />
        <Button
          variant="filled"
          size="md"
          icon={<Play size={14} />}
          disabled={!ready}
          className="h-auto shrink-0 flex-col gap-1 px-3"
          onClick={() => dbRef.current && refreshTablesAndRun(dbRef.current, sqlInput)}
        >
          执行
        </Button>
      </div>

      {queryResult ? (
        <Section
          title="结果集"
          meta={<Badge>{queryResult.values.length} 行</Badge>}
          bodyClassName="py-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  {queryResult.columns.map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-3 py-1.5 font-medium text-primary"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryResult.values.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-outline-variant/50 last:border-b-0">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="whitespace-nowrap px-3 py-1.5 text-on-surface selectable">
                        {cell === null ? (
                          <span className="text-on-surface-variant/70">NULL</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </div>
  );
};
