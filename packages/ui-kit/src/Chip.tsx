import type { ReactNode } from 'react';
import { cx } from './cx';
import { haptic } from './haptics';

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
}

const CHIP_SIZES = {
  sm: 'h-5 px-1.5 text-2xs',
  md: 'h-7 px-2 text-xs',
  lg: 'h-8 px-2.5 text-xs',
} as const;

export const Chip = ({
  children,
  selected,
  icon,
  onClick,
  className,
  title,
  size = 'md',
}: ChipProps) => {
  const shared = cx(
    'press inline-flex shrink-0 items-center gap-1 rounded-sm border font-medium',
    CHIP_SIZES[size],
    selected
      ? 'border-transparent bg-secondary-container text-on-secondary-container'
      : 'border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface',
    className
  );

  if (!onClick) return <span className={shared}>{icon}{children}</span>;

  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        haptic('select');
        onClick();
      }}
      className={shared}
    >
      {icon}
      {children}
    </button>
  );
};

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
  primary: 'bg-primary-container/60 text-on-primary-container',
  info: 'bg-secondary-container text-on-secondary-container',
  success: 'bg-success-container text-on-success-container',
  warning: 'bg-warning-container text-on-warning-container',
  error: 'bg-error-container text-on-error-container',
};

export const Badge = ({
  children,
  tone = 'neutral',
  mono = true,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  mono?: boolean;
  className?: string;
}) => (
  <span
    className={cx(
      'inline-flex h-[18px] shrink-0 items-center rounded-xs px-1.5 text-2xs font-medium',
      mono && 'font-mono',
      BADGE_TONES[tone],
      className
    )}
  >
    {children}
  </span>
);
