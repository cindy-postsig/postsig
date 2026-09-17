import {
  isInReportWindow,
  isReportPeriod,
  resolveInvoiceWindow,
  resolveReportWindow,
  resolveRollupWindow,
} from '@/lib/v2/cost-allocation/report-window';

const noonUtc = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const JAN = { startMonth: 1 };
const APR = { startMonth: 4 };

describe('resolveReportWindow', () => {
  it('takes the whole calendar month for this month', () => {
    expect(resolveReportWindow('this-month', noonUtc('2026-08-24'))).toEqual({
      start: '2026-08-01',
      end: '2026-09-01',
    });
  });

  it('rolls this month in December into the next year', () => {
    expect(resolveReportWindow('this-month', noonUtc('2026-12-05'))).toEqual({
      start: '2026-12-01',
      end: '2027-01-01',
    });
  });

  it('rolls last month in January back a year', () => {
    expect(resolveReportWindow('last-month', noonUtc('2026-01-15'))).toEqual({
      start: '2025-12-01',
      end: '2026-01-01',
    });
  });

  it('uses calendar quarters, never fiscal ones', () => {
    expect(resolveReportWindow('this-quarter', noonUtc('2026-08-24'))).toEqual({
      start: '2026-07-01',
      end: '2026-10-01',
    });
    expect(resolveReportWindow('this-quarter', noonUtc('2026-03-31'))).toEqual({
      start: '2026-01-01',
      end: '2026-04-01',
    });
    expect(resolveReportWindow('this-quarter', noonUtc('2026-10-01'))).toEqual({
      start: '2026-10-01',
      end: '2027-01-01',
    });
  });

  it('rolls last quarter in Q1 back to the prior year Q4', () => {
    expect(resolveReportWindow('last-quarter', noonUtc('2026-02-10'))).toEqual({
      start: '2025-10-01',
      end: '2026-01-01',
    });
  });

  it('runs year to date from Jan 1 through today inclusive', () => {
    expect(resolveReportWindow('ytd', noonUtc('2026-08-24'))).toEqual({
      start: '2026-01-01',
      end: '2026-08-25',
    });
    expect(resolveReportWindow('ytd', noonUtc('2026-12-31'))).toEqual({
      start: '2026-01-01',
      end: '2027-01-01',
    });
    expect(resolveReportWindow('ytd', noonUtc('2026-01-01'))).toEqual({
      start: '2026-01-01',
      end: '2026-01-02',
    });
  });

  it('reads the day in UTC so a late-evening boundary does not shift the month', () => {
    expect(
      resolveReportWindow('this-month', new Date('2026-08-31T23:30:00.000Z')),
    ).toEqual({ start: '2026-08-01', end: '2026-09-01' });
  });
});

describe('isInReportWindow', () => {
  const window = { start: '2026-08-01', end: '2026-09-01' };

  it('includes the start and excludes the end', () => {
    expect(isInReportWindow('2026-08-01', window)).toBe(true);
    expect(isInReportWindow('2026-08-31', window)).toBe(true);
    expect(isInReportWindow('2026-09-01', window)).toBe(false);
    expect(isInReportWindow('2026-07-31', window)).toBe(false);
  });
});

describe('isReportPeriod', () => {
  it('accepts every preset both reports offer, and nothing else', () => {
    for (const period of [
      'all',
      'ytd',
      'current-fy',
      'projected-fy',
      'this-quarter',
      'last-quarter',
      'this-month',
      'last-month',
      'custom',
    ]) {
      expect(isReportPeriod(period)).toBe(true);
    }
    expect(isReportPeriod('all-time')).toBe(false);
    expect(isReportPeriod(undefined)).toBe(false);
  });
});

