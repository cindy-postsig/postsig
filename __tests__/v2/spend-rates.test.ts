/**
 * buildSpendRateProvider — the prefetch that lets the (synchronous) spend
 * engine look FX rates up instead of fetching them.
 *
 * The behaviours pinned here are the ones a wrong answer hides behind: an
 * all-base-currency org must issue ZERO rate requests, a term starting on a
 * day the provider skipped must convert at the last quoted day rather than
 * 1:1, and anything the stored range cannot answer (future dates, the current
 * month) must fall through to today's cross rate.
 */
import { jest } from '@jest/globals';

const mockGetDailyUsdRates =
  jest.fn<
    (
      quotes: string[],
      from: string,
      to: string,
    ) => Promise<Map<string, Map<string, number>>>
  >();
const mockGetLatestUsdRates =
  jest.fn<(quotes: string[]) => Promise<Record<string, number>>>();

jest.mock('@/lib/v2/core/fxRates', () => {
  const actual = jest.requireActual<typeof import('@/lib/v2/core/fxRates')>(
    '@/lib/v2/core/fxRates',
  );
  return {
    __esModule: true,
    ...actual,
    getDailyUsdRates: (quotes: string[], from: string, to: string) =>
      mockGetDailyUsdRates(quotes, from, to),
    getLatestUsdRates: (quotes: string[]) => mockGetLatestUsdRates(quotes),
  };
});

import { buildSpendRateProvider } from '@/lib/v2/core/spendRates';

const ASOF = new Date('2026-07-15T00:00:00Z');
const SPAN = {
  start: new Date('2026-01-01T00:00:00Z'),
  end: new Date('2027-01-01T00:00:00Z'),
};

function contract(currency: string, termStart?: string) {
  return {
    currency,
    term_start_date: termStart ? [{ date: termStart }] : null,
  };
}

/** EUR per 1 USD on the given days — the orientation fxRates stores. */
function daily(entries: Record<string, number>) {
  return new Map([['EUR', new Map(Object.entries(entries))]]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDailyUsdRates.mockResolvedValue(new Map());
  mockGetLatestUsdRates.mockResolvedValue({ USD: 1 });
});

