import type { ReactNode } from 'react';
import { cx } from './cx';
import { haptic } from './haptics';

export interface ListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  className?: string;
  titleClassName?: string;
  indent?: number;
  dense?: boolean;
  'data-testid'?: string;
}

export const ListRow = ({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  active,
  onClick,
  onLongPress,
  className,
  titleClassName,
  indent = 0,
  dense,
  ...rest
}: ListRowProps) => {
  const content = (
    <>
      {leading ? <span className="flex h-5 w-5 shrink-0 items-center justify-center">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span
          className={cx(
            'block truncate',
            dense ? 'text-sm' : 'text-sm',
            active ? 'font-medium text-on-surface' : 'text-on-surface',
            titleClassName
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-2xs text-on-surface-variant">{subtitle}</span>
        ) : null}
      </span>
      {meta ? <span className="shrink-0 text-2xs font-mono text-on-surface-variant">{meta}</span> : null}
      {trailing ? <span className="flex shrink-0 items-center gap-0.5">{trailing}</span> : null}
    </>
  );

  const classes = cx(
    'press flex w-full items-center gap-2 rounded-sm text-left',
    dense ? 'min-h-[32px] py-1 pr-1.5' : 'min-h-[38px] py-1.5 pr-1.5',
    active
      ? 'bg-secondary-container/65 text-on-surface'
      : 'text-on-surface-variant hover:bg-on-surface/[0.05] active:bg-on-surface/[0.08]',
    onClick || onLongPress ? 'cursor-pointer' : 'cursor-default',
    className
  );

  const style = { paddingLeft: 8 + indent * 12 };

  const interactive = Boolean(onClick || onLongPress);

  // Always a div: rows frequently host trailing icon buttons, and nested
  // <button> elements are invalid DOM. Role + keyboard handling keep a11y.
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={classes}
      style={style}
      onClick={() => {
        if (!onClick) return;
        haptic('select');
        onClick();
      }}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          haptic('select');
          onClick();
        }
      }}
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        haptic('longPress');
        onLongPress();
      }}
      {...rest}
    >
      {content}
    </div>
  );
};
