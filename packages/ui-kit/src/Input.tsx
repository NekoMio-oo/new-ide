import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

const FIELD_BASE =
  'w-full rounded-sm border border-outline bg-surface-container-low px-2.5 text-sm text-on-surface ' +
  'placeholder:text-on-surface-variant/55 transition-colors duration-fast ' +
  'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/35 ' +
  'disabled:opacity-50';

const LABEL = 'mb-1 block text-2xs font-medium uppercase tracking-[0.06em] text-on-surface-variant';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  mono?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  containerClassName?: string;
  size?: 'sm' | 'md';
}

export const TextInput = ({
  label,
  hint,
  mono = true,
  leading,
  trailing,
  className,
  containerClassName,
  size = 'md',
  ...rest
}: TextInputProps) => (
  <label className={cx('block min-w-0', containerClassName)}>
    {label ? <span className={LABEL}>{label}</span> : null}
    <div className="relative flex items-center">
      {leading ? (
        <span className="pointer-events-none absolute left-2.5 text-on-surface-variant">{leading}</span>
      ) : null}
      <input
        className={cx(
          FIELD_BASE,
          size === 'sm' ? 'h-7 text-xs' : 'h-9 text-sm',
          mono && 'font-mono',
          leading ? 'pl-8' : null,
          trailing ? 'pr-8' : null,
          className
        )}
        {...rest}
      />
      {trailing ? <span className="absolute right-1.5">{trailing}</span> : null}
    </div>
    {hint ? <span className="mt-1 block text-2xs text-on-surface-variant/80">{hint}</span> : null}
  </label>
);

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  mono?: boolean;
  containerClassName?: string;
}

export const TextArea = ({
  label,
  mono = true,
  className,
  containerClassName,
  rows = 3,
  ...rest
}: TextAreaProps) => (
  <label className={cx('block min-w-0', containerClassName)}>
    {label ? <span className={LABEL}>{label}</span> : null}
    <textarea
      rows={rows}
      className={cx(FIELD_BASE, 'resize-none py-2 leading-[18px]', mono && 'font-mono', className)}
      {...rest}
    />
  </label>
);

export interface SelectInputProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: ReactNode;
  children: ReactNode;
  containerClassName?: string;
  size?: 'sm' | 'md';
}

export const SelectInput = ({
  label,
  children,
  className,
  containerClassName,
  size = 'md',
  ...rest
}: SelectInputProps) => (
  <label className={cx('block min-w-0', containerClassName)}>
    {label ? <span className={LABEL}>{label}</span> : null}
    <select
      className={cx(
        FIELD_BASE,
        size === 'sm' ? 'h-7 text-xs' : 'h-9 text-sm',
        'cursor-pointer appearance-none bg-[length:14px] bg-[right_8px_center] bg-no-repeat pr-8 font-mono',
        className
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b91a4' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
      }}
      {...rest}
    >
      {children}
    </select>
  </label>
);
