/** @type {import('tailwindcss').Config} */

// Colour roles are declared once in packages/m3-theme/src/tokens.ts and injected
// at runtime as `--m3-<kebab-role>: r g b` triplets. This config only mirrors the
// role names so utilities like `bg-surface-container-high/60` keep alpha support.

const ROLE_NAMES = `
  primary onPrimary primaryContainer onPrimaryContainer
  secondary onSecondary secondaryContainer onSecondaryContainer
  tertiary onTertiary tertiaryContainer onTertiaryContainer
  error onError errorContainer onErrorContainer
  surface onSurface surfaceVariant onSurfaceVariant surfaceDim surfaceBright
  surfaceContainerLowest surfaceContainerLow surfaceContainer
  surfaceContainerHigh surfaceContainerHighest
  outline outlineVariant inverseSurface inverseOnSurface inversePrimary
  scrim shadow surfaceTint
  success onSuccess successContainer onSuccessContainer
  warning onWarning warningContainer onWarningContainer
  editor editorGutter editorLineHighlight editorSelection editorCursor
  editorIndentGuide editorWidget editorWidgetBorder
  syntaxKeyword syntaxString syntaxNumber syntaxComment syntaxFunction syntaxType
  syntaxVariable syntaxProperty syntaxOperator syntaxPunctuation syntaxTag
  syntaxAttribute syntaxMeta syntaxInvalid
  gitAdded gitModified gitDeleted gitConflict
`
  .trim()
  .split(/\s+/);

const kebab = (role) => role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const colorRole = (role) => `rgb(var(--m3-${kebab(role)}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/*/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '380px',
        sm: '480px',
        md: '720px',
      },
      colors: {
        ...Object.fromEntries(ROLE_NAMES.map((role) => [kebab(role), colorRole(role)])),
      },
      fontFamily: {
        sans: [
          'Inter',
          'Roboto',
          'Noto Sans SC',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '13px', letterSpacing: '0.02em' }],
        xs: ['11px', { lineHeight: '15px' }],
        sm: ['12px', { lineHeight: '17px' }],
        base: ['13px', { lineHeight: '19px' }],
        md: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '22px' }],
        xl: ['18px', { lineHeight: '24px' }],
      },
      opacity: {
        3: '0.03',
        4: '0.04',
        6: '0.06',
        7: '0.07',
        8: '0.08',
        12: '0.12',
        14: '0.14',
        15: '0.15',
        18: '0.18',
        35: '0.35',
        45: '0.45',
        55: '0.55',
        65: '0.65',
        85: '0.85',
      },
      spacing: {
        appbar: 'var(--appbar-h)',
        tabbar: 'var(--tabbar-h)',
        statusbar: 'var(--statusbar-h)',
        navbar: 'var(--navbar-h)',
        rail: 'var(--rail-w)',
        keybar: 'var(--keybar-h)',
      },
      borderRadius: {
        xs: 'var(--m3-shape-xs)',
        sm: 'var(--m3-shape-sm)',
        md: 'var(--m3-shape-md)',
        lg: 'var(--m3-shape-lg)',
        xl: 'var(--m3-shape-xl)',
      },
      boxShadow: {
        e1: 'var(--elevation-1)',
        e2: 'var(--elevation-2)',
        e3: 'var(--elevation-3)',
        sheet: 'var(--elevation-sheet)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'panel-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-in': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'drawer-in': {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'snack-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--motion-base) var(--ease-standard) both',
        'panel-in': 'panel-in var(--motion-base) var(--ease-standard) both',
        'sheet-in': 'sheet-in var(--motion-slow) var(--ease-emphasized) both',
        'drawer-in': 'drawer-in var(--motion-slow) var(--ease-emphasized) both',
        'snack-in': 'snack-in var(--motion-base) var(--ease-standard) both',
      },
    },
  },
  plugins: [],
};
