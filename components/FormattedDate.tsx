'use client';

import { useDateFormat } from '@/hooks/useDateFormat';

interface Props {
  value: string | Date | null | undefined;
  /** Text shown for null/empty/invalid input. Defaults to 'N/A'. */
  fallback?: string;
  className?: string;
}

/**
 * Renders a date using the current user's effective date format preference.
 * Client-only (reads UserContext). For server components use
 * `getEffectiveDateFormat()` + `formatDate` from `@/lib/date-format`.
 */
export function FormattedDate({ value, fallback = 'N/A', className }: Props) {
  const { formatDate } = useDateFormat();
  return <span className={className}>{formatDate(value, fallback)}</span>;
}
