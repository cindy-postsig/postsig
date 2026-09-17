import type { SpendGranularity, FiscalConfig } from './types';

export type { FiscalConfig };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// The fiscal year a date belongs to, numbered by the year the FY STARTS
// (locked product decision; matches getYear(currentFiscalYearStart)).
export function fiscalYearOf(date: Date, fiscalConfig: FiscalConfig): number {
  const startMonth0 = fiscalConfig.startMonth - 1;
  return date.getUTCMonth() >= startMonth0
    ? date.getUTCFullYear()
    : date.getUTCFullYear() - 1;
}

// The single bucketing choke point. Month keys are CALENDAR months ('YYYY-MM',
// matching the legacy chart keys); quarter and year keys are FISCAL and always
// carry the 'FY' prefix so a fiscal quarter (e.g. one starting Oct 2025) can
// never collide with a same-numbered calendar quarter. All UTC.
export function bucketKey(
  date: Date,
  granularity: SpendGranularity,
  fiscalConfig: FiscalConfig,
): string {
  if (granularity === 'month') {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
  }

  const fyNum = fiscalYearOf(date, fiscalConfig);
  if (granularity === 'year') return `FY${fyNum}`;

  const startMonth0 = fiscalConfig.startMonth - 1;
  const monthsSinceFYStart = (date.getUTCMonth() - startMonth0 + 12) % 12;
  const quarter = Math.floor(monthsSinceFYStart / 3) + 1;
  return `FY${fyNum}-Q${quarter}`;
}

// Every bucket key a half-open [start, end) window can produce, in order —
// the zero-fill axis delivery surfaces hand to clients so they never re-derive
// fiscal math. Walks calendar months and dedupes (quarter/year keys repeat
// across their months).
export function enumeratePeriods(
  start: Date,
  end: Date,
  granularity: SpendGranularity,
  fiscalConfig: FiscalConfig,
): string[] {
  const periods: string[] = [];
  let cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  while (cursor < end) {
    const key = bucketKey(cursor, granularity, fiscalConfig);
    if (periods[periods.length - 1] !== key) periods.push(key);
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }
  return periods;
}
