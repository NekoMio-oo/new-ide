import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { haptic, type HapticKind } from './haptics';

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

const BASE =
  'press relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ' +
  'disabled:pointer-events-none disabled:opacity-40';

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-sm px-2.5 text-sm',
  md: 'h-9 rounded-md px-3 text-base',
};

const VARIANTS: Record<ButtonVariant, string> = {
  filled: 'bg-primary text-on-primary hover:bg-primary/90 active:bg-primary/80',
  tonal:
    'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/85 active:bg-secondary-container/75',
  outlined: 'border border-outline text-on-surface hover:bg-on-surface/[0.06] active:bg-on-surface/10',
  text: 'text-primary hover:bg-primary/10 active:bg-primary/15',
  danger:
    'bg-error-container text-on-error-container hover:bg-error-container/85 active:bg-error-container/75',
  ghost: 'text-on-surface-variant hover:bg-on-surface/[0.07] hover:text-on-surface active:bg-on-surface/[0.12]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
  /** Set to null to opt out of vibration for a specific action. */
  hapticKind?: HapticKind | null;
  'data-testid'?: string;
}

export const Button = ({
  variant = 'text',
  size = 'sm',
  icon,
  trailing,
  block,
  className,
  children,
  hapticKind = 'tap',
  onClick,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    className={cx(BASE, SIZES[size], VARIANTS[variant], block && 'w-full', className)}
    onClick={(event) => {
      if (hapticKind) haptic(hapticKind);
      onClick?.(event);
    }}
    {...rest}
  >
    {icon}
    {children}
    {trailing}
  </button>
);

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'ghost' | 'filled' | 'tonal' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  hapticKind?: HapticKind | null;
  'data-testid'?: string;
}

const ICON_SIZES = {
  sm: 'h-7 w-7 rounded-xs',
  md: 'h-8 w-8 rounded-sm',
  lg: 'h-9 w-9 rounded-md',
} as const;

const ICON_VARIANTS = {
  ghost:
    'text-on-surface-variant hover:bg-on-surface/[0.07] hover:text-on-surface active:bg-on-surface/[0.12]',
  filled: 'bg-primary text-on-primary hover:bg-primary/90',
  tonal: 'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/85',
  outlined: 'border border-outline text-on-surface-variant hover:bg-on-surface/[0.06]',
} as const;

export const IconButton = ({
  label,
  variant = 'ghost',
  size = 'md',
  active,
  className,
  children,
  hapticKind = 'tap',
  onClick,
  type = 'button',
  ...rest
}: IconButtonProps) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    aria-pressed={active}
    className={cx(
      'press inline-flex shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-40',
      ICON_SIZES[size],
      ICON_VARIANTS[variant],
      active && 'bg-secondary-container text-on-secondary-container',
      className
    )}
    onClick={(event) => {
      if (hapticKind) haptic(hapticKind);
      onClick?.(event);
    }}
    {...rest}
  >
    {children}
  </button>
);

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const Switch = ({ checked, onChange, label, disabled }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => {
      haptic('select');
      onChange(!checked);
    }}
    className={cx(
      'press relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors duration-base',
      checked
        ? 'border-primary/70 bg-primary/90'
        : 'border-outline bg-surface-container-highest',
      disabled && 'opacity-40'
    )}
  >
    <span
      className={cx(
        'absolute h-[16px] w-[16px] rounded-full transition-transform duration-base ease-standard',
        checked ? 'translate-x-[19px] bg-on-primary' : 'translate-x-[3px] bg-on-surface-variant'
      )}
    />
  </button>
);
