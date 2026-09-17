import { beforeEach, describe, expect, it, jest } from '@jest/globals';

interface StoredRow {
  rate_date: string;
  quote: string;
  rate: number;
}

const mockFetch = jest.fn<(url: URL, init: RequestInit) => Promise<Response>>();
const mockSelectRange = jest.fn<
  () => Promise<{
    data: StoredRow[] | null;
    error: { message: string } | null;
    count?: number;
  }>
>();
const mockUpsert =
  jest.fn<
    (rows: StoredRow[], options: unknown) => Promise<{ error: unknown }>
  >();
const mockGetExchangeRates =
  jest.fn<(currencies: string[]) => Promise<Record<string, number>>>();
const mockWarn = jest.fn();
const mockSelect = jest.fn<(columns: string, options: unknown) => void>();
const mockGte = jest.fn<(value: string) => void>();
const mockLte = jest.fn<(value: string) => void>();

// In-memory stand-in for the Redis series mirror.
const mockRedisStore = new Map<string, unknown>();
const mockMget = jest.fn(async (keys: string[]) =>
  keys.map((key) => mockRedisStore.get(key) ?? null),
);
const mockMset = jest.fn(
  async (
    pairs: Array<{ key: string; value: unknown }>,
    _userMetadata: unknown,
    _ttl: number,
  ) => {
    for (const pair of pairs) mockRedisStore.set(pair.key, pair.value);
    return true;
  },
);

// The range endpoint is called with a plain `fetch` so the request can be
// aborted, so that is what the provider mock replaces.
global.fetch = mockFetch as unknown as typeof fetch;

jest.mock('@/utils/supabase/service_server', () => ({
  __esModule: true,
  createClient: jest.fn(() => {
    const builder = {
      select: (columns: string, options: unknown) => {
        mockSelect(columns, options);
        return builder;
      },
      in: () => builder,
      gte: (_column: string, value: string) => {
        mockGte(value);
        return builder;
      },
      lte: (_column: string, value: string) => {
        mockLte(value);
        return builder;
      },
      order: () => builder,
      range: () => mockSelectRange(),
      upsert: (rows: StoredRow[], options: unknown) =>
        mockUpsert(rows, options),
    };
    return { from: () => builder };
  }),
}));

jest.mock('@/app/lib/redis/cache-service', () => ({
  __esModule: true,
  getCacheService: async () => ({
    redisService: { mget: mockMget, mset: mockMset },
  }),
}));

jest.mock('@/lib/v2/core/currency', () => ({
  __esModule: true,
  getExchangeRates: (currencies: string[]) => mockGetExchangeRates(currencies),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: mockWarn,
  },
}));

process.env.CURRENCY_API_KEY = 'test-key';

import {
  chunkSpan,
  crossMultiplier,
  getDailyUsdRates,
  getLatestUsdRates,
  mergeSpans,
  missingSpans,
  monthlyAverageMultipliers,
  normalizeQuotes,
  resetFxProviderBackoff,
  resetFxRateSeries,
  type DailyUsdRates,
} from '@/lib/v2/core/fxRates';
import { gzipSync } from 'node:zlib';

/** Build a `range` payload in the provider's shape from date -> code -> value. */
function rangeResponse(days: Record<string, Record<string, number>>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: Object.entries(days).map(([date, currencies]) => ({
        datetime: `${date}T23:59:59Z`,
        currencies: Object.fromEntries(
          Object.entries(currencies).map(([code, value]) => [
            code,
            { code, value },
          ]),
        ),
      })),
    }),
  } as unknown as Response;
}

/** The query the provider request carried, as a plain object. */
function rangeQuery(callIndex: number): Record<string, string> {
  const [url] = mockFetch.mock.calls[callIndex];
  return Object.fromEntries(new URL(String(url)).searchParams);
}

function dailyRates(rates: Record<string, Record<string, number>>) {
  return new Map(
    Object.entries(rates).map(([code, byDate]) => [
      code,
      new Map(Object.entries(byDate)),
    ]),
  ) as DailyUsdRates;
}

