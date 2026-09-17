const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:$|T)/;
const DOTNET_DATE = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/;

/**
 * A provider invoice date as the 'YYYY-MM-DD' the contracts date columns
 * hold. Xero (via Nango) serialises dates in the .NET form
 * `/Date(1780531200000+0000)/`; Ramp sends ISO. An ISO value keeps its
 * calendar date verbatim rather than round-tripping through the local
 * timezone, and anything unrecognised becomes null — an unparseable string in
 * a date column is worse than no value.
 */
export function parseProviderDate(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const iso = ISO_DATE_PREFIX.exec(value);
  if (iso) {
    // Date parsing normalises an overflow (2026-02-31 -> March 3), so the
    // round-trip has to reproduce the input for it to count as a real date.
    const parsed = new Date(iso[1]);
    return !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === iso[1]
      ? iso[1]
      : null;
  }
  const dotnet = DOTNET_DATE.exec(value);
  if (!dotnet) return null;
  const epoch = new Date(Number(dotnet[1]));
  return Number.isNaN(epoch.getTime())
    ? null
    : epoch.toISOString().slice(0, 10);
}

export type TermDateEntry = { date: string };

/** The term-date columns' array form; null when there is no date to record. */
export function termDateEntries(date: string | null): TermDateEntry[] | null {
  return date === null ? null : [{ date }];
}