describe('resolveInvoiceWindow', () => {
  const TODAY = noonUtc('2026-08-24');
  const thisMonth = {
    period: 'this-month',
    window: { start: '2026-08-01', end: '2026-09-01' },
    custom: null,
  };

  it('defaults to this month when no period was chosen or the name is unknown', () => {
    for (const params of [{}, { period: 'all-time' }, { period: '' }]) {
      expect(resolveInvoiceWindow(params, TODAY, JAN)).toEqual(thisMonth);
    }
  });

  it('shares the calendar presets with the summary', () => {
    for (const period of [
      'ytd',
      'this-quarter',
      'last-quarter',
      'this-month',
      'last-month',
    ] as const) {
      expect(resolveInvoiceWindow({ period }, TODAY, JAN)).toEqual({
        period,
        window: resolveReportWindow(period, TODAY),
        custom: null,
      });
    }
  });

  it("resolves the FY presets against the org's own fiscal year", () => {
    expect(resolveInvoiceWindow({ period: 'current-fy' }, TODAY, JAN)).toEqual({
      period: 'current-fy',
      window: { start: '2026-01-01', end: '2027-01-01' },
      custom: null,
    });
    // August sits in the fiscal year that started in April.
    expect(
      resolveInvoiceWindow({ period: 'current-fy' }, TODAY, APR).window,
    ).toEqual({ start: '2026-04-01', end: '2027-04-01' });
    expect(
      resolveInvoiceWindow({ period: 'projected-fy' }, TODAY, APR).window,
    ).toEqual({ start: '2027-04-01', end: '2028-04-01' });
  });

  it('reaches every representable billing date for All Time, where the summary stays inside the engine bounds', () => {
    const { window } = resolveInvoiceWindow({ period: 'all' }, TODAY, JAN);
    expect(isInReportWindow('2024-02-01', window)).toBe(true);
    expect(isInReportWindow('1999-12-31', window)).toBe(true);
    expect(isInReportWindow('2031-06-15', window)).toBe(true);
    expect(window).not.toEqual(
      resolveRollupWindow({ period: 'all' }, TODAY, JAN).window,
    );
  });

  it('takes a custom range as typed, with the last day inside it', () => {
    expect(
      resolveInvoiceWindow(
        { period: 'custom', from: '2025-03-10', to: '2025-03-15' },
        TODAY,
        JAN,
      ),
    ).toEqual({
      period: 'custom',
      window: { start: '2025-03-10', end: '2025-03-16' },
      custom: { from: '2025-03-10', to: '2025-03-15' },
    });
  });

  it('honours a pre-2000 custom range, as its All Time lists pre-2000 billing dates', () => {
    expect(
      resolveInvoiceWindow(
        { period: 'custom', from: '1970-01-01', to: '1980-01-01' },
        TODAY,
        JAN,
      ),
    ).toEqual({
      period: 'custom',
      window: { start: '1970-01-01', end: '1980-01-02' },
      custom: { from: '1970-01-01', to: '1980-01-01' },
    });
  });

  it('takes a range running to the last representable day without falling back', () => {
    expect(
      resolveInvoiceWindow(
        { period: 'custom', from: '2025-01-01', to: '9999-12-31' },
        TODAY,
        JAN,
      ),
    ).toEqual({
      period: 'custom',
      window: { start: '2025-01-01', end: '9999-12-31' },
      custom: { from: '2025-01-01', to: '9999-12-31' },
    });
  });

  it('falls back to this month when the range is missing, malformed, or reversed', () => {
    for (const params of [
      { period: 'custom' },
      { period: 'custom', from: '2025-03-10' },
      { period: 'custom', to: '2025-03-15' },
      { period: 'custom', from: '2025-13-45', to: '2025-03-15' },
      { period: 'custom', from: '2025-02-30', to: '2025-03-15' },
      { period: 'custom', from: '10/03/2025', to: '2025-03-15' },
      { period: 'custom', from: '2025-03-15', to: '2025-03-10' },
    ]) {
      expect(resolveInvoiceWindow(params, TODAY, JAN)).toEqual(thisMonth);
    }
  });
});