afterEach(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  resetFxProviderBackoff();
  resetFxRateSeries();
  mockRedisStore.clear();
  mockMget.mockClear();
  mockMset.mockClear();
  mockSelect.mockClear();
  mockGte.mockClear();
  mockLte.mockClear();
  mockFetch.mockReset();
  mockSelectRange.mockReset();
  mockUpsert.mockReset();
  mockGetExchangeRates.mockReset();
  mockWarn.mockReset();
  mockSelectRange.mockResolvedValue({ data: [], error: null });
  mockUpsert.mockResolvedValue({ error: null });
  mockFetch.mockResolvedValue(rangeResponse({}));
});

describe('normalizeQuotes', () => {
  it('uppercases, de-duplicates, and drops USD and blanks', () => {
    expect(normalizeQuotes(['eur', 'EUR', 'usd', '', 'gbp'])).toEqual([
      'EUR',
      'GBP',
    ]);
  });

  it('trims before uppercasing, so padded codes share one key space', () => {
    expect(normalizeQuotes([' eur ', 'EUR', ' usd '])).toEqual(['EUR']);
  });
});

describe('chunkSpan', () => {
  it('leaves a span shorter than the cap untouched', () => {
    expect(chunkSpan({ start: '2024-01-01', end: '2024-03-01' }, 366)).toEqual([
      { start: '2024-01-01', end: '2024-03-01' },
    ]);
  });

  it('splits into contiguous, non-overlapping chunks of at most maxDays', () => {
    // 2024 is a leap year: 366 days, so the cap is hit exactly on Dec 31.
    const chunks = chunkSpan({ start: '2024-01-01', end: '2025-12-31' }, 366);

    expect(chunks).toEqual([
      { start: '2024-01-01', end: '2024-12-31' },
      { start: '2025-01-01', end: '2025-12-31' },
    ]);
  });

  it('emits a final short chunk for the remainder', () => {
    const chunks = chunkSpan({ start: '2024-01-01', end: '2024-01-10' }, 4);

    expect(chunks).toEqual([
      { start: '2024-01-01', end: '2024-01-04' },
      { start: '2024-01-05', end: '2024-01-08' },
      { start: '2024-01-09', end: '2024-01-10' },
    ]);
  });

  it('handles a single-day span', () => {
    expect(chunkSpan({ start: '2024-02-29', end: '2024-02-29' }, 366)).toEqual([
      { start: '2024-02-29', end: '2024-02-29' },
    ]);
  });
});

describe('missingSpans', () => {
  it('returns the whole span when nothing is stored', () => {
    expect(missingSpans(new Set(), '2024-01-01', '2024-01-31')).toEqual([
      { start: '2024-01-01', end: '2024-01-31' },
    ]);
  });

  it('returns nothing when the stored envelope covers the span', () => {
    expect(
      missingSpans(
        new Set(['2024-01-01', '2024-01-31']),
        '2024-01-01',
        '2024-01-31',
      ),
    ).toEqual([]);
  });

  it('ignores holes inside the envelope so provider gaps are not refetched', () => {
    // 2024-01-06/07 is a weekend: absent, but already attempted.
    const stored = new Set([
      '2024-01-05',
      '2024-01-08',
      '2024-01-09',
      '2024-01-10',
    ]);

    expect(missingSpans(stored, '2024-01-05', '2024-01-10')).toEqual([]);
  });

  it('returns the leading and trailing spans around the envelope', () => {
    const stored = new Set(['2024-01-10', '2024-01-20']);

    expect(missingSpans(stored, '2024-01-01', '2024-01-31')).toEqual([
      { start: '2024-01-01', end: '2024-01-09' },
      { start: '2024-01-21', end: '2024-01-31' },
    ]);
  });

  it('returns nothing for an inverted span', () => {
    expect(missingSpans(new Set(), '2024-02-01', '2024-01-01')).toEqual([]);
  });
});

