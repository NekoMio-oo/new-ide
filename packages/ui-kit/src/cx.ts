type ClassValue = string | false | null | undefined;

/** Minimal class-name joiner (avoids pulling in clsx for the ui-kit). */
export const cx = (...values: ClassValue[]): string => values.filter(Boolean).join(' ');
