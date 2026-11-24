import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  getResolvedScheme,
  getThemeMode,
  setThemeMode,
  subscribeTheme,
  type ResolvedScheme,
  type ThemeMode,
} from '@pocketforge/m3-theme';

/** Current resolved colour scheme ('dark' | 'light'). Re-renders on theme change. */
export const useResolvedScheme = (): ResolvedScheme =>
  useSyncExternalStore(subscribeTheme, getResolvedScheme, getResolvedScheme);

/** Theme mode plus its setter, shared app-wide through the m3-theme store. */
export const useTheme = (): {
  mode: ThemeMode;
  scheme: ResolvedScheme;
  setMode: (mode: ThemeMode) => void;
} => {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, getThemeMode);
  const scheme = useSyncExternalStore(subscribeTheme, getResolvedScheme, getResolvedScheme);
  return { mode, scheme, setMode: setThemeMode };
};

export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
  onContextMenu: (event: ReactMouseEvent) => void;
}

/**
 * Long-press detection that does not fight the click handler: when a long press
 * fires, the following click is swallowed via `consumeSuppressedClick()`.
 */
export const useLongPress = (
  onLongPress: (() => void) | undefined,
  delayMs = 450
): { handlers: LongPressHandlers; consumeSuppressedClick: () => boolean } => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const suppressed = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const start = useCallback(
    (event: ReactPointerEvent) => {
      if (!onLongPress) return;
      origin.current = { x: event.clientX, y: event.clientY };
      suppressed.current = false;
      clearTimeout(timer.current ?? undefined);
      timer.current = setTimeout(() => {
        suppressed.current = true;
        timer.current = null;
        onLongPress();
      }, delayMs);
    },
    [delayMs, onLongPress]
  );

  return {
    handlers: {
      onPointerDown: start,
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerMove: (event) => {
        if (!origin.current) return;
        const dx = Math.abs(event.clientX - origin.current.x);
        const dy = Math.abs(event.clientY - origin.current.y);
        if (dx > 10 || dy > 10) clear();
      },
      onContextMenu: (event) => {
        if (!onLongPress) return;
        event.preventDefault();
        onLongPress();
      },
    },
    consumeSuppressedClick: () => {
      const wasSuppressed = suppressed.current;
      suppressed.current = false;
      return wasSuppressed;
    },
  };
};

/** Tracks whether the soft keyboard is likely open (Android WebView viewport shrink). */
export const useSoftKeyboard = (): boolean => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const evaluate = () => {
      const shrunk = window.innerHeight - vv.height > 140;
      setOpen(shrunk);
      document.body.classList.toggle('kb-open', shrunk);
    };

    evaluate();
    vv.addEventListener('resize', evaluate);
    return () => {
      vv.removeEventListener('resize', evaluate);
      document.body.classList.remove('kb-open');
    };
  }, []);

  return open;
};

/**
 * Reports whether a horizontal scroller actually overflows, so callers can add
 * a trailing `.edge-fade` only when it means something (a lone tab should not
 * show a gradient tail). Re-measures on resize and on DOM changes inside it.
 */
export const useOverflowFade = <T extends HTMLElement>(key?: unknown) => {
  const ref = useRef<T | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const next = el.scrollWidth - el.clientWidth > 2;
      setOverflowing((prev) => (prev === next ? prev : next));
    };

    measure();
    // jsdom and older WebViews may not ship these observers — degrade quietly.
    const resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(el);
    const mutation =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(measure);
    mutation?.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      resize?.disconnect();
      mutation?.disconnect();
    };
  }, [key]);

  return { ref, overflowing };
};
