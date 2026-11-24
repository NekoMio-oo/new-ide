import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { schemeFor, type ResolvedScheme } from '@pocketforge/m3-theme';

// CodeMirror 6 theme built entirely from design tokens, so the editor follows
// the app's dark/light scheme and stays in the same tonal language as the shell.

const MONO_STACK = '"JetBrains Mono", "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const makeEditorTheme = (scheme: ResolvedScheme): Extension => {
  const s = schemeFor(scheme);

  return EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: 'var(--editor-font-size, 13px)',
        backgroundColor: s.editor,
        color: s.syntaxVariable,
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily: MONO_STACK,
        lineHeight: '1.6',
        overflow: 'auto',
      },
      '.cm-content': {
        caretColor: s.editorCursor,
        paddingTop: '6px',
      },
      '.cm-line': { paddingRight: '12px' },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: s.editorCursor,
        borderLeftWidth: '2px',
      },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        {
          backgroundColor: s.editorSelection,
          color: s.onSurface,
        },
      '.cm-activeLine': { backgroundColor: s.editorLineHighlight },
      '.cm-gutters': {
        backgroundColor: s.editorGutter,
        borderRight: `1px solid ${s.outlineVariant}`,
        color: s.syntaxComment,
        userSelect: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: s.editorLineHighlight,
        color: s.onSurfaceVariant,
      },
      '.cm-foldGutter .cm-gutterElement': { color: s.syntaxPunctuation },
      '.cm-selectionMatch': { backgroundColor: `${s.primary}33` },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: `${s.primary}22`,
        outline: `1px solid ${s.outline}`,
        color: 'inherit',
      },
      '.cm-nonmatchingBracket': { color: s.error },
      '.cm-panels': {
        backgroundColor: s.surfaceContainer,
        color: s.onSurface,
        borderColor: s.outlineVariant,
      },
      '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${s.outlineVariant}` },
      '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${s.outlineVariant}` },
      '.cm-searchMatch': { backgroundColor: `${s.warning}3d`, outline: `1px solid ${s.warning}55` },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: `${s.warning}70` },
      '.cm-panel.cm-search input, .cm-panel.cm-search button': {
        backgroundColor: s.surfaceContainerHigh,
        color: s.onSurface,
        border: `1px solid ${s.outlineVariant}`,
      },
      '.cm-panel.cm-search label': { color: s.onSurfaceVariant },
      '.cm-textfield': {
        backgroundColor: s.surfaceContainerHigh,
        color: s.onSurface,
        border: `1px solid ${s.outline}`,
      },
      '.cm-tooltip': {
        backgroundColor: s.editorWidget,
        border: `1px solid ${s.editorWidgetBorder}`,
        borderRadius: '8px',
        color: s.onSurface,
        boxShadow: 'var(--elevation-2)',
        overflow: 'hidden',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: MONO_STACK,
        maxHeight: '220px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
        padding: '4px 10px',
        lineHeight: '1.5',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: s.secondaryContainer,
        color: s.onSecondaryContainer,
      },
      '.cm-completionDetail': { color: s.onSurfaceVariant, fontStyle: 'normal' },
      '.cm-foldPlaceholder': {
        backgroundColor: s.surfaceContainerHighest,
        border: 'none',
        color: s.onSurfaceVariant,
        borderRadius: '4px',
        padding: '0 4px',
      },
      '.cm-placeholder': { color: s.onSurfaceVariant },
    },
    { dark: scheme === 'dark' }
  );
};

const makeSyntaxHighlighting = (scheme: ResolvedScheme): Extension => {
  const s = schemeFor(scheme);

  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: [t.keyword, t.modifier, t.controlKeyword, t.moduleKeyword], color: s.syntaxKeyword },
      { tag: [t.string, t.special(t.string), t.character], color: s.syntaxString },
      { tag: [t.number, t.bool, t.atom, t.unit], color: s.syntaxNumber },
      {
        tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
        color: s.syntaxComment,
        fontStyle: 'italic',
      },
      { tag: [t.typeName, t.className, t.namespace, t.macroName], color: s.syntaxType },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: s.syntaxFunction },
      { tag: [t.definition(t.variableName)], color: s.syntaxVariable },
      { tag: t.variableName, color: s.syntaxVariable },
      { tag: [t.local(t.name), t.self], color: s.syntaxKeyword },
      { tag: [t.propertyName], color: s.syntaxProperty },
      { tag: [t.operator, t.operatorKeyword, t.compareOperator, t.logicOperator], color: s.syntaxOperator },
      { tag: [t.punctuation, t.separator, t.bracket], color: s.syntaxPunctuation },
      { tag: [t.tagName], color: s.syntaxTag },
      { tag: [t.attributeName], color: s.syntaxAttribute },
      { tag: [t.meta, t.annotation, t.processingInstruction], color: s.syntaxMeta },
      { tag: [t.regexp, t.escape], color: s.syntaxString },
      { tag: [t.link, t.url], color: s.syntaxFunction, textDecoration: 'underline' },
      { tag: [t.heading, t.strong], color: s.syntaxKeyword, fontWeight: '600' },
      { tag: t.emphasis, fontStyle: 'italic' },
      { tag: [t.invalid], color: s.syntaxInvalid },
      { tag: [t.labelName], color: s.syntaxMeta },
    ])
  );
};

const EDITOR_THEMES: Record<ResolvedScheme, Extension> = {
  dark: makeEditorTheme('dark'),
  light: makeEditorTheme('light'),
};

const SYNTAX_EXTENSIONS: Record<ResolvedScheme, Extension> = {
  dark: makeSyntaxHighlighting('dark'),
  light: makeSyntaxHighlighting('light'),
};

export const getM3EditorTheme = (scheme: ResolvedScheme): Extension => EDITOR_THEMES[scheme];
export const getM3SyntaxHighlighting = (scheme: ResolvedScheme): Extension =>
  SYNTAX_EXTENSIONS[scheme];
