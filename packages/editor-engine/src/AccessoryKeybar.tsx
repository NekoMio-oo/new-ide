import React, { useRef, useState } from 'react';
import {
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  Search,
  MoveHorizontal,
  CornerDownLeft,
  IndentIncrease,
  IndentDecrease,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { haptic, useOverflowFade } from '@pocketforge/ui-kit';

export interface EditorCommandDelegate {
  insertPair(open: string, close?: string): void;
  indent(direction: 'in' | 'out'): void;
  undo(): void;
  redo(): void;
  expandSelection(): void;
  shrinkSelection(): void;
  moveCursor(dx: number, dy: number): void;
  toggleComment(): void;
  openSearch(): void;
  insertNewline(): void;
}

interface AccessoryKeybarProps {
  delegate: EditorCommandDelegate | null;
}

const SYMBOLS: Array<{ label: string; open: string; close?: string }> = [
  { label: '{ }', open: '{', close: '}' },
  { label: '( )', open: '(', close: ')' },
  { label: '[ ]', open: '[', close: ']' },
  { label: '< >', open: '<', close: '>' },
  { label: '" "', open: '"', close: '"' },
  { label: "' '", open: "'", close: "'" },
  { label: '=>', open: ' => ' },
  { label: ';', open: ';' },
  { label: ':', open: ':' },
  { label: '=', open: ' = ' },
  { label: '.', open: '.' },
  { label: ',', open: ', ' },
  { label: '/', open: '/' },
  { label: '|', open: ' | ' },
  { label: '&', open: ' && ' },
  { label: '!', open: '!' },
  { label: '$', open: '$' },
  { label: '_', open: '_' },
];

const keyClass =
  'press flex h-7 shrink-0 items-center justify-center gap-1 rounded-xs border border-outline-variant bg-surface-container px-1.5 ' +
  'font-mono text-xs text-on-surface-variant active:border-primary/50 active:bg-primary/12 active:text-primary';

/**
 * Two-row touch accessory bar: a stable control row (thumb-reachable) plus a
 * scrollable symbol row. Flat surfaces and 1px borders — no pill farm.
 */
export const AccessoryKeybar: React.FC<AccessoryKeybarProps> = ({ delegate }) => {
  const trackState = useRef<{ startX: number; startY: number; accumX: number; accumY: number } | null>(
    null
  );
  const [trackpadActive, setTrackpadActive] = useState(false);
  const [symbolsOpen, setSymbolsOpen] = useState(true);

  const preventFocusLoss = (e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
  };

  const press = (run: () => void) => (e: React.PointerEvent) => {
    preventFocusLoss(e);
    haptic('tap');
    run();
  };

  const handleTrackStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setTrackpadActive(true);
    trackState.current = { startX: e.clientX, startY: e.clientY, accumX: 0, accumY: 0 };
  };

  const handleTrackMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackState.current || !delegate) return;
    const dxPx = e.clientX - trackState.current.startX;
    const dyPx = e.clientY - trackState.current.startY;
    const stepX = Math.trunc(dxPx / 12);
    const stepY = Math.trunc(dyPx / 18);

    const deltaCols = stepX - trackState.current.accumX;
    const deltaRows = stepY - trackState.current.accumY;

    if (deltaCols !== 0 || deltaRows !== 0) {
      delegate.moveCursor(deltaCols, deltaRows);
      trackState.current.accumX = stepX;
      trackState.current.accumY = stepY;
    }
  };

  const handleTrackEnd = () => {
    trackState.current = null;
    setTrackpadActive(false);
  };

  const controlRow = useOverflowFade<HTMLDivElement>();
  const symbolRow = useOverflowFade<HTMLDivElement>(symbolsOpen);

  return (
    <div
      className="no-select z-20 shrink-0 border-t border-outline-variant bg-surface-container-low"
      data-testid="accessory-keybar"
    >
      {/* Control row: everything scrolls except Enter, which must always be reachable. */}
      <div className="flex h-8 items-center gap-1 pl-1.5 pr-1">
        <div
          ref={controlRow.ref}
          className={`no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto ${
            controlRow.overflowing ? 'edge-fade' : ''
          }`}
        >
          <button type="button" className={keyClass} onPointerDown={press(() => delegate?.indent('in'))} title="缩进 (Tab)">
            <IndentIncrease size={13} />
            <span className="hidden xs:inline">Tab</span>
          </button>
          <button
            type="button"
            className={`${keyClass} px-1`}
            onPointerDown={press(() => delegate?.indent('out'))}
            title="反缩进 (Shift+Tab)"
          >
            <IndentDecrease size={13} />
          </button>
          <button
            type="button"
            className={`${keyClass} px-1`}
            onPointerDown={press(() => delegate?.undo())}
            title="撤销"
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            className={`${keyClass} px-1`}
            onPointerDown={press(() => delegate?.redo())}
            title="重做"
          >
            <Redo2 size={13} />
          </button>
          <button
            type="button"
            className={keyClass}
            onPointerDown={press(() => delegate?.toggleComment())}
            title="切换行注释"
          >
            //
          </button>

          {/* Spacebar-style trackpad: drag to move the caret. */}
          <div
            onPointerDown={handleTrackStart}
            onPointerMove={handleTrackMove}
            onPointerUp={handleTrackEnd}
            onPointerCancel={handleTrackEnd}
            data-testid="spacebar-trackpad"
            aria-label="滑动光标：拖动移动光标位置"
            className={`flex h-7 min-w-[72px] flex-1 touch-none items-center justify-center gap-1.5 rounded-xs border px-2 text-2xs transition-colors ${
              trackpadActive
                ? 'border-primary/60 bg-primary/12 text-primary'
                : 'border-outline-variant bg-surface-container text-on-surface-variant'
            }`}
          >
            <MoveHorizontal size={13} className="shrink-0" />
            {/* Icon-only on narrow phones; the label would truncate to "滑动…". */}
            <span className="hidden truncate sm:inline">滑动光标</span>
          </div>

          <button
            type="button"
            className={`${keyClass} px-1`}
            onPointerDown={press(() => delegate?.expandSelection())}
            title="扩大选区"
          >
            <Maximize2 size={12} />
          </button>
          <button
            type="button"
            className={`${keyClass} px-1`}
            onPointerDown={press(() => delegate?.shrinkSelection())}
            title="缩小选区"
          >
            <Minimize2 size={12} />
          </button>
          <button
            type="button"
            className={`${keyClass} px-1`}
            onPointerDown={press(() => delegate?.openSearch())}
            title="查找替换"
          >
            <Search size={13} />
          </button>
          <button
            type="button"
            className={`${keyClass} px-1 text-on-surface-variant`}
            onPointerDown={press(() => setSymbolsOpen((v) => !v))}
            title={symbolsOpen ? '收起符号行' : '展开符号行'}
            aria-expanded={symbolsOpen}
          >
            {symbolsOpen ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          </button>
        </div>

        <button
          type="button"
          className="press flex h-7 w-9 shrink-0 items-center justify-center rounded-xs bg-primary text-on-primary active:bg-primary/80"
          onPointerDown={press(() => delegate?.insertNewline())}
          title="智能换行"
        >
          <CornerDownLeft size={14} />
        </button>
      </div>

      {symbolsOpen ? (
        <div
          ref={symbolRow.ref}
          className={`keybar-symbols no-scrollbar flex h-8 items-center gap-1 overflow-x-auto border-t border-outline-variant/70 px-1.5 ${
            symbolRow.overflowing ? 'edge-fade' : ''
          }`}
        >
          {SYMBOLS.map((sym) => (
            <button
              key={sym.label}
              type="button"
              onPointerDown={press(() => delegate?.insertPair(sym.open, sym.close))}
              className="press h-7 min-w-[32px] shrink-0 rounded-xs px-1.5 font-mono text-xs text-on-surface-variant hover:bg-on-surface/[0.06] active:bg-primary/12 active:text-primary"
            >
              {sym.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
