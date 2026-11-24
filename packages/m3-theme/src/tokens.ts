// PocketForge IDE — design tokens (single source of truth).
//
// The token set is a Material 3 colour-role system extended with IDE-specific
// roles (editor chrome, syntax, VCS status). Every value is a plain hex colour so
// the same token can drive:
//   - CSS custom properties (injected as `r g b` triplets, so Tailwind alpha
//     modifiers keep working: rgb(var(--m3-primary) / 0.2)),
//   - CodeMirror / xterm.js canvases (they need concrete colours).
//
// Nothing else in the app may hardcode a colour. Add a role here instead.

export const COLOR_ROLES = [
  // Core M3 roles
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'outline',
  'outlineVariant',
  'inverseSurface',
  'inverseOnSurface',
  'inversePrimary',
  'scrim',
  'shadow',
  'surfaceTint',
  // Semantic status roles
  'success',
  'onSuccess',
  'successContainer',
  'onSuccessContainer',
  'warning',
  'onWarning',
  'warningContainer',
  'onWarningContainer',
  // Editor chrome — the editor is its own surface, one step off the app shell
  'editor',
  'editorGutter',
  'editorLineHighlight',
  'editorSelection',
  'editorCursor',
  'editorIndentGuide',
  'editorWidget',
  'editorWidgetBorder',
  // Syntax highlighting
  'syntaxKeyword',
  'syntaxString',
  'syntaxNumber',
  'syntaxComment',
  'syntaxFunction',
  'syntaxType',
  'syntaxVariable',
  'syntaxProperty',
  'syntaxOperator',
  'syntaxPunctuation',
  'syntaxTag',
  'syntaxAttribute',
  'syntaxMeta',
  'syntaxInvalid',
  // Version control status
  'gitAdded',
  'gitModified',
  'gitDeleted',
  'gitConflict',
] as const;

export type ColorRole = (typeof COLOR_ROLES)[number];
export type M3Scheme = Record<ColorRole, string>;