describe('mergeSpans', () => {
  it('collapses the identical spans that per-quote detection produces', () => {
    const span = { start: '2024-01-01', end: '2024-01-31' };

    expect(mergeSpans([span, { ...span }, { ...span }])).toEqual([span]);
  });

  it('merges overlapping and day-adjacent spans, keeps disjoint ones', () => {
    expect(
      mergeSpans([
        { start: '2024-03-01', end: '2024-03-31' },
        { start: '2024-01-01', end: '2024-01-20' },
        { start: '2024-01-10', end: '2024-01-31' },
        { start: '2024-02-01', end: '2024-02-05' },
      ]),
    ).toEqual([
      { start: '2024-01-01', end: '2024-02-05' },
      { start: '2024-03-01', end: '2024-03-31' },
    ]);
  });

  it('does not mutate its input', () => {
    const spans = [
      { start: '2024-01-01', end: '2024-01-10' },
      { start: '2024-01-05', end: '2024-01-31' },
    ];

    mergeSpans(spans);

    expect(spans[0].end).toBe('2024-01-10');
  });
});

describe('crossMultiplier', () => {
  const rates = { EUR: 0.5, GBP: 0.25 };

  it('is the identity for the same currency and for USD -> USD', () => {
    expect(crossMultiplier('EUR', 'eur', rates)).toBe(1);
    expect(crossMultiplier('USD', 'USD', rates)).toBe(1);
  });

  it('converts USD -> quote with the stored rate', () => {
    // 1 USD buys 0.5 EUR, so 100 USD is 50 EUR.
    expect(100 * crossMultiplier('USD', 'EUR', rates)).toBe(50);
  });

  it('converts quote -> USD with the inverse', () => {
    expect(50 * crossMultiplier('EUR', 'USD', rates)).toBe(100);
  });

  it('is symmetric: the two directions multiply back to 1', () => {
    expect(
      crossMultiplier('EUR', 'GBP', rates) *
        crossMultiplier('GBP', 'EUR', rates),
    ).toBeCloseTo(1);
  });

  it('crosses two non-USD currencies through USD', () => {
    expect(crossMultiplier('EUR', 'GBP', rates)).toBe(0.5);
  });

  it('falls back to 1 when either rate is missing', () => {
    expect(crossMultiplier('JPY', 'EUR', rates)).toBe(1);
    expect(crossMultiplier('EUR', 'JPY', rates)).toBe(1);
  });
});

describe('monthlyAverageMultipliers', () => {
  it('averages the daily cross rates, not the ratio of the averages', () => {
    // USD->EUR moves 1 -> 3 while USD->GBP stays at 1.
    const daily = dailyRates({
      EUR: { '2024-01-01': 1, '2024-01-02': 3 },
      GBP: { '2024-01-01': 1, '2024-01-02': 1 },
    });

    // avg(1/1, 1/3) = 2/3, whereas avg(GBP)/avg(EUR) would be 1/2.
    expect(
      monthlyAverageMultipliers('EUR', 'GBP', ['2024-01'], daily).get(
        '2024-01',
      ),
    ).toBeCloseTo(2 / 3);
  });

  it('is asymmetric: avg(1/x) is not 1/avg(x)', () => {
    const daily = dailyRates({
      EUR: { '2024-01-01': 1, '2024-01-02': 3 },
      GBP: { '2024-01-01': 1, '2024-01-02': 1 },
    });

    const forward = monthlyAverageMultipliers(
      'EUR',
      'GBP',
      ['2024-01'],
      daily,
    ).get('2024-01');
    const backward = monthlyAverageMultipliers(
      'GBP',
      'EUR',
      ['2024-01'],
      daily,
    ).get('2024-01');

    expect(backward).toBeCloseTo(2);
    expect(forward! * backward!).not.toBeCloseTo(1);
  });

  it('only averages days where both currencies have a rate', () => {
    const daily = dailyRates({
      EUR: { '2024-01-01': 2, '2024-01-02': 4, '2024-01-03': 10 },
      GBP: { '2024-01-01': 1, '2024-01-02': 1 },
    });

    // The 2024-01-03 EUR rate has no GBP counterpart, so it is skipped.
    expect(
      monthlyAverageMultipliers('EUR', 'GBP', ['2024-01'], daily).get(
        '2024-01',
      ),
    ).toBeCloseTo((1 / 2 + 1 / 4) / 2);
  });

  it('splits days into their own months and skips unrequested ones', () => {
    const daily = dailyRates({
      EUR: { '2024-01-31': 2, '2024-02-01': 4, '2024-03-01': 8 },
    });

    const result = monthlyAverageMultipliers(
      'USD',
      'EUR',
      ['2024-01', '2024-02'],
      daily,
    );

    expect(result.get('2024-01')).toBe(2);
    expect(result.get('2024-02')).toBe(4);
    expect(result.has('2024-03')).toBe(false);
  });

  it('omits months with no overlapping days', () => {
    const daily = dailyRates({ EUR: { '2024-01-01': 2 } });

    const result = monthlyAverageMultipliers(
      'USD',
      'EUR',
      ['2024-01', '2024-02'],
      daily,
    );

    expect(result.has('2024-02')).toBe(false);
    expect(result.size).toBe(1);
  });

  it('omits every month when the currency is unknown', () => {
    const result = monthlyAverageMultipliers(
      'USD',
      'JPY',
      ['2024-01'],
      dailyRates({ EUR: { '2024-01-01': 2 } }),
    );

    expect(result.size).toBe(0);
  });

  it('returns 1 for each month when from and to match', () => {
    const result = monthlyAverageMultipliers(
      'eur',
      'EUR',
      ['2024-01', '2024-02'],
      dailyRates({}),
    );

    expect([...result.values()]).toEqual([1, 1]);
  });
});

