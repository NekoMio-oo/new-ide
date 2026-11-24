import type { ReactNode } from 'react';
import { cx } from './cx';

/** Vertical panel shell: header / toolbar / scrollable body composition. */
export const Panel = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cx('flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface', className)}>
    {children}
  </div>
);

export const PanelHeader = ({
  title,
  subtitle,
  leading,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) => (
  <div
    className={cx(
      'flex h-10 shrink-0 items-center gap-2 border-b border-outline-variant bg-surface pl-3 pr-1.5',
      className
    )}
  >
    {leading}
    <div className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="truncate text-sm font-semibold text-on-surface">{title}</span>
      {subtitle ? (
        <span className="truncate font-mono text-2xs text-on-surface-variant">{subtitle}</span>
      ) : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
  </div>
);

/** Horizontal action strip beneath a header (segmented tools, filters). */
export const Toolbar = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cx(
      'flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-outline-variant bg-surface px-2 no-scrollbar',
      className
    )}
  >
    {children}
  </div>
);

export const PanelBody = ({
  children,
  className,
  padded = false,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) => (
  <div
    className={cx(
      'min-h-0 flex-1 overflow-y-auto touch-scroll',
      padded && 'px-3 py-3',
      className
    )}
  >
    {children}
  </div>
);

/** Flat grouped block — a section, not a floating card. */
export const Section = ({
  title,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <section className={cx('border-b border-outline-variant last:border-b-0', className)}>
    {(title || actions) && (
      <header className="flex h-8 items-center gap-2 bg-surface-container-low px-3">
        {title ? (
          <span className="text-2xs font-semibold uppercase tracking-[0.07em] text-on-surface-variant">
            {title}
          </span>
        ) : null}
        {meta}
        <div className="flex-1" />
        {actions}
      </header>
    )}
    <div className={cx('py-1', bodyClassName)}>{children}</div>
  </section>
);

export const EmptyState = ({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <div
    className={cx(
      'flex h-full w-full flex-col items-center justify-center gap-3 px-8 py-10 text-center',
      className
    )}
  >
    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant">
      {icon}
    </div>
    <div className="space-y-1">
      <div className="text-base font-medium text-on-surface">{title}</div>
      {description ? (
        <p className="max-w-[260px] text-sm leading-relaxed text-on-surface-variant">{description}</p>
      ) : null}
    </div>
    {action ? <div className="pt-1">{action}</div> : null}
  </div>
);

/** Inline notice row (errors, hints, successes) — no heavy card chrome. */
export const Notice = ({
  tone = 'info',
  icon,
  children,
  actions,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) => {
  const tones = {
    info: 'bg-secondary-container/50 text-on-secondary-container',
    success: 'bg-success-container/45 text-on-success-container',
    warning: 'bg-warning-container/45 text-on-warning-container',
    error: 'bg-error-container/45 text-on-error-container',
  } as const;

  return (
    <div className={cx('flex items-start gap-2 px-3 py-2 text-sm', tones[tone])}>
      {icon ? <span className="mt-[1px] shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
};
