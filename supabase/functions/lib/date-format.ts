import { format, parseISO, isValid } from 'npm:date-fns@^4.1.0';

// Deno-local mirror of the app's lib/date-format.ts. Edge functions cannot
// import from the Next.js app, so the small resolve/format helpers are
// duplicated here and applied per email recipient.

export const DATE_FORMAT_DEFAULT = 'yyyy-MM-dd';

/** The nine selectable date-fns patterns (mirror of the app's list). */
export const DATE_FORMAT_PATTERNS = [
  'yyyy-MM-dd',
  'dd-MM-yyyy',
  'MM-dd-yyyy',
  'yyyy.MM.dd',
  'dd.MM.yyyy',
  'MM.dd.yyyy',
  'yyyy/MM/dd',
  'dd/MM/yyyy',
  'MM/dd/yyyy',
] as const;

/** Type guard: is `value` one of the nine selectable patterns? */
export function isDateFormatPattern(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (DATE_FORMAT_PATTERNS as readonly string[]).includes(value)
  );
}

/**
 * Resolve the effective date-fns pattern with priority: the user's chosen
 * pattern, then the org default, then the hard default.
 */
export function resolveDateFormat(
  userPattern: string | null | undefined,
  orgPattern: string | null | undefined,
): string {
  return userPattern || orgPattern || DATE_FORMAT_DEFAULT;
}

export function formatDate(
  value: string | Date | null | undefined,
  pattern: string = DATE_FORMAT_DEFAULT,
  fallback = 'N/A',
): string {
  if (value === null || value === undefined || value === '') return fallback;

  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else {
    date = parseISO(value);
    if (!isValid(date)) date = new Date(value);
  }

  if (!isValid(date)) return fallback;
  return format(date, pattern);
}