describe('getDailyUsdRates', () => {
  it('serves a fully stored span without calling the provider', async () => {
    mockSelectRange.mockResolvedValue({
      data: [
        { rate_date: '2024-01-01', quote: 'EUR', rate: 0.9 },
        { rate_date: '2024-01-03', quote: 'EUR', rate: 0.95 },
      ],
      error: null,
    });

    const result = await getDailyUsdRates(['eur'], '2024-01-01', '2024-01-03');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.get('EUR')?.get('2024-01-01')).toBe(0.9);
    expect(result.get('EUR')?.get('2024-01-03')).toBe(0.95);
  });

  it('pages the stored read until a short page comes back', async () => {
    // PostgREST caps a response at 1000 rows, so a wide span is read in pages.
    const day = (index: number) =>
      new Date(Date.UTC(2020, 0, 1) + index * 86400000)
        .toISOString()
        .slice(0, 10);
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        rate_date: day(from + i),
        quote: 'EUR',
        rate: 1 + (from + i) / 10000,
      }));

    mockSelectRange
      .mockResolvedValueOnce({ data: page(0, 1000), error: null, count: 1005 })
      .mockResolvedValueOnce({ data: page(1000, 5), error: null, count: 1005 });

    const result = await getDailyUsdRates(['EUR'], day(0), day(1004));

    expect(mockSelectRange).toHaveBeenCalledTimes(2);
    // Both pages land in one map, and the covered envelope needs no fetch.
    expect(result.get('EUR')?.size).toBe(1005);
    expect(result.get('EUR')?.get(day(0))).toBe(1);
    expect(result.get('EUR')?.get(day(1004))).toBeCloseTo(1.1004);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reads the pages after the first concurrently, sized by the count', async () => {
    const day = (index: number) =>
      new Date(Date.UTC(2016, 0, 1) + index * 86400000)
        .toISOString()
        .slice(0, 10);
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        rate_date: day(from + i),
        quote: 'EUR',
        rate: 1,
      }));
    let inFlight = 0;
    let maxInFlight = 0;
    const slowPage = (rows: StoredRow[]) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { data: rows, error: null, count: 2500 };
    };
    mockSelectRange
      .mockImplementationOnce(slowPage(page(0, 1000)))
      .mockImplementationOnce(slowPage(page(1000, 1000)))
      .mockImplementationOnce(slowPage(page(2000, 500)));

    const result = await getDailyUsdRates(['EUR'], day(0), day(2499));

    expect(mockSelectRange).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(2);
    expect(result.get('EUR')?.size).toBe(2500);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('stops merging at a failed page, leaving the gap for the provider', async () => {
    // A count of 2500 asks for three pages; the middle one fails.
    mockSelectRange
      .mockResolvedValueOnce({
        data: [{ rate_date: '2024-01-01', quote: 'EUR', rate: 0.9 }],
        error: null,
        count: 2500,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'read timeout' } })
      .mockResolvedValueOnce({
        data: [{ rate_date: '2024-01-05', quote: 'EUR', rate: 0.95 }],
        error: null,
        count: 2500,
      });

    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');

    expect(mockSelectRange).toHaveBeenCalledTimes(3);
    expect(result.get('EUR')?.get('2024-01-01')).toBe(0.9);
    // The last page's rows are dropped: keeping them would close the envelope
    // over a range that was never read.
    expect(result.get('EUR')?.has('2024-01-05')).toBe(false);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0]).toEqual([
      { error: { message: 'read timeout' }, codes: ['EUR'] },
      'Failed to read stored FX rates',
    ]);
    expect(rangeQuery(0)).toEqual(
      expect.objectContaining({
        datetime_start: '2024-01-02T00:00:00Z',
        datetime_end: '2024-01-05T23:59:59Z',
      }),
    );
  });

  it('sorts the quote codes, so a reversed list keys the same read', async () => {
    await getDailyUsdRates(['gbp', 'EUR'], '2024-01-01', '2024-01-02');
    // A second process with no memory and no mirror, so the provider is
    // asked again and its query can be compared.
    resetFxRateSeries();
    mockRedisStore.clear();
    await getDailyUsdRates(['EUR', 'gbp'], '2024-01-01', '2024-01-02');

    expect(rangeQuery(0).currencies).toBe('EUR,GBP');
    expect(rangeQuery(1).currencies).toBe('EUR,GBP');
  });

  it('drops USD and short-circuits when only USD is requested', async () => {
    const result = await getDailyUsdRates(['USD'], '2024-01-01', '2024-01-03');

    expect(result.size).toBe(0);
    expect(mockSelectRange).not.toHaveBeenCalled();
  });

  it('fetches, upserts, and merges the missing span', async () => {
    mockSelectRange.mockResolvedValue({ data: [], error: null });
    mockFetch.mockResolvedValue(
      rangeResponse({
        '2024-01-01': { EUR: 0.9, CHF: 0.8 },
        '2024-01-02': { EUR: 0.91, CHF: 0.81 },
      }),
    );

    const result = await getDailyUsdRates(
      ['EUR', 'CHF'],
      '2024-01-01',
      '2024-01-02',
    );

    // Both quotes are missing the same span, so it is fetched once.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain(
      'https://api.currencyapi.com/v3/range',
    );
    expect(rangeQuery(0)).toEqual({
      datetime_start: '2024-01-01T00:00:00Z',
      datetime_end: '2024-01-02T23:59:59Z',
      accuracy: 'day',
      base_currency: 'USD',
      currencies: 'CHF,EUR',
    });
    expect(mockFetch.mock.calls[0][1].headers).toEqual({ apikey: 'test-key' });
    // The client's own fetch cannot be aborted; this one carries a deadline.
    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(result.get('EUR')?.get('2024-01-02')).toBe(0.91);
    expect(result.get('CHF')?.get('2024-01-01')).toBe(0.8);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toHaveLength(4);
    expect(mockUpsert.mock.calls[0][1]).toEqual({
      onConflict: 'rate_date,quote',
    });
  });

  it('ignores currencies the provider returns but the caller did not ask for', async () => {
    mockFetch.mockResolvedValue(
      rangeResponse({ '2024-01-01': { EUR: 0.9, JPY: 150 } }),
    );

    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-01');

    expect(result.has('JPY')).toBe(false);
    expect(mockUpsert.mock.calls[0][0]).toEqual([
      { rate_date: '2024-01-01', quote: 'EUR', rate: 0.9 },
    ]);
  });

  it('only fetches the uncovered tail of a partially stored span', async () => {
    mockSelectRange.mockResolvedValue({
      data: [{ rate_date: '2024-01-01', quote: 'EUR', rate: 0.9 }],
      error: null,
    });

    await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-03');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(rangeQuery(0)).toEqual(
      expect.objectContaining({ datetime_start: '2024-01-02T00:00:00Z' }),
    );
  });

  it('does not refetch days the provider left out of its response', async () => {
    mockSelectRange.mockResolvedValue({ data: [], error: null });
    // Weekend of 2024-01-06/07 is absent from the payload.
    mockFetch.mockResolvedValue(
      rangeResponse({
        '2024-01-05': { EUR: 0.9 },
        '2024-01-08': { EUR: 0.92 },
      }),
    );

    const result = await getDailyUsdRates(['EUR'], '2024-01-05', '2024-01-08');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.get('EUR')?.size).toBe(2);
    expect(result.get('EUR')?.has('2024-01-06')).toBe(false);
  });

  it('splits a multi-year span into capped provider requests', async () => {
    await getDailyUsdRates(['EUR'], '2024-01-01', '2025-12-31');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect([rangeQuery(0), rangeQuery(1)]).toEqual([
      expect.objectContaining({
        datetime_start: '2024-01-01T00:00:00Z',
        datetime_end: '2024-12-31T23:59:59Z',
      }),
      expect.objectContaining({
        datetime_start: '2025-01-01T00:00:00Z',
        datetime_end: '2025-12-31T23:59:59Z',
      }),
    ]);
  });

  it('returns the stored rows and warns when the provider fails', async () => {
    mockSelectRange.mockResolvedValue({
      data: [{ rate_date: '2024-01-01', quote: 'EUR', rate: 0.9 }],
      error: null,
    });
    mockFetch.mockRejectedValue(new Error('provider down'));

    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');

    expect(mockWarn).toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(result.get('EUR')?.get('2024-01-01')).toBe(0.9);
    expect(result.get('EUR')?.size).toBe(1);
  });

  it('degrades to an empty result when the database read fails', async () => {
    mockSelectRange.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });
    mockFetch.mockRejectedValue(new Error('provider down'));

    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');

    expect(result.get('EUR')?.size).toBe(0);
    expect(mockWarn).toHaveBeenCalledTimes(2);
  });

  it('stops paging without throwing when the read returns a null body', async () => {
    mockSelectRange.mockResolvedValue({ data: null, error: null });

    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');

    expect(mockSelectRange).toHaveBeenCalledTimes(1);
    expect(result.get('EUR')?.size).toBe(0);
  });

  it('degrades when the provider answers with an error status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Response);

    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');

    expect(mockWarn).toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(result.get('EUR')?.size).toBe(0);
  });

  it('never asks the provider for today: a span ending today stops at yesterday', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const day = (offset: number) =>
      new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    mockSelectRange.mockResolvedValue({ data: [], error: null });
    mockFetch.mockResolvedValue(rangeResponse({}));

    await getDailyUsdRates(['EUR'], day(-2), day(0));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(rangeQuery(0).datetime_start).toBe(`${day(-2)}T00:00:00Z`);
    expect(rangeQuery(0).datetime_end).toBe(`${day(-1)}T23:59:59Z`);
  });

  it('skips the store and the provider when the span starts today', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const today = new Date().toISOString().slice(0, 10);

    const result = await getDailyUsdRates(['EUR'], today, today);

    expect(mockSelectRange).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.get('EUR')?.size).toBe(0);
  });

  it('backs off a rejected span instead of retrying it on the next read', async () => {
    mockSelectRange.mockResolvedValue({ data: [], error: null });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
    } as unknown as Response);

    await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');
    await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][0]).toMatchObject({
      err: expect.any(Error),
      codes: ['EUR'],
      spans: [{ start: '2024-01-01', end: '2024-01-05' }],
    });
  });

  it('shares one backoff key across quote orderings', async () => {
    mockSelectRange.mockResolvedValue({ data: [], error: null });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
    } as unknown as Response);

    await getDailyUsdRates(['EUR', 'GBP'], '2024-01-01', '2024-01-05');
    await getDailyUsdRates(['GBP', 'EUR'], '2024-01-01', '2024-01-05');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries a rejected span once the backoff has elapsed', async () => {
    const start = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);
    mockSelectRange.mockResolvedValue({ data: [], error: null });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
    } as unknown as Response);

    try {
      await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');
      now.mockReturnValue(start + 60 * 60 * 1000 + 1);
      await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');
    } finally {
      now.mockRestore();
    }

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('getLatestUsdRates', () => {
  it('re-inverts the quote -> USD rates into USD -> quote', async () => {
    mockGetExchangeRates.mockResolvedValue({ USD: 1, EUR: 1.25 });

    const rates = await getLatestUsdRates(['eur']);

    expect(mockGetExchangeRates).toHaveBeenCalledWith(['EUR']);
    expect(rates).toEqual({ USD: 1, EUR: 0.8 });
  });

  it('omits currencies the provider had no rate for', async () => {
    mockGetExchangeRates.mockResolvedValue({ USD: 1 });

    expect(await getLatestUsdRates(['EUR'])).toEqual({ USD: 1 });
  });

  it('never asks for every rate when only USD was requested', async () => {
    expect(await getLatestUsdRates(['USD'])).toEqual({ USD: 1 });
    expect(mockGetExchangeRates).not.toHaveBeenCalled();
  });
});

