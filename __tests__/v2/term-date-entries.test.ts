import { readTermDateEntries } from '@/lib/v2/spend/contractInput';
import { buildSpendRateProvider } from '@/lib/v2/core/spendRates';

// The provider fetches FX before it returns; only its walk over the term dates
// is under test here, so the rate source is stubbed rather than reached.
jest.mock('@/lib/v2/core/fxRates', () => {
  const actual = jest.requireActual('@/lib/v2/core/fxRates');
  return {
    ...actual,
    // DailyUsdRates is a Map of Maps; Record<string, number> for the latest.
    getDailyUsdRates: jest.fn().mockResolvedValue(new Map()),
    getLatestUsdRates: jest.fn().mockResolvedValue({ USD: 1, GBP: 0.79 }),
  };
});

/**
 * `contracts.term_start_date` / `term_end_date` are jsonb, so the column can
 * hold whatever a writer put there. The invoice sync wrote bare `{ start }` /
 * `{ end }` objects for a while, and because an object is truthy a `?? []`
 * guard sailed straight past it — `for (const entry of ...)` then threw
 * "object is not iterable" and took the whole budget page down.
 *
 * The writer is fixed and the rows repaired, but this guard is what stops any
 * future writer doing the same, so it is tested against the shapes that broke.
 */
describe('readTermDateEntries', () => {
  it('reads a well-formed array', () => {
    expect(readTermDateEntries([{ date: '2026-01-01' }])).toEqual([
      { date: '2026-01-01' },
    ]);
  });

  // The exact values that crashed the budget page.
  it.each([
    [{ start: '2026-01-01' }],
    [{ end: '2026-01-31' }],
    [{}],
    [null],
    [undefined],
    ['2026-01-01'],
    [42],
  ])('yields an empty list for %p rather than throwing', (value) => {
    expect(() => readTermDateEntries(value)).not.toThrow();
    expect(readTermDateEntries(value)).toEqual([]);
  });

  // The array itself can hold anything too. A null entry reaches `d.date` in
  // latestRecordedTermEnd and a numeric date reaches `.slice` in
  // earliestTermStart; both throw there, so they are dropped here.
  it.each<[unknown[], string]>([
    [[null], 'a null entry'],
    [[undefined], 'an undefined entry'],
    [[{ date: 42 }], 'a numeric date'],
    [[{ date: {} }], 'an object date'],
    [['2026-01-01'], 'a bare string entry'],
  ])('drops %p (%s)', (value) => {
    expect(readTermDateEntries(value)).toEqual([]);
  });

  it('keeps the good entries and drops the bad ones alongside them', () => {
    expect(
      readTermDateEntries([null, { date: '2026-01-01' }, { date: 42 }]),
    ).toEqual([{ date: '2026-01-01' }]);
  });

  it('keeps an entry whose date is absent, which readers already handle', () => {
    expect(readTermDateEntries([{ updated_at: 'x' }])).toEqual([
      { updated_at: 'x' },
    ]);
  });

  it('is iterable for every input, which is what the readers rely on', () => {
    const bad: unknown = { start: '2026-01-01' };
    expect(() => {
      for (const _entry of readTermDateEntries(bad)) {
        // reaching here at all would mean the guard let the object through
      }
    }).not.toThrow();
  });
});

/**
 * The crash itself: buildSpendRateProvider walks every contract's
 * term_start_date to decide how far back to fetch FX. One malformed row was
 * enough to throw before the budget page had rendered a thing.
 */
describe('buildSpendRateProvider against a malformed term_start_date', () => {
  const run = (termStartDate: unknown) =>
    buildSpendRateProvider({
      contracts: [{ currency: 'GBP', term_start_date: termStartDate } as never],
      target: 'USD',
      asOf: new Date('2026-08-25T00:00:00.000Z'),
      span: {
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2026-12-31T00:00:00.000Z'),
      },
    });

  it('survives the object shape the sync used to write', async () => {
    await expect(run({ start: '2026-01-01' })).resolves.toBeDefined();
  });

  it('survives an array holding a null entry', async () => {
    await expect(run([null])).resolves.toBeDefined();
  });

  it('survives a numeric date', async () => {
    await expect(run([{ date: 42 }])).resolves.toBeDefined();
  });

  it('still survives a null', async () => {
    await expect(run(null)).resolves.toBeDefined();
  });

  it('still reads a well-formed array', async () => {
    await expect(run([{ date: '2026-01-01' }])).resolves.toBeDefined();
  });
});
