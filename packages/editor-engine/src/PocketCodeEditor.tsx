import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  indentMore,
  indentLess,
  undo,
  redo,
  selectParentSyntax,
  simplifySelection,
  toggleComment,
  insertNewlineAndIndent,
} from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { Sparkles, Bug, Zap, FlaskConical, ListTree } from 'lucide-react';
import { AccessoryKeybar, type EditorCommandDelegate } from './AccessoryKeybar';
import {
  detectLanguageBadge,
  extractDocumentSymbols,
  resolveLanguageExtension,
} from './languageSupport';

export type QuickAIActionType = 'explain' | 'fix' | 'optimize' | 'test';

export interface PocketEditorHandle {
  jumpToLocation(line: number, column?: number): void;
  replaceRangeOrFull(newContent: string): void;
  getSelectedText(): string;
}

interface PocketCodeEditorProps {
  filepath: string;
  content: string;
  fontSize?: number;
  wordWrap?: boolean;
  showKeybar?: boolean;
  onChange: (nextContent: string) => void;
  onQuickAIAction?: (action: QuickAIActionType, selectedCode: string, filepath: string) => void;
  editorRef?: React.Ref<PocketEditorHandle>;
}

export const PocketCodeEditor: React.FC<PocketCodeEditorProps> = ({
  filepath,
  content,
  fontSize = 14,
  wordWrap = true,
  showKeybar = true,
  onChange,
  onQuickAIAction,
  editorRef,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [selectedSnippet, setSelectedSnippet] = useState('');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [showOutline, setShowOutline] = useState(false);

  const symbols = useMemo(() => extractDocumentSymbols(content, filepath), [content, filepath]);
  const langBadge = useMemo(() => detectLanguageBadge(filepath), [filepath]);

  const buildSizeTheme = (sizePx: number) =>
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: `${sizePx}px`,
        backgroundColor: '#0b1120',
      },
      '.cm-scroller': {
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
        lineHeight: '1.55',
        overflow: 'auto',
      },
      '.cm-gutters': {
        backgroundColor: '#0f172a',
        borderRight: '1px solid #1e293b',
        color: '#64748b',
      },
    });

  // Mount CodeMirror 6 instance once and swap compartments dynamically
  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        foldGutter(),
        drawSelection(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        langCompartment.current.of(resolveLanguageExtension(filepath)),
        wrapCompartment.current.of(wordWrap ? EditorView.lineWrapping : []),
        themeCompartment.current.of(buildSizeTheme(fontSize)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            const main = update.state.selection.main;
            const lineObj = update.state.doc.lineAt(main.head);
            setCursorPos({ line: lineObj.number, col: main.head - lineObj.from + 1 });
            if (!main.empty && main.to - main.from >= 3) {
              setSelectedSnippet(update.state.sliceDoc(main.from, main.to));
            } else {
              setSelectedSnippet('');
            }
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filepath]);

  // Sync external content edits (e.g. AI patch applied or Git discard/checkout)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  }, [content]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(buildSizeTheme(fontSize)),
    });
  }, [fontSize]);

  const jumpToLocation = (line: number, column = 1) => {
    const view = viewRef.current;
    if (!view) return;
    const clampedLine = Math.max(1, Math.min(line, view.state.doc.lines));
    const lineInfo = view.state.doc.line(clampedLine);
    const pos = Math.min(lineInfo.to, lineInfo.from + Math.max(0, column - 1));
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    view.focus();
  };

  useImperativeHandle(editorRef, () => ({
    jumpToLocation,
    replaceRangeOrFull: (nextContent: string) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: nextContent },
      });
    },
    getSelectedText: () => {
      const view = viewRef.current;
      if (!view) return '';
      const sel = view.state.selection.main;
      return view.state.sliceDoc(sel.from, sel.to);
    },
  }));

  const delegate = useMemo<EditorCommandDelegate>(
    () => ({
      insertPair: (open, close) => {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const wrapped = view.state.sliceDoc(from, to);
        const insert = close ? `${open}${wrapped}${close}` : open;
        const cursorAnchor = close ? from + open.length + wrapped.length : from + insert.length;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: wrapped && close ? from + open.length : cursorAnchor },
        });
        view.focus();
      },
      indent: (dir) => {
        const view = viewRef.current;
        if (!view) return;
        if (dir === 'in') indentMore(view);
        else indentLess(view);
        view.focus();
      },
      undo: () => {
        if (viewRef.current) {
          undo(viewRef.current);
          viewRef.current.focus();
        }
      },
      redo: () => {
        if (viewRef.current) {
          redo(viewRef.current);
          viewRef.current.focus();
        }
      },
      expandSelection: () => {
        if (viewRef.current) {
          selectParentSyntax(viewRef.current);
          viewRef.current.focus();
        }
      },
      shrinkSelection: () => {
        if (viewRef.current) {
          simplifySelection(viewRef.current);
          viewRef.current.focus();
        }
      },
      moveCursor: (dx, dy) => {
        const view = viewRef.current;
        if (!view) return;
        const head = view.state.selection.main.head;
        const curLine = view.state.doc.lineAt(head);
        const colOffset = head - curLine.from;
        const targetLineNum = Math.max(1, Math.min(view.state.doc.lines, curLine.number + dy));
        const nextLine = view.state.doc.line(targetLineNum);
        const rawPos = nextLine.from + Math.max(0, Math.min(nextLine.length, colOffset + dx));
        view.dispatch({
          selection: { anchor: rawPos },
          effects: EditorView.scrollIntoView(rawPos),
        });
      },
      toggleComment: () => {
        if (viewRef.current) {
          toggleComment(viewRef.current);
          viewRef.current.focus();
        }
      },
      openSearch: () => {
        if (viewRef.current) {
          openSearchPanel(viewRef.current);
        }
      },
      insertNewline: () => {
        if (viewRef.current) {
          insertNewlineAndIndent(viewRef.current);
          viewRef.current.focus();
        }
      },
    }),
    []
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#0b1120] relative overflow-hidden">
      {/* Compact Mobile Breadcrumb + Symbol Outline Bar */}
      <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900/90 border-b border-slate-800/80 text-[11px] text-slate-400 shrink-0">
        <div className="flex items-center gap-2 truncate">
          <span className="text-slate-300 font-mono truncate">{filepath}</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-400 font-medium shrink-0">
            {langBadge}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-slate-500">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          {symbols.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOutline((v) => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              <ListTree className="w-3 h-3 text-sky-400" />
              <span>大纲 ({symbols.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Collapsible AST Symbol Jump Drawer */}
      {showOutline && symbols.length > 0 && (
        <div className="max-h-40 overflow-y-auto bg-slate-900 border-b border-slate-800 px-2 py-1.5 grid grid-cols-2 sm:grid-cols-3 gap-1 z-20">
          {symbols.map((sym, idx) => (
            <button
              key={`${sym.name}-${sym.line}-${idx}`}
              type="button"
              onClick={() => {
                jumpToLocation(sym.line, 1);
                setShowOutline(false);
              }}
              className="flex items-center justify-between px-2 py-1 rounded bg-slate-800/80 hover:bg-sky-900/50 text-left text-xs"
            >
              <span className="truncate font-mono text-slate-200">{sym.name}</span>
              <span className="text-[10px] text-slate-500 ml-1 shrink-0">:{sym.line}</span>
            </button>
          ))}
        </div>
      )}

      {/* Selection Quick AI Action Floating Capsule (Mobile No-Typing UX) */}
      {selectedSnippet && onQuickAIAction && (
        <div className="absolute top-9 right-3 z-30 flex items-center gap-1 bg-slate-900/95 border border-sky-500/40 shadow-lg rounded-full px-2 py-1 backdrop-blur">
          <button
            type="button"
            onClick={() => onQuickAIAction('explain', selectedSnippet, filepath)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-sky-500/20 text-sky-300 hover:bg-sky-500/30"
          >
            <Sparkles className="w-3 h-3" />
            <span>解释</span>
          </button>
          <button
            type="button"
            onClick={() => onQuickAIAction('fix', selectedSnippet, filepath)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
          >
            <Bug className="w-3 h-3" />
            <span>查错</span>
          </button>
          <button
            type="button"
            onClick={() => onQuickAIAction('optimize', selectedSnippet, filepath)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
          >
            <Zap className="w-3 h-3" />
            <span>优化</span>
          </button>
          <button
            type="button"
            onClick={() => onQuickAIAction('test', selectedSnippet, filepath)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
          >
            <FlaskConical className="w-3 h-3" />
            <span>单测</span>
          </button>
        </div>
      )}

      {/* CodeMirror 6 Host Container */}
      <div ref={hostRef} className="flex-1 min-h-0 overflow-hidden" data-testid="codemirror-host" />

      {/* Dual-Row Mobile Touch Accessory Keybar */}
      {showKeybar && <AccessoryKeybar delegate={delegate} />}
    </div>
  );
};