describe('getDailyUsdRates — series kept across reads', () => {
  const stored = (dates: string[], quote = 'EUR') =>
    dates.map((rate_date, index) => ({
      rate_date,
      quote,
      rate: 0.9 + index / 100,
    }));

  /** A Redis entry in the shape the module writes. */
  const redisSeries = (
    rates: Record<string, number>,
    explored: Array<{ start: string; end: string }>,
  ) => ({
    gz: gzipSync(Buffer.from(JSON.stringify(Object.entries(rates)))).toString(
      'base64',
    ),
    explored,
  });

  it('answers a repeat read of an explored span from memory', async () => {
    mockSelectRange.mockResolvedValue({
      data: stored(['2024-01-01', '2024-01-03']),
      error: null,
    });

    const first = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-03');
    mockSelectRange.mockClear();
    mockFetch.mockClear();
    const second = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-03');

    expect(mockSelectRange).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect([...second.get('EUR')!]).toEqual([...first.get('EUR')!]);
  });

  it('reads only the unexplored tail from the store when a later read widens the span', async () => {
    mockSelectRange.mockResolvedValue({
      data: stored(['2024-01-01', '2024-01-03']),
      error: null,
    });
    await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-03');
    mockSelectRange.mockResolvedValue({
      data: stored(['2024-01-04', '2024-01-05']),
      error: null,
    });
    mockGte.mockClear();
    mockLte.mockClear();

    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-05');

    expect(mockGte).toHaveBeenCalledTimes(1);
    expect(mockGte).toHaveBeenCalledWith('2024-01-04');
    expect(mockLte).toHaveBeenCalledWith('2024-01-05');
    expect(result.get('EUR')?.size).toBe(4);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns only the requested slice of a wider series', async () => {
    mockSelectRange.mockResolvedValue({
      data: stored(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04']),
      error: null,
    });
    await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-04');

    const result = await getDailyUsdRates(['EUR'], '2024-01-02', '2024-01-03');

    expect([...result.get('EUR')!.keys()]).toEqual([
      '2024-01-02',
      '2024-01-03',
    ]);
  });

  it('hydrates a quote from Redis on a cold process instead of paging the store', async () => {
    mockRedisStore.set(
      'fx:daily:v2:EUR',
      redisSeries({ '2024-01-01': 0.9, '2024-01-03': 0.95 }, [
        { start: '2024-01-01', end: '2024-01-03' },
      ]),
    );

    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-03');

    expect(mockMget).toHaveBeenCalledWith(['fx:daily:v2:EUR'], undefined);
    expect(mockSelectRange).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.get('EUR')?.get('2024-01-03')).toBe(0.95);
  });

  it('mirrors a series to Redis once a read has grown it', async () => {
    mockSelectRange.mockResolvedValue({
      data: stored(['2024-01-01', '2024-01-02']),
      error: null,
    });

    await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-02');

    expect(mockMset).toHaveBeenCalledTimes(1);
    const [pairs, , ttl] = mockMset.mock.calls[0];
    expect(pairs.map((pair) => pair.key)).toEqual(['fx:daily:v2:EUR']);
    expect(ttl).toBe(7 * 24 * 60 * 60);
    const written = pairs[0].value as { explored: unknown };
    expect(written.explored).toEqual([
      { start: '2024-01-01', end: '2024-01-02' },
    ]);
  });

  it('keeps the gap between two reads that never touched unexplored', async () => {
    mockSelectRange.mockResolvedValue({ data: [], error: null });
    mockFetch.mockResolvedValue(rangeResponse({}));
    await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-02');
    await getDailyUsdRates(['EUR'], '2020-01-01', '2020-01-02');
    const [pairs] = mockMset.mock.calls[mockMset.mock.calls.length - 1];
    expect((pairs[0].value as { explored: unknown }).explored).toEqual([
      { start: '2020-01-01', end: '2020-01-02' },
      { start: '2024-01-01', end: '2024-01-02' },
    ]);

    mockSelectRange.mockClear();
    mockFetch.mockClear();
    mockSelectRange.mockResolvedValue({
      data: stored(['2022-06-03']),
      error: null,
    });
    const result = await getDailyUsdRates(['EUR'], '2022-06-03', '2022-06-03');

    expect(mockSelectRange).toHaveBeenCalledTimes(1);
    expect(mockGte).toHaveBeenLastCalledWith('2022-06-03');
    expect(result.get('EUR')?.get('2022-06-03')).toBe(0.9);
  });

  it('asks the store for a count on the first page only', async () => {
    const day = (index: number) =>
      new Date(Date.UTC(2020, 0, 1) + index * 86400000)
        .toISOString()
        .slice(0, 10);
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        rate_date: day(from + i),
        quote: 'EUR',
        rate: 1,
      }));
    mockSelectRange
      .mockResolvedValueOnce({ data: page(0, 1000), error: null, count: 1500 })
      .mockResolvedValueOnce({ data: page(1000, 500), error: null });

    await getDailyUsdRates(['EUR'], day(0), day(1499));

    expect(mockSelect.mock.calls.map(([, options]) => options)).toEqual([
      { count: 'exact' },
      {},
    ]);
  });

  it('shares one fill between concurrent reads of the same span', async () => {
    mockSelectRange.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { data: stored(['2024-01-01']), error: null };
    });

    const [a, b] = await Promise.all([
      getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-01'),
      getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-01'),
    ]);

    expect(mockSelectRange).toHaveBeenCalledTimes(1);
    expect(a.get('EUR')?.get('2024-01-01')).toBe(0.9);
    expect(b.get('EUR')?.get('2024-01-01')).toBe(0.9);
  });

  it('does not ask the provider again for days it already answered with nothing', async () => {
    // A weekend: the store has nothing and the provider returns no rows.
    mockSelectRange.mockResolvedValue({ data: [], error: null });
    mockFetch.mockResolvedValue(rangeResponse({}));

    await getDailyUsdRates(['EUR'], '2024-01-06', '2024-01-07');
    mockFetch.mockClear();
    mockSelectRange.mockClear();
    await getDailyUsdRates(['EUR'], '2024-01-06', '2024-01-07');

    expect(mockSelectRange).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('leaves a span the provider failed on unexplored, so it is retried after the backoff', async () => {
    mockSelectRange.mockResolvedValue({ data: [], error: null });
    mockFetch.mockRejectedValue(new Error('provider down'));
    await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-02');

    resetFxProviderBackoff();
    mockFetch.mockClear();
    mockFetch.mockResolvedValue(rangeResponse({ '2024-01-01': { EUR: 0.9 } }));
    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-02');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.get('EUR')?.get('2024-01-01')).toBe(0.9);
  });

  it('keeps serving from memory when Redis is unavailable', async () => {
    mockMget.mockRejectedValueOnce(new Error('redis down'));
    mockMset.mockRejectedValueOnce(new Error('redis down'));
    mockSelectRange.mockResolvedValue({
      data: stored(['2024-01-01']),
      error: null,
    });

    const result = await getDailyUsdRates(['EUR'], '2024-01-01', '2024-01-01');

    expect(result.get('EUR')?.get('2024-01-01')).toBe(0.9);
    expect(mockWarn).toHaveBeenCalledTimes(2);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ quotes: ['EUR'] }),
      'Failed to read FX rate series',
    );
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ quotes: ['EUR'] }),
      'Failed to store FX rate series',
    );
  });
});
