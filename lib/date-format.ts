import { format, parseISO, isValid } from 'date-fns';

/** Hard fallback used when neither the user nor the org has a preference. */
export const DATE_FORMAT_DEFAULT = 'yyyy-MM-dd';

/**
 * The nine selectable date-fns patterns (three token orders × three
 * separators). Both the user override (`user_preferences`) and the org default
 * (`org_preferences`) are stored under preference_key = 'regional.date_format'
 * as one of these exact patterns.
 */
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

export type DateFormatPattern = (typeof DATE_FORMAT_PATTERNS)[number];

/** Type guard: is `value` one of the nine selectable patterns? */
export function isDateFormatPattern(
  value: unknown,
): value is DateFormatPattern {
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

/**
 * Format a date value using the given date-fns pattern. Accepts ISO date
 * strings (e.g. `YYYY-MM-DD`) or Date objects. Returns `fallback` for
 * null/empty/invalid input.
 */
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

/**
 * Format a date-time value: the date part follows the given date-fns pattern
 * (so day/month/year order matches the user's preference) while the time and
 * timezone are appended, e.g. `30/01/2025 | 4:32 AM PST`. Callers that need UTC
 * handling should pass an already-normalized Date.
 */
export function formatDateTime(
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

  const datePart = format(date, pattern);
  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date);

  return `${datePart} | ${timePart}`;
}
