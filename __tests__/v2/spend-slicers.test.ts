import {
  sliceCommitted,
  sliceAmortized,
  resolveWindow,
  bucketKey,
  type FiscalConfig,
} from '@/lib/v2/spend/slicers';
import type { FeeSegment } from '@/lib/v2/spend';

const JANUARY: FiscalConfig = { startMonth: 1 };
// A non-January org whose FY starts in October, used to prove fiscal buckets
// never collide with calendar buckets.
const OCTOBER: FiscalConfig = { startMonth: 10 };
const USD = 'usd';

function segment(over: Partial<FeeSegment>): FeeSegment {
  return {
    productId: 100,
    from: '2026-01-01',
    to: '2027-01-01',
    fee: 1000,
    currency: USD,
    source: 'year-entry',
    confidence: 'explicit',
    ...over,
  };
}

// -----------------------------------------------------------------------------
// (a) committed — distributeFeeAcrossYears semantics, generalized to fiscal
// -----------------------------------------------------------------------------
describe('sliceCommitted: full cycle fee in the single bucket where the cycle starts', () => {
  const window = resolveWindow(
    { from: '2024-01-01', to: '2031-01-01' },
    new Date(),
    JANUARY,
  );

  it('buckets the whole fee in the fiscal year the cycle starts (nonZero fixture)', () => {
    const items = sliceCommitted(
      [segment({ from: '2026-01-01', to: '2027-01-01', fee: 184500 })],
      window,
      'year',
      JANUARY,
    );
    expect(items).toEqual([
      { period: 'FY2026', groupKey: 'total', value: 184500 },
    ]);
  });

  it('a zero-fee cycle contributes nothing (zeroFee fixture)', () => {
    const items = sliceCommitted(
      [segment({ from: '2026-01-01', to: '2027-01-01', fee: 0 })],
      window,
      'year',
      JANUARY,
    );
    expect(items).toEqual([]);
  });

  it('a super-annual cycle lands entirely in its start year, leaving gap years (superAnnual fixture)', () => {
    // A ~17.5-month cycle starting mid-2025: the whole fee sits in FY2025 and
    // FY2026 stays an intentional gap.
    const items = sliceCommitted(
      [segment({ from: '2025-06-01', to: '2026-11-15', fee: 50000 })],
      window,
      'year',
      JANUARY,
    );
    expect(items).toEqual([
      { period: 'FY2025', groupKey: 'total', value: 50000 },
    ]);
    expect(items.map((i) => i.period)).not.toContain('FY2026');
  });

  it('sums cycles that start in the same bucket and excludes cycles starting outside the window', () => {
    const items = sliceCommitted(
      [
        segment({ from: '2026-01-01', to: '2027-01-01', fee: 100 }),
        segment({
          productId: 200,
          from: '2026-06-01',
          to: '2027-06-01',
          fee: 250,
        }),
        // Starts before the window — excluded.
        segment({ from: '2023-01-01', to: '2024-01-01', fee: 999 }),
      ],
      resolveWindow(
        { from: '2026-01-01', to: '2027-01-01' },
        new Date(),
        JANUARY,
      ),
      'year',
      JANUARY,
    );
    expect(items).toEqual([
      { period: 'FY2026', groupKey: 'total', value: 350 },
    ]);
  });
});

// -----------------------------------------------------------------------------
// (b) daily proration — exact conservation (invariant 1)
// -----------------------------------------------------------------------------
describe('sliceAmortized daily proration: conservation is exact over a segment span', () => {
  it('daily buckets over the exact span sum to the segment fee EXACTLY', () => {
    // 2026 is 365 days; a fee that is an exact multiple of the span keeps every
    // per-bucket value an exact integer, so the summed reconstruction is bit-
    // exact — demonstrating the invariant, not merely approximating it.
    const spanDays = 365;
    const fee = spanDays * 1000;
    const seg = segment({ from: '2026-01-01', to: '2027-01-01', fee });
    const window = resolveWindow({ fiscalYear: 2026 }, new Date(), JANUARY);

    const items = sliceAmortized([seg], window, 'month', 'daily', JANUARY);

    expect(items).toHaveLength(12);
    const total = items.reduce((sum, item) => sum + item.value, 0);
    expect(total).toBe(fee);
    // January has 31 of 365 days.
    expect(items[0]).toEqual({
      period: '2026-01',
      groupKey: 'total',
      value: 31000,
    });
  });

  it('daily differs from monthly: partial months carry their real day weight', () => {
    // A half-open span 2026-01-15 -> 2026-03-15 (59 days). Under daily, January
    // gets 17/59 of the fee; monthly would give a flat fee/spanMonths instead.
    const seg = segment({ from: '2026-01-15', to: '2026-03-15', fee: 5900 });
    const window = resolveWindow({ fiscalYear: 2026 }, new Date(), JANUARY);

    const daily = sliceAmortized([seg], window, 'month', 'daily', JANUARY);
    const monthly = sliceAmortized([seg], window, 'month', 'monthly', JANUARY);

    const janDaily = daily.find((i) => i.period === '2026-01')?.value;
    expect(janDaily).toBeCloseTo((5900 * 17) / 59, 6);

    const dailyTotal = daily.reduce((s, i) => s + i.value, 0);
    expect(dailyTotal).toBeCloseTo(5900, 6);

    // Monthly is a flat month-granular convention, so its January share differs.
    const janMonthly = monthly.find((i) => i.period === '2026-01')?.value;
    expect(janMonthly).not.toBeCloseTo(janDaily as number, 2);
  });
});

// -----------------------------------------------------------------------------
// (c) fiscal quarter / year bucket keys never collide with calendar buckets
// -----------------------------------------------------------------------------
describe('bucketKey: fiscal quarter/year keys for a non-January org', () => {
  const oct2025 = new Date(Date.UTC(2025, 9, 1));
  const jan2025 = new Date(Date.UTC(2025, 0, 1));

  it('a fiscal quarter starting Oct 2025 is FY2025-Q1', () => {
    expect(bucketKey(oct2025, 'quarter', OCTOBER)).toBe('FY2025-Q1');
    expect(bucketKey(oct2025, 'year', OCTOBER)).toBe('FY2025');
  });

  it('calendar Jan 2025 resolves to a DIFFERENT fiscal bucket (no collision)', () => {
    // Jan 2025 sits in the FY that started Oct 2024, quarter 2 — so its key is
    // FY2024-Q2, which cannot be confused with FY2025-Q1 or a calendar 2025-Q1.
    expect(bucketKey(jan2025, 'quarter', OCTOBER)).toBe('FY2024-Q2');
    expect(bucketKey(oct2025, 'quarter', OCTOBER)).not.toBe(
      bucketKey(jan2025, 'quarter', OCTOBER),
    );
  });

  it('the FY prefix keeps a fiscal Q1 distinct from a calendar Q1 of the same number', () => {
    // Under a January config Q1 covers Jan-Mar 2025; the key carries FY so it is
    // 'FY2025-Q1', never a bare calendar '2025-Q1'.
    expect(bucketKey(jan2025, 'quarter', JANUARY)).toBe('FY2025-Q1');
    expect(bucketKey(jan2025, 'quarter', JANUARY)).not.toBe('2025-Q1');
  });
});
