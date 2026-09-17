import {
  detectDateColumnFormat,
  excelDateToIso,
  isRealDate,
  isValidIsoDate,
  normalizeDateValue,
} from '@/lib/v2/employee-import/date-values';

describe('excelDateToIso', () => {
  // exceljs anchors date cells at UTC midnight. Jest pins TZ=UTC, which would
  // mask a local-getter bug, so the inputs are built with Date.UTC and the
  // assertions are values that would shift under any negative offset.
  it.each([
    [Date.UTC(2019, 9, 1), '2019-10-01'],
    [Date.UTC(2019, 0, 7), '2019-01-07'],
    [Date.UTC(2026, 5, 21), '2026-06-21'],
    [Date.UTC(2003, 2, 1), '2003-03-01'],
  ])('renders %i as %s', (input, expected) => {
    expect(excelDateToIso(new Date(input))).toBe(expected);
  });
});

describe('detectDateColumnFormat', () => {
  it('picks mdy when a sample has a day part above 12 in second position', () => {
    expect(detectDateColumnFormat(['3/25/2024', '1/2/2024'])).toBe('mdy');
  });

  it('picks dmy when a sample has a day part above 12 in first position', () => {
    expect(detectDateColumnFormat(['25/3/2024', '1/2/2024'])).toBe('dmy');
  });

  it('defaults to dmy when every sample is ambiguous', () => {
    expect(detectDateColumnFormat(['1/2/2024', '3/4/2024'])).toBe('dmy');
  });

  it('defaults to dmy on a tie', () => {
    expect(detectDateColumnFormat(['25/3/2024', '3/25/2024'])).toBe('dmy');
  });

  it('ignores blanks and ISO values', () => {
    expect(detectDateColumnFormat(['', '2024-03-25', '  '])).toBe('dmy');
  });
});

describe('normalizeDateValue', () => {
  it('zero-pads an ISO value', () => {
    expect(normalizeDateValue('2024-3-5', 'dmy')).toBe('2024-03-05');
  });

  it('honours the detected column format for ambiguous values', () => {
    expect(normalizeDateValue('1/2/2024', 'dmy')).toBe('2024-02-01');
    expect(normalizeDateValue('1/2/2024', 'mdy')).toBe('2024-01-02');
  });

  it('uses an unambiguous part regardless of the column format', () => {
    expect(normalizeDateValue('25/3/2024', 'mdy')).toBe('2024-03-25');
  });

  it('pivots two-digit years at 50', () => {
    expect(normalizeDateValue('1/2/49', 'dmy')).toBe('2049-02-01');
    expect(normalizeDateValue('1/2/50', 'dmy')).toBe('1950-02-01');
  });

  it('accepts dot and dash separators', () => {
    expect(normalizeDateValue('25.3.2024', 'dmy')).toBe('2024-03-25');
    expect(normalizeDateValue('25-3-2024', 'dmy')).toBe('2024-03-25');
  });

  // A 1..31 range check is not enough: these normalize to a well-formed
  // YYYY-MM-DD that Postgres then rejects at insert time.
  it.each(['31/02/2024', '29/02/2023', '31/04/2024', '30/02/2024'])(
    'leaves the impossible date %p unconverted',
    (input) => {
      expect(normalizeDateValue(input, 'dmy')).toBe(input);
    },
  );

  it('still converts a real leap day', () => {
    expect(normalizeDateValue('29/02/2024', 'dmy')).toBe('2024-02-29');
  });

  it('rejects an impossible date written in ISO form', () => {
    expect(normalizeDateValue('2024-02-31', 'dmy')).toBe('2024-02-31');
    expect(isValidIsoDate('2024-02-31')).toBe(false);
  });

  it('returns the raw value when it cannot be parsed', () => {
    expect(normalizeDateValue('25/13/2024', 'dmy')).toBe('25/13/2024');
    expect(normalizeDateValue('not a date', 'dmy')).toBe('not a date');
  });

  it('returns empty for blank input', () => {
    expect(normalizeDateValue('   ', 'dmy')).toBe('');
  });
});

describe('isRealDate', () => {
  it.each([
    [2024, 2, 29, true],
    [2023, 2, 29, false],
    [2000, 2, 29, true],
    [1900, 2, 29, false],
    [2024, 4, 31, false],
    [2024, 12, 31, true],
    [2024, 13, 1, false],
    [2024, 0, 1, false],
    [2024, 1, 0, false],
  ])('%i-%i-%i is %p', (year, month, day, expected) => {
    expect(isRealDate(year, month, day)).toBe(expected);
  });
});

describe('isValidIsoDate', () => {
  it('accepts an empty value, since the field is optional', () => {
    expect(isValidIsoDate('')).toBe(true);
  });

  it.each(['2024-02-29', '2024-12-31'])('accepts %p', (v) => {
    expect(isValidIsoDate(v)).toBe(true);
  });

  it.each(['2023-02-29', '2024-2-9', '31/02/2024', 'nope'])(
    'rejects %p',
    (v) => {
      expect(isValidIsoDate(v)).toBe(false);
    },
  );
});