describe('identity fast path', () => {
  it('fetches nothing when every contract is already in the target', async () => {
    const rates = await buildSpendRateProvider({
      contracts: [contract('eur', '2024-01-01'), contract('EUR')],
      target: 'EUR',
      asOf: ASOF,
      span: SPAN,
    });

    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
    expect(rates.dateRate('EUR', '2024-01-01')).toBe(1);
    expect(rates.monthRate('EUR', '2026-03')).toBe(1);
  });

  it('still fetches nothing when the daily range is bounded to the span', async () => {
    await buildSpendRateProvider({
      contracts: [contract('eur', '2000-01-01')],
      target: 'EUR',
      asOf: ASOF,
      span: SPAN,
      dailyRange: 'span',
    });

    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
  });

  it('treats a missing currency as USD, so an all-USD set on USD fetches nothing', async () => {
    await buildSpendRateProvider({
      contracts: [contract(''), { currency: null, term_start_date: null }],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
  });
});

describe('daily range', () => {
  it('reaches back to the earliest term start, not just the window', async () => {
    await buildSpendRateProvider({
      contracts: [contract('EUR', '2019-05-04'), contract('USD', '2026-02-01')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    expect(mockGetDailyUsdRates).toHaveBeenCalledWith(
      ['EUR', 'USD', 'USD'],
      '2019-05-04',
      '2026-07-15',
    );
  });

  it('skips a contract whose term_start_date is not an array instead of throwing', async () => {
    await buildSpendRateProvider({
      contracts: [
        contract('EUR', '2019-05-04'),
        {
          currency: 'USD',
          term_start_date: {
            start: '/Date(1780531200000+0000)/',
          } as unknown as null,
        },
      ],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    expect(mockGetDailyUsdRates).toHaveBeenCalledWith(
      ['EUR', 'USD', 'USD'],
      '2019-05-04',
      '2026-07-15',
    );
  });

  // Only term-start conversion (committed spend, renewals / tcv / commitments)
  // looks a rate up by date, so a caller running a flow basis pays for the
  // window and nothing earlier — decades of daily rows for a seat dated 2000.
  it("reaches back to the earliest term start under 'term-starts'", async () => {
    await buildSpendRateProvider({
      contracts: [contract('EUR', '2000-01-01')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
      dailyRange: 'term-starts',
    });

    expect(mockGetDailyUsdRates.mock.calls[0][1]).toBe('2000-01-01');
  });

  it("starts at the span under 'span', however old the term start is", async () => {
    await buildSpendRateProvider({
      contracts: [contract('EUR', '2000-01-01')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
      dailyRange: 'span',
    });

    expect(mockGetDailyUsdRates).toHaveBeenCalledWith(
      ['EUR', 'USD'],
      '2026-01-01',
      '2026-07-15',
    );
  });

  it('clamps a sentinel window start to the earliest fetchable date', async () => {
    await buildSpendRateProvider({
      contracts: [contract('EUR', '1971-01-01')],
      target: 'USD',
      asOf: ASOF,
      span: { start: new Date('1970-01-01T00:00:00Z'), end: SPAN.end },
    });

    expect(mockGetDailyUsdRates.mock.calls[0][1]).toBe('2000-01-01');
  });
});

describe('dateRate', () => {
  it('uses the stored rate for that exact day', async () => {
    mockGetDailyUsdRates.mockResolvedValue(daily({ '2026-03-02': 0.8 }));

    const rates = await buildSpendRateProvider({
      contracts: [contract('EUR', '2026-03-02')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    // 0.8 EUR per USD => 1 EUR buys 1.25 USD.
    expect(rates.dateRate('EUR', '2026-03-02')).toBeCloseTo(1.25);
  });

  it('falls back to the nearest PRIOR stored day for an unquoted date', async () => {
    // Friday quoted, weekend absent — a Sunday term start must not convert 1:1.
    mockGetDailyUsdRates.mockResolvedValue(daily({ '2026-03-06': 0.8 }));

    const rates = await buildSpendRateProvider({
      contracts: [contract('EUR', '2026-03-06')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    expect(rates.dateRate('EUR', '2026-03-08')).toBeCloseTo(1.25);
  });

  it('gives up on a gap wider than a week and uses the latest cross rate', async () => {
    mockGetDailyUsdRates.mockResolvedValue(daily({ '2026-03-06': 0.8 }));
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.5 });

    const rates = await buildSpendRateProvider({
      contracts: [contract('EUR', '2026-03-06')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    expect(rates.dateRate('EUR', '2026-03-20')).toBeCloseTo(2);
  });

  it('prices a future term start at the latest rate', async () => {
    mockGetDailyUsdRates.mockResolvedValue(daily({ '2026-07-14': 0.8 }));
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.5 });

    const rates = await buildSpendRateProvider({
      contracts: [contract('EUR', '2026-01-01')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    expect(rates.dateRate('EUR', '2029-04-01')).toBeCloseTo(2);
  });

  it('converts 1:1 for a currency nothing ever quoted', async () => {
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1 });

    const rates = await buildSpendRateProvider({
      contracts: [contract('EUR', '2026-01-01'), contract('XYZ')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    expect(rates.dateRate('XYZ', '2026-01-01')).toBe(1);
  });
});

describe('monthRate', () => {
  it('averages the daily cross rates over the month', async () => {
    mockGetDailyUsdRates.mockResolvedValue(
      daily({ '2026-03-02': 0.8, '2026-03-03': 0.5 }),
    );

    const rates = await buildSpendRateProvider({
      contracts: [contract('EUR', '2026-01-01')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    // avg(1/0.8, 1/0.5) — the ratio a spender experienced, not a ratio of averages.
    expect(rates.monthRate('EUR', '2026-03')).toBeCloseTo((1.25 + 2) / 2);
  });

  it('falls back to the latest cross rate for a month with no quoted day', async () => {
    mockGetDailyUsdRates.mockResolvedValue(daily({ '2026-03-02': 0.8 }));
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.4 });

    const rates = await buildSpendRateProvider({
      contracts: [contract('EUR', '2026-01-01')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    // Inside the span but unquoted, and outside it entirely — same answer.
    expect(rates.monthRate('EUR', '2026-09')).toBeCloseTo(2.5);
    expect(rates.monthRate('EUR', '2031-01')).toBeCloseTo(2.5);
  });

  it('averages the same days whichever daily range was fetched', async () => {
    mockGetDailyUsdRates.mockResolvedValue(
      daily({ '2026-03-02': 0.8, '2026-03-03': 0.5 }),
    );
    const contracts = [contract('EUR', '2000-01-01')];

    const reachBack = await buildSpendRateProvider({
      contracts,
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
      dailyRange: 'term-starts',
    });
    const spanOnly = await buildSpendRateProvider({
      contracts,
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
      dailyRange: 'span',
    });

    for (const month of ['2026-01', '2026-03', '2026-12']) {
      expect(spanOnly.monthRate('EUR', month)).toBe(
        reachBack.monthRate('EUR', month),
      );
    }
    expect(spanOnly.monthRate('EUR', '2026-03')).toBeCloseTo((1.25 + 2) / 2);
  });

  it('returns 1 for an amount already in the target', async () => {
    const rates = await buildSpendRateProvider({
      contracts: [contract('EUR', '2026-01-01'), contract('USD')],
      target: 'USD',
      asOf: ASOF,
      span: SPAN,
    });

    expect(rates.monthRate('usd', '2026-03')).toBe(1);
  });
});
