/**
 * The `activities.created_at` column is `timestamp without time zone` and its
 * value is stored in UTC (Postgres session default). Serialized without a zone
 * marker, the browser would parse it as local time and shift it relative to the
 * UTC-based override rows. Append `Z` when no timezone is present so it parses
 * (and sorts) as UTC, matching the other feed sources.
 *
 * Kept in its own dependency-free module so it can be unit tested without the
 * `server-only` import chain that `activities.ts` pulls in.
 */
export function normalizeToUtc(value: string): string {
  if (!value) return value;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  if (hasTimezone) return value;
  // Only tag values that look like an ISO timestamp (date + time component).
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) ? `${value}Z` : value;
}
