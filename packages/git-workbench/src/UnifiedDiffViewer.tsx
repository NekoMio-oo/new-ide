import React, { useMemo } from 'react';
import { diffLines } from 'diff';

export interface DiffLineEntry {
  type: 'add' | 'remove' | 'context';
  oldLine: number | null;
  newLine: number | null;
  content: string;
}

export function computeUnifiedDiffLines(oldText: string, newText: string): DiffLineEntry[] {
  const changes = diffLines(oldText, newText);
  const rows: DiffLineEntry[] = [];
  let oldLn = 1;
  let newLn = 1;

  for (const part of changes) {
    if (part.value === '') continue;
    const rawLines = part.value.replace(/\n$/, '').split('\n');
    for (const line of rawLines) {
      if (part.added) {
        rows.push({ type: 'add', oldLine: null, newLine: newLn++, content: line });
      } else if (part.removed) {
        rows.push({ type: 'remove', oldLine: oldLn++, newLine: null, content: line });
      } else {
        rows.push({ type: 'context', oldLine: oldLn++, newLine: newLn++, content: line });
      }
    }
  }
  return rows;
}

export function hasMergeConflictMarkers(content: string): boolean {
  return content.includes('<<<<<<<') && content.includes('=======') && content.includes('>>>>>>>');
}

export function resolveMergeConflicts(
  content: string,
  strategy: 'ours' | 'theirs' | 'both'
): string {
  const conflictRegex = /<<<<<<<[^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>[^\n]*\n?/g;
  return content.replace(conflictRegex, (_match, ours: string, theirs: string) => {
    if (strategy === 'ours') return ours;
    if (strategy === 'theirs') return theirs;
    return `${ours}${theirs}`;
  });
}

interface UnifiedDiffViewerProps {
  oldText: string;
  newText: string;
  filepath?: string;
  maxHeightClass?: string;
}

export const UnifiedDiffViewer: React.FC<UnifiedDiffViewerProps> = ({
  oldText,
  newText,
  filepath,
  maxHeightClass = 'max-h-72',
}) => {
  const rows = useMemo(() => computeUnifiedDiffLines(oldText, newText), [oldText, newText]);
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const r of rows) {
      if (r.type === 'add') added++;
      if (r.type === 'remove') removed++;
    }
    return { added, removed };
  }, [rows]);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden text-xs font-mono">
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900 border-b border-slate-800">
        <span className="text-slate-300 truncate">{filepath || 'Unified Touch Diff'}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-emerald-400">+{stats.added}</span>
          <span className="text-rose-400">-{stats.removed}</span>
        </div>
      </div>

      <div className={`${maxHeightClass} overflow-auto divide-y divide-slate-900/60`}>
        {rows.length === 0 ? (
          <div className="p-3 text-slate-500 text-center">文件内容无差异</div>
        ) : (
          rows.map((row, idx) => {
            const bg =
              row.type === 'add'
                ? 'bg-emerald-950/45 text-emerald-200'
                : row.type === 'remove'
                  ? 'bg-rose-950/45 text-rose-200'
                  : 'text-slate-400';
            const prefix = row.type === 'add' ? '+' : row.type === 'remove' ? '-' : ' ';
            return (
              <div key={idx} className={`flex items-stretch px-2 py-0.5 ${bg}`}>
                <span className="w-7 text-right pr-1.5 text-[10px] text-slate-600 select-none shrink-0">
                  {row.oldLine ?? ''}
                </span>
                <span className="w-7 text-right pr-1.5 text-[10px] text-slate-600 select-none shrink-0">
                  {row.newLine ?? ''}
                </span>
                <span className="w-4 select-none font-bold shrink-0">{prefix}</span>
                <span className="whitespace-pre-wrap break-all flex-1">{row.content || ' '}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
