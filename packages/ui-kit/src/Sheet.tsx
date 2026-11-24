import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { IconButton } from './Button';
import { X } from 'lucide-react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra classes for the sheet surface (max-height, padding). */
  className?: string;
  testId?: string;
}

/**
 * M3 modal bottom sheet: drag handle, sticky header, scrollable body, optional
 * footer. Dismisses on scrim tap and hardware/keyboard back.
 */
export const Sheet = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  testId,
}: SheetProps) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="presentation">
      <div
        className="absolute inset-0 animate-fade-in bg-scrim/55"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : '面板'}
        data-testid={testId}
        className={cx(
          'relative flex max-h-[86vh] w-full animate-sheet-in flex-col overflow-hidden',
          'rounded-t-xl border-t border-outline-variant bg-surface-container shadow-sheet pb-safe',
          className
        )}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2">
          <span className="h-1 w-8 rounded-full bg-outline" />
        </div>

        {(title || description) && (
          <div className="flex shrink-0 items-start gap-2 pl-4 pr-1.5 pb-1">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 className="truncate text-md font-semibold text-on-surface">{title}</h2>
              ) : null}
              {description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{description}</p>
              ) : null}
            </div>
            <IconButton label="关闭" onClick={onClose} size="sm">
              <X size={16} />
            </IconButton>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto touch-scroll">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-outline-variant bg-surface-container-low px-3 py-2">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
};