/** `surfaceContainerLow` -> `--m3-surface-container-low` */
export const cssVarName = (role: ColorRole): string =>
  `--m3-${role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;

export const cssVar = (role: ColorRole): string => `var(${cssVarName(role)})`;

/**
 * Dark scheme — the primary IDE scheme.
 * Anchors: surface #121318 · container #1C1D23 · primary #B9C6FF ·
 * secondary #C2C6DC · outline #444650 · editor #17181D.
 */
export const darkScheme: M3Scheme = {
  primary: '#B9C6FF',
  onPrimary: '#1B2559',
  primaryContainer: '#333F70',
  onPrimaryContainer: '#DEE1FF',

  secondary: '#C2C6DC',
  onSecondary: '#2C3041',
  secondaryContainer: '#3A3E51',
  onSecondaryContainer: '#DEE1F9',

  tertiary: '#DFC0E4',
  onTertiary: '#3E2A46',
  tertiaryContainer: '#55405E',
  onTertiaryContainer: '#FBD9FF',

  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',

  surface: '#121318',
  onSurface: '#E4E2E8',
  surfaceVariant: '#3A3C46',
  onSurfaceVariant: '#C3C6D2',
  surfaceDim: '#121318',
  surfaceBright: '#38393F',
  surfaceContainerLowest: '#0D0E12',
  surfaceContainerLow: '#16171C',
  surfaceContainer: '#1C1D23',
  surfaceContainerHigh: '#22232A',
  surfaceContainerHighest: '#292A31',
  outline: '#444650',
  outlineVariant: '#2C2D35',
  inverseSurface: '#E4E2E8',
  inverseOnSurface: '#2F3037',
  inversePrimary: '#4B5C9E',
  scrim: '#000000',
  shadow: '#000000',
  surfaceTint: '#B9C6FF',

  success: '#7ADE9F',
  onSuccess: '#00391B',
  successContainer: '#14522F',
  onSuccessContainer: '#A6F5BE',

  warning: '#F0C27B',
  onWarning: '#402D00',
  warningContainer: '#5B4300',
  onWarningContainer: '#FFDFA6',

  editor: '#17181D',
  editorGutter: '#15161B',
  editorLineHighlight: '#1D1F26',
  editorSelection: '#33406B',
  editorCursor: '#B9C6FF',
  editorIndentGuide: '#2A2C34',
  editorWidget: '#22232A',
  editorWidgetBorder: '#33353E',

  syntaxKeyword: '#B9C6FF',
  syntaxString: '#A5D6A0',
  syntaxNumber: '#E6BD7E',
  syntaxComment: '#6E7488',
  syntaxFunction: '#8CCFF7',
  syntaxType: '#7FDDC4',
  syntaxVariable: '#E4E2E8',
  syntaxProperty: '#C3C6D2',
  syntaxOperator: '#A9AFC2',
  syntaxPunctuation: '#8B91A4',
  syntaxTag: '#E79AA6',
  syntaxAttribute: '#E6BD7E',
  syntaxMeta: '#C0AAF5',
  syntaxInvalid: '#FF8A80',

  gitAdded: '#7ADE9F',
  gitModified: '#F0C27B',
  gitDeleted: '#FF9C93',
  gitConflict: '#F0C27B',
};

/**
 * Light scheme — same role semantics, inverted tonal directions.
 * Kept first-class: every surface/role above has a light counterpart.
 */
export const lightScheme: M3Scheme = {
  primary: '#4A598F',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DBE1FF',
  onPrimaryContainer: '#03164B',

  secondary: '#5A5F71',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#DEE1F4',
  onSecondaryContainer: '#171B2B',

  tertiary: '#74546B',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFD8EC',
  onTertiaryContainer: '#2B1224',

  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',

  surface: '#FBF8FF',
  onSurface: '#1B1B21',
  surfaceVariant: '#E3E1EC',
  onSurfaceVariant: '#46464F',
  surfaceDim: '#DBD9E0',
  surfaceBright: '#FBF8FF',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F5F3FB',
  surfaceContainer: '#EFEDF6',
  surfaceContainerHigh: '#E9E7F0',
  surfaceContainerHighest: '#E3E1EA',
  outline: '#777680',
  outlineVariant: '#C7C5D0',
  inverseSurface: '#303036',
  inverseOnSurface: '#F2F0F8',
  inversePrimary: '#B9C6FF',
  scrim: '#000000',
  shadow: '#000000',
  surfaceTint: '#4A598F',

  success: '#1E6B3F',
  onSuccess: '#FFFFFF',
  successContainer: '#B7F2C9',
  onSuccessContainer: '#00210F',

  warning: '#7A5900',
  onWarning: '#FFFFFF',
  warningContainer: '#FFDFA0',
  onWarningContainer: '#261A00',

  editor: '#FFFFFF',
  editorGutter: '#FAF9FE',
  editorLineHighlight: '#F3F2F9',
  editorSelection: '#CBD5F7',
  editorCursor: '#3A4A85',
  editorIndentGuide: '#E1DFE9',
  editorWidget: '#FFFFFF',
  editorWidgetBorder: '#D6D4DF',

  syntaxKeyword: '#4A5BC4',
  syntaxString: '#2E7D4F',
  syntaxNumber: '#9A5B00',
  syntaxComment: '#7A7F91',
  syntaxFunction: '#1F6EA8',
  syntaxType: '#0F7A6B',
  syntaxVariable: '#22242C',
  syntaxProperty: '#3F4457',
  syntaxOperator: '#5A6072',
  syntaxPunctuation: '#6B7080',
  syntaxTag: '#A03050',
  syntaxAttribute: '#8A5A00',
  syntaxMeta: '#6B4CB0',
  syntaxInvalid: '#B3261E',

  gitAdded: '#1E6B3F',
  gitModified: '#7A5900',
  gitDeleted: '#B3261E',
  gitConflict: '#8A5A00',
};

export const schemeFor = (scheme: 'dark' | 'light'): M3Scheme =>
  scheme === 'dark' ? darkScheme : lightScheme;

/** Terminal ANSI-16 mapped onto the same tonal language as the UI. */
export const terminalAnsiFor = (scheme: 'dark' | 'light'): Record<string, string> => {
  const s = schemeFor(scheme);
  const dark = scheme === 'dark';
  return {
    black: dark ? '#0C0E12' : '#2B2C33',
    brightBlack: dark ? '#6E7488' : '#6B7080',
    red: dark ? '#FF8F85' : '#C0392B',
    brightRed: dark ? '#FFB4AB' : '#BA1A1A',
    green: dark ? '#8BD9A0' : '#1E6B3F',
    brightGreen: dark ? '#A6F5BE' : '#2E7D4F',
    yellow: dark ? '#E6BD7E' : '#8A5A00',
    brightYellow: dark ? '#FFDFA6' : '#9A5B00',
    blue: dark ? '#8CCFF7' : '#1F6EA8',
    brightBlue: dark ? '#B9C6FF' : '#4A598F',
    magenta: dark ? '#DFC0E4' : '#74546B',
    brightMagenta: dark ? '#FBD9FF' : '#8E3F7E',
    cyan: dark ? '#7FDDC4' : '#0F7A6B',
    brightCyan: dark ? '#A8F0DF' : '#0B5E53',
    white: s.onSurface,
    brightWhite: s.onSurface,
  };
};

/** Backwards-compatible alias — the dark scheme is the product default. */
export const m3Dark = darkScheme;

export type M3ColorRoles = M3Scheme;
