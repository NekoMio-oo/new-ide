// Theme engine: resolves dark / light / system mode, injects the token layer as
// CSS custom properties, and notifies subscribers (React `useSyncExternalStore`).
//
// Colours live only in ./tokens.ts — this module is the bridge to CSS.

import { COLOR_ROLES, cssVarName, schemeFor, type M3Scheme } from './tokens';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedScheme = 'dark' | 'light';

export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
const STORAGE_KEY = 'pocketforge.theme.mode';

/** Browser/WebView chrome colour per scheme (status bar + task switcher). */
export const THEME_CHROME_COLOR: Record<ResolvedScheme, string> = {
  dark: '#121318',
  light: '#FBF8FF',
};

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'dark' || value === 'light' || value === 'system';

let currentMode: ThemeMode = DEFAULT_THEME_MODE;
let resolvedScheme: ResolvedScheme = 'dark';
let initialised = false;

const listeners = new Set<() => void>();

const hexToTriplet = (hex: string): string => {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.slice(0, 6);
  const int = Number.parseInt(full, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
};

const systemPrefersDark = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const readStoredMode = (): ThemeMode => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    // storage may be unavailable (private mode / locked WebView)
  }
  return DEFAULT_THEME_MODE;
};

const writeStoredMode = (mode: ThemeMode) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore — theme still applies for this session
  }
};

const paint = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const scheme = schemeFor(resolvedScheme);

  for (const role of COLOR_ROLES) {
    root.style.setProperty(cssVarName(role), hexToTriplet(scheme[role]));
  }

  root.classList.toggle('dark', resolvedScheme === 'dark');
  root.classList.toggle('light', resolvedScheme === 'light');
  root.style.colorScheme = resolvedScheme;
  root.dataset.theme = resolvedScheme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_CHROME_COLOR[resolvedScheme]);

  for (const listener of listeners) listener();
};

const resolve = () => {
  resolvedScheme =
    currentMode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : currentMode;
};

/** Applies a mode (and persists it) — this is the only theme write path. */
export const setThemeMode = (mode: ThemeMode) => {
  currentMode = mode;
  writeStoredMode(mode);
  resolve();
  paint();
};

export const getThemeMode = (): ThemeMode => currentMode;
export const getResolvedScheme = (): ResolvedScheme => resolvedScheme;
export const getScheme = (): M3Scheme => schemeFor(resolvedScheme);

/** Stable store subscription for `useSyncExternalStore`. */
export const subscribeTheme = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Call once, before the first render. */
export const initTheme = () => {
  currentMode = readStoredMode();
  resolve();
  paint();

  if (initialised || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    initialised = true;
    return;
  }
  initialised = true;

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    if (currentMode !== 'system') return;
    resolve();
    paint();
  };
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onSystemChange);
  } else if (typeof media.addListener === 'function') {
    media.addListener(onSystemChange);
  }
};
