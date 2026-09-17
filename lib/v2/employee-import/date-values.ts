export type DateFormat = 'dmy' | 'mdy';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * A day-of-month check, not just a 1..31 range check. Without it 31/02/2024
 * normalizes to "2024-02-31", which satisfies the YYYY-MM-DD validity regex the
 * preview uses and is only rejected later by Postgres — so the row is reported
 * as importable and then fails at insert.
 */
export function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const max = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day <= max;
}

/**
 * exceljs anchors date cells at UTC midnight (`excelToDate` builds them from
 * `Date.UTC`), so the calendar date must be read back with UTC getters. Local
 * getters shift the date back a day in any negative-offset timezone.
 */
export function excelDateToIso(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Pick DMY vs MDY for a column by looking at unambiguous samples
// (a value where one part is > 12). If samples conflict or are all
// ambiguous, default to DMY since native ISO inputs are already
// passed through unchanged below.
export function detectDateColumnFormat(values: string[]): DateFormat {
  let dmyClues = 0;
  let mdyClues = 0;
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.]\d{2,4}$/.exec(v);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a > 12 && b <= 12) dmyClues += 1;
    else if (b > 12 && a <= 12) mdyClues += 1;
  }
  return mdyClues > dmyClues ? 'mdy' : 'dmy';
}

export function normalizeDateValue(raw: string, fmt: DateFormat): string {
  const v = raw.trim();
  if (!v) return '';

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (iso) {
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    if (!isRealDate(parseInt(iso[1], 10), month, day)) return v;
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(v);
  if (!m) return v;

  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  let year = m[3];
  if (year.length === 2) {
    year = (parseInt(year, 10) >= 50 ? '19' : '20') + year;
  }

  let day: number;
  let month: number;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    day = b;
    month = a;
  } else if (fmt === 'mdy') {
    day = b;
    month = a;
  } else {
    day = a;
    month = b;
  }

  if (!isRealDate(parseInt(year, 10), month, day)) return v;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** True for '' or a real YYYY-MM-DD calendar date. */
export function isValidIsoDate(value: string): boolean {
  if (value === '') return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  return isRealDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
}
