import type { ReactNode } from 'react';
import { cx } from './cx';
import { haptic } from './haptics';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export interface SegmentedTabsProps<T extends string> {
  tabs: Array<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** `fill` stretches items evenly — good for 3–4 short labels. */
  layout?: 'scroll' | 'fill';
  /** Draw the bottom divider (off when the parent already provides one). */
  bordered?: boolean;
}

/**
 * M3 secondary tabs: underline indicator, no filled pills. Used for every
 * in-panel sub-navigation so the hierarchy stays identical across the IDE.
 */
export const SegmentedTabs = <T extends string>({
  tabs,
  value,
  onChange,
  className,
  layout = 'scroll',
  bordered = true,
}: SegmentedTabsProps<T>) => (
  <div
    role="tablist"
    className={cx(
      'flex shrink-0 items-stretch bg-surface',
      bordered && 'border-b border-outline-variant',
      layout === 'scroll' && 'edge-fade',
      layout === 'scroll' ? 'overflow-x-auto no-scrollbar px-1' : 'px-1',
      className
    )}
  >
    {tabs.map((tab) => {
      const active = tab.id === value;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => {
            if (active) return;
            haptic('select');
            onChange(tab.id);
          }}
          className={cx(
            'press relative flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-sm font-medium transition-colors',
            layout === 'fill' && 'flex-1 justify-center',
            active
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface'
          )}
        >
          {tab.icon}
          <span className="whitespace-nowrap">{tab.label}</span>
          {typeof tab.count === 'number' && tab.count > 0 && (
            <span
              className={cx(
                'rounded-xs px-1 font-mono text-2xs leading-[14px]',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'bg-surface-container-high text-on-surface-variant'
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
