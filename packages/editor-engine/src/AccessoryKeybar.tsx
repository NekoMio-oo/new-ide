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
} from 'lucide-react';

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

const ROW1_SYMBOLS: Array<{ label: string; open: string; close?: string }> = [
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

export const AccessoryKeybar: React.FC<AccessoryKeybarProps> = ({ delegate }) => {
  const trackState = useRef<{ startX: number; startY: number; accumX: number; accumY: number } | null>(null);
  const [trackpadActive, setTrackpadActive] = useState(false);

  const preventFocusLoss = (e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault();
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

  return (
    <div
      className="select-none bg-slate-900/95 border-t border-slate-800 backdrop-blur-md text-slate-200 z-20"
      data-testid="accessory-keybar"
    >
      {/* Row 1: Action Controls + Semantic Expand + Virtual Trackpad */}
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-slate-800/80 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onPointerDown={preventFocusLoss}
          onClick={() => delegate?.indent('in')}
          className="px-2 py-1 rounded bg-slate-800 active:bg-sky-600 text-xs font-mono flex items-center gap-1 shrink-0"
          title="缩进 (Tab)"
        >
          <IndentIncrease className="w-3.5 h-3.5" />
          <span>Tab</span>
        </button>
        <button
          type="button"
          onPointerDown={preventFocusLoss}
          onClick={() => delegate?.indent('out')}
          className="px-2 py-1 rounded bg-slate-800 active:bg-sky-600 text-xs font-mono shrink-0"
          title="反缩进 (Shift+Tab)"
        >
          <IndentDecrease className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onPointerDown={preventFocusLoss}
          onClick={() => delegate?.expandSelection()}
          className="px-2 py-1 rounded bg-sky-950/80 border border-sky-800/60 active:bg-sky-700 text-sky-300 text-xs flex items-center gap-1 shrink-0"
          title="按语法树扩大选区"
        >
          <Maximize2 className="w-3 h-3" />
          <span>扩选</span>
        </button>
        <button
          type="button"
          onPointerDown={preventFocusLoss}
          onClick={() => delegate?.shrinkSelection()}
          className="px-1.5 py-1 rounded bg-slate-800 active:bg-slate-700 text-xs shrink-0"
          title="缩小选区"
        >
          <Minimize2 className="w-3 h-3" />
        </button>

        {/* Spacebar Virtual Trackpad */}
        <div
          onPointerDown={handleTrackStart}
          onPointerMove={handleTrackMove}
          onPointerUp={handleTrackEnd}
          onPointerCancel={handleTrackEnd}
          data-testid="spacebar-trackpad"
          className={`flex-1 min-w-[96px] h-7 rounded px-2 flex items-center justify-center gap-1.5 text-[11px] touch-none transition-colors cursor-ew-resize ${
            trackpadActive
              ? 'bg-sky-600 text-white font-medium'
              : 'bg-slate-800/90 text-slate-400 border border-slate-700/70'
          }`}
        >
          <MoveHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">滑动控光标</span>
        </div>

        <button
          type="button"
          onPointerDown={preventFocusLoss}
          onClick={() => delegate?.toggleComment()}
          className="px-2 py-1 rounded bg-slate-800 active:bg-sky-600 text-xs font-mono shrink-0"
          title="切换行注释"
        >
          //
        </button>
        <button
          type="button"
          onPointerDown={preventFocusLoss}
          onClick={() => delegate?.undo()}
          className="p-1.5 rounded bg-slate-800 active:bg-sky-600 shrink-0"
          title="撤销"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onPointerDown={preventFocusLoss}
          onClick={() => delegate?.redo()}
          className="p-1.5 rounded bg-slate-800 active:bg-sky-600 shrink-0"
          title="重做"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onPointerDown={preventFocusLoss}
          onClick={() => delegate?.openSearch()}
          className="p-1.5 rounded bg-slate-800 active:bg-sky-600 shrink-0"
          title="查找替换"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onPointerDown={preventFocusLoss}
          onClick={() => delegate?.insertNewline()}
          className="p-1.5 rounded bg-sky-600/90 active:bg-sky-500 text-white shrink-0"
          title="智能换行"
        >
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Row 2: Horizontal Swipeable Paired Code Symbols */}
      <div className="flex items-center gap-1 px-1.5 py-1 overflow-x-auto no-scrollbar">
        {ROW1_SYMBOLS.map((sym) => (
          <button
            key={sym.label}
            type="button"
            onPointerDown={preventFocusLoss}
            onClick={() => delegate?.insertPair(sym.open, sym.close)}
            className="min-w-[34px] h-7 px-2 rounded bg-slate-800/95 hover:bg-slate-700 active:bg-sky-600 text-xs font-mono text-slate-100 shrink-0"
          >
            {sym.label}
          </button>
        ))}
      </div>
    </div>
  );
};
