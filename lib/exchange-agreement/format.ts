// The export stores currency as a symbol ('€', '£', '$'), not an ISO code, so
// the shared formatCurrency (Intl.NumberFormat with a currency code) can't be
// reused here — it would throw on a symbol. Plain symbol + formatted number
// instead, matching the POC's own "€14,408.50" display.
export function formatFeeAmount(
  value: number | null,
  currency: string | null,
): string {
  if (value == null) return '—';
  const formatted = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = value < 0 ? '-' : '';
  return `${sign}${currency ?? ''}${formatted}`;
}

// formatFeeAmount already signs negatives; this only needs to add the
// leading '+' formatFeeAmount deliberately omits for positive values.
export function formatFeeChange(
  value: number | null,
  currency: string | null,
): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatFeeAmount(value, currency)}`;
}

export function changeColorClass(value: number | null | undefined): string {
  if (!value) return '';
  return value > 0 ? 'text-red-500' : 'text-green';
}

// Colors a count only when it's nonzero -- unlike changeColorClass, a count
// has no intrinsic sign to read (an "increases" count and a "decreases"
// count are both always >= 0), so the caller supplies which color it means.
export function colorIfNonZero(
  count: number,
  colorClass: string,
): string | undefined {
  return count > 0 ? colorClass : undefined;
}

// Summary contexts (product line / exchange rows and stat cards) show just
// the month a version took effect; the full "V21.0 (Oct 2026)" label is
// reserved for the version badge and the version-comparison selects.
export function formatMonthYear(effectiveDate: string): string {
  return new Date(`${effectiveDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Abbreviated month, e.g. "Oct 2026" — distinct from formatMonthYear's full
// month name used elsewhere (chart axis ticks/tooltips and the version
// label below both want the shorter form).
export function formatShortMonthYear(effectiveDate: string): string {
  return new Date(`${effectiveDate}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The version badge/selector label, e.g. "V21.0 (Oct 2026)". Matches the
// reference POC app's own version label formatting.
export function formatVersionLabel(
  version: string,
  effectiveDate: string,
): string {
  return `V${version} (${formatShortMonthYear(effectiveDate)})`;
}
