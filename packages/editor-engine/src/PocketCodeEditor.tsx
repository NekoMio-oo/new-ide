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
  highlightSpecialChars,
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
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { Sparkles, Bug, Zap, FlaskConical, ListTree, WrapText } from 'lucide-react';
import {
  Badge,
  Button,
  IconButton,
  ListRow,
  Sheet,
  StatusStrip,
  useResolvedScheme,
} from '@pocketforge/ui-kit';
import { AccessoryKeybar, type EditorCommandDelegate } from './AccessoryKeybar';
import { getM3EditorTheme, getM3SyntaxHighlighting } from './m3CodeTheme';
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
  fontSize = 13,
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
  const syntaxCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const scheme = useResolvedScheme();

  const [selectedSnippet, setSelectedSnippet] = useState('');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [showOutline, setShowOutline] = useState(false);

  const symbols = useMemo(() => extractDocumentSymbols(content, filepath), [content, filepath]);
  const langBadge = useMemo(() => detectLanguageBadge(filepath), [filepath]);

  // Mount CodeMirror 6 once and swap compartments dynamically.
  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        syntaxCompartment.current.of(getM3SyntaxHighlighting(scheme)),
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
        themeCompartment.current.of(getM3EditorTheme(scheme)),
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

  // Sync external content edits (AI patch applied, Git discard/checkout).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: content } });
    }
  }, [content]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        themeCompartment.current.reconfigure(getM3EditorTheme(scheme)),
        syntaxCompartment.current.reconfigure(getM3SyntaxHighlighting(scheme)),
      ],
    });
  }, [scheme]);

  // Font size is a CSS variable on the host, so a change only needs a re-measure.
  useEffect(() => {
    viewRef.current?.requestMeasure();
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
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: nextContent } });
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
        if (viewRef.current) openSearchPanel(viewRef.current);
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

  const quickActions: Array<{ key: QuickAIActionType; label: string; icon: React.ReactNode }> = [
    { key: 'explain', label: '解释', icon: <Sparkles size={13} /> },
    { key: 'fix', label: '查错', icon: <Bug size={13} /> },
    { key: 'optimize', label: '优化', icon: <Zap size={13} /> },
    { key: 'test', label: '单测', icon: <FlaskConical size={13} /> },
  ];

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-editor"
      style={{ '--editor-font-size': `${fontSize}px` } as React.CSSProperties}
    >
      {/* Code surface — the only thing that should compete for space. */}
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" data-testid="codemirror-host" />

      {/* Selection-aware AI actions live here, not floating over the code. */}
      {selectedSnippet && onQuickAIAction ? (
        <div className="flex h-9 shrink-0 animate-panel-in items-center gap-1 overflow-x-auto border-t border-outline-variant bg-surface-container-low px-2 no-scrollbar">
          <span className="hidden shrink-0 font-mono text-2xs text-on-surface-variant xs:inline">
            {selectedSnippet.length} 字符
          </span>
          <span className="flex-1" />
          {quickActions.map((action) => (
            <Button
              key={action.key}
              size="sm"
              variant="ghost"
              icon={action.icon}
              className="px-2 text-xs"
              onClick={() => onQuickAIAction(action.key, selectedSnippet, filepath)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}

      <StatusStrip
        data-testid="editor-status"
        items={[
          { key: 'cursor', label: `Ln ${cursorPos.line}, Col ${cursorPos.col}` },
          ...(selectedSnippet
            ? [{ key: 'sel', label: `${selectedSnippet.length} 已选`, tone: 'primary' as const }]
            : []),
        ]}
        trailing={
          <div className="flex items-center gap-1.5">
            {wordWrap ? (
              <span className="hidden items-center gap-1 text-on-surface-variant sm:flex">
                <WrapText size={11} />
                换行
              </span>
            ) : null}
            {symbols.length > 0 ? (
              <button
                type="button"
                aria-label={`文档大纲（${symbols.length} 个符号）`}
                onClick={() => setShowOutline(true)}
                className="press flex items-center gap-1 rounded-xs px-1 py-0.5 text-on-surface-variant hover:bg-on-surface/[0.06] hover:text-on-surface"
              >
                <ListTree size={11} />
                <span className="text-2xs">{symbols.length}</span>
              </button>
            ) : null}
            <Badge tone="info" className="bg-transparent px-0 text-primary">
              {langBadge}
            </Badge>
          </div>
        }
      />

      {showKeybar ? <AccessoryKeybar delegate={delegate} /> : null}

      <Sheet
        open={showOutline}
        onClose={() => setShowOutline(false)}
        title="文档大纲"
        description={`${filepath} · ${symbols.length} 个符号`}
        testId="outline-sheet"
      >
        <div className="px-1.5 pb-3">
          {symbols.map((sym, idx) => (
            <ListRow
              key={`${sym.name}-${sym.line}-${idx}`}
              title={sym.name}
              titleClassName="font-mono"
              meta={`:${sym.line}`}
              onClick={() => {
                jumpToLocation(sym.line, 1);
                setShowOutline(false);
              }}
            />
          ))}
        </div>
      </Sheet>
    </div>
  );
};
