import type { ReactNode } from 'react';
import { cx } from './cx';
import { haptic } from './haptics';

export interface StatusItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  title?: string;
  tone?: 'default' | 'primary' | 'error' | 'warning' | 'success';
}

const TONES = {
  default: 'text-on-surface-variant',
  primary: 'text-primary',
  error: 'text-error',
  warning: 'text-warning',
  success: 'text-success',
} as const;

/**
 * Docked editor/panel status strip. Deliberately low-contrast and monospace so
 * it reads as instrument data rather than content.
 */
export const StatusStrip = ({
  items,
  trailing,
  className,
  'data-testid': testId,
}: {
  items: StatusItem[];
  trailing?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) => (
  <div
    data-testid={testId}
    className={cx(
      'flex h-[var(--statusbar-h)] shrink-0 items-center gap-3 border-t border-outline-variant bg-surface-container-low px-3 font-mono text-2xs',
      className
    )}
  >
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto no-scrollbar">
      {items.map((item) =>
        item.onClick ? (
          <button
            key={item.key}
            type="button"
            title={item.title ?? item.key}
            onClick={() => {
              haptic('select');
              item.onClick?.();
            }}
            className={cx(
              'press flex shrink-0 items-center gap-1 rounded-xs px-1 py-0.5 hover:bg-on-surface/[0.06]',
              TONES[item.tone ?? 'default']
            )}
          >
            {item.icon}
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        ) : (
          <span
            key={item.key}
            title={item.title}
            className={cx('flex shrink-0 items-center gap-1 whitespace-nowrap', TONES[item.tone ?? 'default'])}
          >
            {item.icon}
            {item.label}
          </span>
        )
      )}
    </div>
    {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
  </div>
);
