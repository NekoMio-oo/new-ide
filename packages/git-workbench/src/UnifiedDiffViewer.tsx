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

/** Unified diff rendered as instrument output: gutter numbers, tinted rows. */
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
    <div className="overflow-hidden rounded-sm border border-outline-variant bg-editor">
      <div className="flex h-8 items-center justify-between gap-2 border-b border-outline-variant bg-surface-container px-2.5">
        <span className="truncate font-mono text-2xs text-on-surface">
          {filepath || 'Unified Diff'}
        </span>
        <div className="flex shrink-0 items-center gap-2 font-mono text-2xs">
          <span className="text-gitAdded">+{stats.added}</span>
          <span className="text-gitDeleted">-{stats.removed}</span>
        </div>
      </div>

      <div className={`${maxHeightClass} overflow-auto font-mono text-xs touch-scroll`}>
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-on-surface-variant">文件内容无差异</div>
        ) : (
          rows.map((row, idx) => {
            const tone =
              row.type === 'add'
                ? 'bg-gitAdded/10 text-gitAdded'
                : row.type === 'remove'
                  ? 'bg-gitDeleted/10 text-gitDeleted'
                  : 'text-on-surface-variant';
            const prefix = row.type === 'add' ? '+' : row.type === 'remove' ? '-' : ' ';
            return (
              <div key={idx} className={`flex items-stretch py-[1px] ${tone}`}>
                <span className="w-8 shrink-0 select-none pr-1.5 text-right text-2xs text-on-surface-variant/45">
                  {row.oldLine ?? ''}
                </span>
                <span className="w-8 shrink-0 select-none pr-1.5 text-right text-2xs text-on-surface-variant/45">
                  {row.newLine ?? ''}
                </span>
                <span className="w-3 shrink-0 select-none text-center opacity-80">{prefix}</span>
                <span className="flex-1 whitespace-pre-wrap break-all pr-2 selectable">
                  {row.content || ' '}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
