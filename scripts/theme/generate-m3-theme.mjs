// Generates the Material 3 (2025 spec) design tokens for PocketForge IDE
// from the sky-blue seed, using Google's official material-color-utilities
// (the same engine behind Material Theme Builder).
//
// Run:  deno run -A scripts/theme/generate-m3-theme.mjs
//
// Outputs:
//   packages/m3-theme/src/tokens.ts          (TS tokens for xterm / CodeMirror / tests)
//   apps/mobile-ide/src/theme/m3-tokens.css  (CSS custom properties, RGB triplets)
//
// The scheme is dark-first (single dark theme) as decided for the IDE product.

if (!Deno.args.includes('--force')) {
  // HAND-MAINTAINED GUARD: packages/m3-theme/src/tokens.ts is now the curated
  // design-system source of truth (product palette + IDE-specific roles that the
  // generator cannot express). Re-running this script would clobber it.
  console.error(
    'Refusing to overwrite the curated palette. Pass --force to regenerate from the seed.'
  );
  Deno.exit(1);
}

import * as mcu from 'npm:@material/material-color-utilities@0.2.7';

const { writeTextFileSync } = Deno;

const {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  Hct,
  TonalPalette,
  SchemeTonalSpot,
  MaterialDynamicColors,
} = mcu;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Sky-600 — the seed carried over from the previous sky-blue brand accent.
const SEED = '#0284C7';

// Extended semantic seeds (success / warning / terminal ANSI hues) rendered
// through the same tonal-palette science so everything stays M3-coherent.
const SUCCESS_SEED = '#16A34A';
const WARNING_SEED = '#D97706';
const ANSI_SEEDS = {
  red: '#DC2626',
  green: '#16A34A',
  yellow: '#CA8A04',
  magenta: '#C026D3',
  cyan: '#0891B2',
};

const CONTRAST_LEVEL = 0; // standard M3 contrast, matches Theme Builder default
const TONES = [0, 4, 6, 10, 12, 17, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 96, 98, 99, 100];

// ---------------------------------------------------------------------------
// Role computation — full M3 2025 spec role set (dark scheme)
// ---------------------------------------------------------------------------

const seedArgb = argbFromHex(SEED);
const scheme = new SchemeTonalSpot(Hct.fromInt(seedArgb), true, CONTRAST_LEVEL);

const ROLE_NAMES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest',
  'outline', 'outlineVariant',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
  'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant',
  'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant',
  'surfaceTint', 'scrim', 'shadow',
];

const roles = {};
for (const name of ROLE_NAMES) {
  const dc = MaterialDynamicColors[name];
  if (!dc) throw new Error(`Missing M3 role in material-color-utilities: ${name}`);
  roles[name] = hexFromArgb(dc.getArgb(scheme));
}

// Extended success / warning palettes (expressive-app convention, not core M3).
const success = TonalPalette.fromInt(argbFromHex(SUCCESS_SEED));
const warning = TonalPalette.fromInt(argbFromHex(WARNING_SEED));
roles.success = hexFromArgb(success.tone(80));
roles.onSuccess = hexFromArgb(success.tone(20));
roles.successContainer = hexFromArgb(success.tone(30));
roles.onSuccessContainer = hexFromArgb(success.tone(90));
roles.successDim = hexFromArgb(success.tone(70));
roles.warning = hexFromArgb(warning.tone(80));
roles.onWarning = hexFromArgb(warning.tone(20));
roles.warningContainer = hexFromArgb(warning.tone(30));
roles.onWarningContainer = hexFromArgb(warning.tone(90));
roles.warningDim = hexFromArgb(warning.tone(70));

// ---------------------------------------------------------------------------
// Tonal palettes (for CodeMirror syntax highlighting / xterm ANSI)
// ---------------------------------------------------------------------------

