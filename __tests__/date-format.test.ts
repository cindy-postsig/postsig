import {
  DATE_FORMAT_PATTERNS,
  isDateFormatPattern,
  resolveDateFormat,
  formatDate,
  formatDateTime,
  DATE_FORMAT_DEFAULT,
} from '@/lib/date-format';

describe('isDateFormatPattern', () => {
  it('accepts each of the nine selectable patterns', () => {
    for (const pattern of DATE_FORMAT_PATTERNS) {
      expect(isDateFormatPattern(pattern)).toBe(true);
    }
  });

  it('rejects legacy categories and junk', () => {
    expect(isDateFormatPattern('EU')).toBe(false);
    expect(isDateFormatPattern('ISO')).toBe(false);
    expect(isDateFormatPattern('US')).toBe(false);
    expect(isDateFormatPattern('not-a-pattern')).toBe(false);
    expect(isDateFormatPattern(null)).toBe(false);
    expect(isDateFormatPattern(undefined)).toBe(false);
    expect(isDateFormatPattern(42)).toBe(false);
  });
});

describe('resolveDateFormat', () => {
  it("returns the user's pattern when set (org is ignored)", () => {
    expect(resolveDateFormat('MM/dd/yyyy', 'yyyy-MM-dd')).toBe('MM/dd/yyyy');
    expect(resolveDateFormat('dd.MM.yyyy', 'yyyy/MM/dd')).toBe('dd.MM.yyyy');
  });

  it('falls back to the org pattern when the user has none', () => {
    expect(resolveDateFormat(null, 'MM/dd/yyyy')).toBe('MM/dd/yyyy');
    expect(resolveDateFormat(undefined, 'dd.MM.yyyy')).toBe('dd.MM.yyyy');
  });

  it('returns the default when neither user nor org is set', () => {
    expect(resolveDateFormat(null, null)).toBe(DATE_FORMAT_DEFAULT);
    expect(resolveDateFormat(undefined, undefined)).toBe(DATE_FORMAT_DEFAULT);
  });
});

describe('formatDate', () => {
  it('formats ISO date strings with the given pattern', () => {
    expect(formatDate('2026-12-31', 'dd/MM/yyyy')).toBe('31/12/2026');
    expect(formatDate('2026-12-31', 'MM/dd/yyyy')).toBe('12/31/2026');
    expect(formatDate('2026-12-31', 'yyyy-MM-dd')).toBe('2026-12-31');
  });

  it('formats Date objects', () => {
    expect(formatDate(new Date(2026, 11, 31), 'dd.MM.yyyy')).toBe('31.12.2026');
  });

  it('returns fallback for null/empty/invalid', () => {
    expect(formatDate(null, 'yyyy-MM-dd')).toBe('N/A');
    expect(formatDate(undefined, 'yyyy-MM-dd')).toBe('N/A');
    expect(formatDate('', 'yyyy-MM-dd')).toBe('N/A');
    expect(formatDate('not-a-date', 'yyyy-MM-dd')).toBe('N/A');
    expect(formatDate(null, 'yyyy-MM-dd', '—')).toBe('—');
  });

  it('uses the default pattern when none given', () => {
    expect(formatDate('2026-12-31')).toBe('2026-12-31');
  });
});

describe('formatDateTime', () => {
  it('orders the date part per pattern and appends the time', () => {
    const date = new Date(2026, 11, 31, 16, 32);
    const result = formatDateTime(date, 'dd/MM/yyyy');
    expect(result.startsWith('31/12/2026 | ')).toBe(true);
    expect(result).toMatch(/\| \d{1,2}:\d{2}\s?(AM|PM)/i);
  });

  it('respects month-first patterns', () => {
    const date = new Date(2026, 11, 31, 16, 32);
    expect(formatDateTime(date, 'MM/dd/yyyy').startsWith('12/31/2026 | ')).toBe(
      true,
    );
  });

  it('returns fallback for null/empty/invalid', () => {
    expect(formatDateTime(null, 'yyyy-MM-dd')).toBe('N/A');
    expect(formatDateTime('not-a-date', 'yyyy-MM-dd', '—')).toBe('—');
  });
});
