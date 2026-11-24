import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { haptic } from './haptics';

export interface SnackbarProps {
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  /** Extra bottom offset for layouts without a navigation bar. */
  className?: string;
}

/**
 * M3 snackbar anchored above the bottom navigation bar. Auto-dismiss timing is
 * owned by the caller (the workbench), this component only renders + animates.
 */
export const Snackbar = ({ message, actionLabel, onAction, onDismiss, className }: SnackbarProps) => {
  const lastMessage = useRef<string | null>(null);
  lastMessage.current = message;

  useEffect(() => {
    if (message) haptic('select');
  }, [message]);

  if (!message) return null;

  const content: ReactNode = (
    <span className="min-w-0 flex-1 leading-snug">{message}</span>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-3',
        'bottom-[calc(var(--navbar-h)+var(--safe-bottom)+10px)]',
        className
      )}
    >
      <div className="pointer-events-auto flex w-full max-w-[520px] animate-snack-in items-center gap-3 rounded-md bg-inverse-surface px-3.5 py-2.5 text-sm text-inverse-on-surface shadow-e2">
        {content}
        {actionLabel ? (
          <button
            type="button"
            onClick={() => {
              haptic('tap');
              onAction?.();
            }}
            className="press shrink-0 rounded-xs px-1.5 py-1 text-sm font-semibold text-inverse-primary"
          >
            {actionLabel}
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            aria-label="关闭提示"
            onClick={onDismiss}
            className="press shrink-0 rounded-xs px-1.5 py-1 text-sm text-inverse-on-surface/70"
          >
            关闭
          </button>
        ) : null}
      </div>
    </div>
  );
};