const theme = themeFromSourceColor(seedArgb);
const palettes = {
  primary: theme.palettes.primary,
  secondary: theme.palettes.secondary,
  tertiary: theme.palettes.tertiary,
  neutral: theme.palettes.neutral,
  neutralVariant: theme.palettes.neutralVariant,
  error: theme.palettes.error,
  success,
  warning,
};

const tonalRamps = {};
for (const [name, palette] of Object.entries(palettes)) {
  const ramp = {};
  for (const tone of TONES) ramp[String(tone)] = hexFromArgb(palette.tone(tone));
  tonalRamps[name] = ramp;
}

// xterm ANSI-16 rendered through M3 tonal palettes (normal = tone 70, bright = tone 80)
const ansiSeeds = Object.fromEntries(
  Object.entries(ANSI_SEEDS).map(([k, v]) => [k, TonalPalette.fromInt(argbFromHex(v))])
);
const ansi = {
  black: tonalRamps.neutral['4'],
  brightBlack: tonalRamps.neutralVariant['50'],
  white: tonalRamps.neutral['90'],
  brightWhite: tonalRamps.neutral['95'],
};
for (const hue of ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']) {
  const p = hue === 'blue' ? palettes.primary : ansiSeeds[hue];
  ansi[hue] = hexFromArgb(p.tone(70));
  ansi[`bright${hue[0].toUpperCase()}${hue.slice(1)}`] = hexFromArgb(p.tone(80));
}

// ---------------------------------------------------------------------------
// Emit packages/m3-theme/src/tokens.ts
// ---------------------------------------------------------------------------

const toTsRecord = (obj, indent = '  ') =>
  Object.entries(obj)
    .map(([k, v]) => `${indent}'${k}': '${v}'`)
    .join(',\n');

const tokensTs = `// Material 3 (2025 spec) design tokens for PocketForge IDE — DARK scheme.
// GENERATED by scripts/theme/generate-m3-theme.mjs (seed ${SEED}, contrast ${CONTRAST_LEVEL}).
// Do not edit by hand; re-run the generator instead.

export const m3Dark = {
${toTsRecord(roles)},
} as const;

export type M3ColorRoles = typeof m3Dark;

/** Full tonal ramps (tone -> hex) used by the CodeMirror & xterm themes. */
export const tonalRamps = {
${Object.entries(tonalRamps)
  .map(([name, ramp]) => `  ${name}: {\n${toTsRecord(ramp, '    ')}\n  },`)
  .join('\n')}
} as const;

/** xterm.js ANSI-16 palette rendered through M3 tonal palettes. */
export const terminalAnsi = {
${toTsRecord(ansi)},
} as const;
`;

writeTextFileSync(
  new URL('../../packages/m3-theme/src/tokens.ts', import.meta.url).pathname,
  tokensTs
);

// ---------------------------------------------------------------------------
// Emit apps/mobile-ide/src/theme/m3-tokens.css (RGB triplets for <alpha-value>)
// ---------------------------------------------------------------------------

const hexToTriplets = (hex) => {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
};

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const cssVars = Object.entries(roles)
  .map(([k, v]) => `  --m3-${kebab(k)}: ${hexToTriplets(v)};`)
  .join('\n');

const css = `/* Material 3 (2025 spec) color roles — PocketForge IDE dark scheme.
   GENERATED by scripts/theme/generate-m3-theme.mjs (seed ${SEED}).
   Values are RGB triplets so Tailwind alpha modifiers keep working:
   rgb(var(--m3-primary) / 0.2). Do not edit by hand. */

:root {
${cssVars}
}
`;

writeTextFileSync(
  new URL('../../apps/mobile-ide/src/theme/m3-tokens.css', import.meta.url).pathname,
  css
);

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------

console.log('M3 2025 spec dark scheme (seed ' + SEED + '):\n');
for (const [k, v] of Object.entries(roles)) {
  console.log(`  ${k.padEnd(28)} ${v}`);
}
console.log('\nWrote packages/m3-theme/src/tokens.ts and apps/mobile-ide/src/theme/m3-tokens.css');
