// Haptic feedback for touch interactions. Uses the WebView vibration API
// (Capacitor/Android WebView exposes navigator.vibrate); silently no-ops where
// unsupported so desktop debugging and jsdom tests stay clean.

export type HapticKind = 'tap' | 'select' | 'impact' | 'longPress' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  select: 5,
  impact: 14,
  longPress: 16,
  success: [8, 40, 12],
  warning: [12, 60, 12],
  error: [18, 50, 18],
};

export const haptic = (kind: HapticKind = 'tap'): void => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // ignore — haptics are decorative
  }
};
