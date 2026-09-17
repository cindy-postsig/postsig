import { querySpend } from '@/lib/v2/spend';
import type { SpendQuery, SpendResult, CurrencyPolicy } from '@/lib/v2/spend';
import type { Contract } from '@/app/lib/budget/types';

// makeContract copied from spend-resolver-equivalence.test.ts rather than
// imported, so this file never depends on or mutates another test.
interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
}
interface ContractSpec {
  id?: number;
  status?: string;
  termStart: string;
  termEnd: string;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  renewalType?: string | null;
  billingFrequency?: string | null;
  annualIncrease?: number | null;
  willNotRenew?: boolean;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: 1,
    status: spec.status ?? 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: spec.annualIncrease ?? null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: spec.renewalType ?? 'Auto',
    billing_frequency: spec.billingFrequency ?? null,
    will_not_renew: spec.willNotRenew ?? false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    vendor_products_details: spec.products.map((p) => ({
      product_id: p.product_id,
      year: p.year ?? 1,
      fees: p.fees,
      vendor_products: { id: p.product_id, name: `Product ${p.product_id}` },
    })),
    vendors: { name: 'Test Vendor' },
    users: { organizations: { fiscal_year_start_month: 1 } },
  } as unknown as Contract;
}

const CURRENCY: CurrencyPolicy = { mode: 'preconverted-usd' };
const AS_OF = new Date(2026, 6, 15);

const baseQuery: Omit<SpendQuery, 'basis' | 'window'> = {
  source: 'expected',
  granularity: 'month',
  groupBy: 'total',
  currency: CURRENCY,
  fiscalConfig: { startMonth: 1 },
  asOf: AS_OF,
};

const total = (result: SpendResult): number =>
  result.items.reduce((s, item) => s + item.value, 0);

const byPeriod = (result: SpendResult): Map<string, number> =>
  new Map(result.items.map((item) => [item.period, item.value]));

const run = (contract: Contract, overrides: Partial<SpendQuery>): SpendResult =>
  querySpend([contract], { ...baseQuery, ...overrides } as SpendQuery);

// ---------------------------------------------------------------------------
// Committed basis — the new committed "golden".
//
// These values are HAND-COMPUTED and pinned by explicit expectation, NOT
// captured from the legacy oracle. The locked decision is FISCAL year-bucketing:
// each cycle fee lands entirely in the bucket for the fiscal year in which the
// cycle STARTS. This DELIBERATELY diverges from legacy distributeFeeAcrossYears,
// which buckets by the CALENDAR year of the period start. The two agree only for
// January-aligned orgs; the non-January case below is where they part.
// ---------------------------------------------------------------------------
describe('committed basis: whole cycle fee in its fiscal start-year bucket', () => {
  // Contract 3047: 36-month term, year 1/2/3 fees 51044/56044/56044, January
  // fiscal. Window stops at the recorded term end (2027-01-01, exclusive) so no
  // renewal projection is included — exactly the three recorded cycles.
  it('standardMultiYear 3047: each year fee in its start-year bucket', () => {
    const result = run(
      makeContract({
        id: 3047,
        termStart: '2024-01-01',
        termEnd: '2026-12-31',
        subscriptionTerm: 36,
        renewalPeriod: 12,
        billingFrequency: 'Quarterly',
        products: [
          { product_id: 100, year: 1, fees: 51044 },
          { product_id: 100, year: 2, fees: 56044 },
          { product_id: 100, year: 3, fees: 56044 },
        ],
      }),
      {
        basis: 'committed',
        granularity: 'year',
        window: { from: '2024-01-01', to: '2027-01-01' },
      },
    );

    expect(result.items).toEqual([
      { period: 'FY2024', groupKey: 'total', value: 51044 },
      { period: 'FY2025', groupKey: 'total', value: 56044 },
      { period: 'FY2026', groupKey: 'total', value: 56044 },
    ]);
  });

  // Super-annual (18-month) cycle, January fiscal. A non-12-multiple term
  // prices the whole cycle (decision #9 does not repeat it), so the fee lands
  // in its start year and a fiscal year with no cycle start is an intentional
  // GAP — the committed slicer never spreads a fee across the cycle it covers.
  it('super-annual cycle leaves intervening fiscal years as gaps', () => {
    const result = run(
      makeContract({
        id: 4000,
        termStart: '2024-01-01',
        termEnd: '2025-06-30',
        subscriptionTerm: 18,
        renewalPeriod: 18,
        billingFrequency: 'Annually',
        products: [{ product_id: 100, year: 1, fees: 20000 }],
      }),
      {
        basis: 'committed',
        granularity: 'year',
        window: { from: '2024-01-01', to: '2029-01-01' },
      },
    );

    // 18-month cycle starts land in FY2024, FY2025, FY2027, FY2028 (initial
    // cycle + projected renewals); FY2026 has no cycle start and is a gap.
    expect(result.items).toEqual([
      { period: 'FY2024', groupKey: 'total', value: 20000 },
      { period: 'FY2025', groupKey: 'total', value: 20000 },
      { period: 'FY2027', groupKey: 'total', value: 20000 },
      { period: 'FY2028', groupKey: 'total', value: 20000 },
    ]);
    const keys = new Set(result.items.map((i) => i.period));
    expect(keys.has('FY2026')).toBe(false);
  });

  // NON-JANUARY fiscal (April start). A cycle starting Feb 2025 belongs to the
  // fiscal year that started April 2024 — numbered FY2024 (locked: numbered by
  // the year the FY starts). Legacy calendar-year bucketing would file this under
  // 2025. This case proves the engine buckets by FISCAL year, not calendar.
  it('April-fiscal org: a Feb-2025 cycle buckets into FY2024, not FY2025', () => {
    const result = run(
      makeContract({
        id: 5000,
        termStart: '2025-02-01',
        termEnd: '2026-01-31',
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        billingFrequency: 'Annually',
        products: [{ product_id: 100, year: 1, fees: 12000 }],
      }),
      {
        basis: 'committed',
        granularity: 'year',
        window: { from: '2024-04-01', to: '2026-04-01' },
        // Stated on the QUERY — the engine never reads fiscal config off the
        // contract rows (phase 5.0.3).
        fiscalConfig: { startMonth: 4 },
      },
    );

    expect(result.items).toEqual([
      { period: 'FY2024', groupKey: 'total', value: 12000 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Invariant 1 — conservation (amortized), EXACT under daily proration.
//
// Caveat this test encodes: the daily slicer itself is exact (fee x days/span,
// no rounding), but querySpend's cross-contract aggregation rounds each bucket
// to cents (toCents). So exactness survives through querySpend only when the
// full span lands in ONE bucket (year granularity here); at month granularity
// the 12 buckets are each cent-rounded, so the sum reconciles to the fee only
// to within cent-rounding (<= half a cent per bucket).
// ---------------------------------------------------------------------------
describe('invariant 1: daily-prorated amortized conserves the segment fee', () => {
  const FEE = 50000;
  const single = makeContract({
    id: 6000,
    termStart: '2025-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 12,
    renewalType: 'One-Time',
    billingFrequency: 'Quarterly',
    products: [{ product_id: 100, year: 1, fees: FEE }],
  });
  const fullSpan = { from: '2025-01-01', to: '2026-01-01' } as const;

  it('year granularity: the single full-span bucket equals the fee exactly', () => {
    const result = run(single, {
      basis: 'amortized',
      proration: 'daily',
      granularity: 'year',
      window: fullSpan,
    });
    expect(result.items).toEqual([
      { period: 'FY2025', groupKey: 'total', value: FEE },
    ]);
  });

  it('month granularity: the daily buckets sum to the fee within cent-rounding', () => {
    const result = run(single, {
      basis: 'amortized',
      proration: 'daily',
      granularity: 'month',
      window: fullSpan,
    });
    expect(result.items).toHaveLength(12);
    // querySpend cent-rounds each of the 12 buckets: at most half a cent each.
    expect(Math.abs(total(result) - FEE)).toBeLessThanOrEqual(12 * 0.005);
  });
});

// ---------------------------------------------------------------------------
// Invariant 5 — window additivity: FY2024 + FY2025 == the 2024->2026 range,
// per period key, for amortized AND actual. January fiscal, so FY2024 spans
// 2024-01-01..2025-01-01 and FY2025 spans 2025-01-01..2026-01-01 — disjoint
// month keys that partition the range.
// ---------------------------------------------------------------------------
describe('invariant 5: window additivity across adjacent fiscal years', () => {
  const contract = makeContract({
    id: 3047,
    termStart: '2024-01-01',
    termEnd: '2026-12-31',
    subscriptionTerm: 36,
    renewalPeriod: 12,
    billingFrequency: 'Quarterly',
    products: [
      { product_id: 100, year: 1, fees: 51044 },
      { product_id: 100, year: 2, fees: 56044 },
      { product_id: 100, year: 3, fees: 56044 },
    ],
  });
  const range = { from: '2024-01-01', to: '2026-01-01' } as const;

  it.each(['amortized', 'actual'] as const)(
    '%s: summing the two FY windows equals the range per key',
    (basis) => {
      const fy2024 = run(contract, { basis, window: { fiscalYear: 2024 } });
      const fy2025 = run(contract, { basis, window: { fiscalYear: 2025 } });
      const whole = run(contract, { basis, window: range });

      const combined = new Map<string, number>();
      for (const item of [...fy2024.items, ...fy2025.items]) {
        combined.set(
          item.period,
          (combined.get(item.period) ?? 0) + item.value,
        );
      }

      expect(byPeriod(whole)).toEqual(combined);
    },
  );
});

// ---------------------------------------------------------------------------
// Invariant 3 — reconciliation.
// ---------------------------------------------------------------------------
describe('invariant 3: reconciliation across bases', () => {
  // A single 12-month cycle whose window is aligned to the whole cycle. Fee is
  // divisible by 12 and by 4 quarters so both walks are cent-exact.
  const aligned = makeContract({
    id: 6100,
    termStart: '2025-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 12,
    renewalType: 'One-Time',
    billingFrequency: 'Quarterly',
    products: [{ product_id: 100, year: 1, fees: 48000 }],
  });
  const fy2025 = { from: '2025-01-01', to: '2026-01-01' } as const;

  it('actual total == amortized total for a window aligned to whole cycles', () => {
    const actual = run(aligned, { basis: 'actual', window: fy2025 });
    const amortized = run(aligned, {
      basis: 'amortized',
      proration: 'monthly',
      window: fy2025,
    });
    expect(total(actual)).toBe(total(amortized));
    expect(total(actual)).toBe(48000);
  });

  it('committed == amortized when the cycle starts inside the window', () => {
    const committed = run(aligned, { basis: 'committed', window: fy2025 });
    const amortized = run(aligned, {
      basis: 'amortized',
      proration: 'monthly',
      window: fy2025,
    });
    expect(total(committed)).toBe(total(amortized));
  });

  // The mismatch case: an 18-month cycle that STARTED before the window (in
  // FY2024) contributes 0 committed to FY2025 — its start bucket is elsewhere —
  // while amortized still spreads a full FY2025 share. committed only joins the
  // reconciliation equality when the cycle start lies inside the window.
  it('committed is 0 for a cycle that started before the window (amortized is not)', () => {
    const superAnnual = makeContract({
      id: 4001,
      termStart: '2024-07-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 18,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [{ product_id: 100, year: 1, fees: 20000 }],
    });

    const committed = run(superAnnual, { basis: 'committed', window: fy2025 });
    const amortized = run(superAnnual, {
      basis: 'amortized',
      proration: 'monthly',
      window: fy2025,
    });

    expect(total(committed)).toBe(0);
    expect(total(amortized)).toBeGreaterThan(0);
    // 12 of the cycle's 18 months fall in FY2025 (monthly rounding).
    expect(total(amortized)).toBeCloseTo((20000 * 12) / 18, 0);
  });
});

// ---------------------------------------------------------------------------
// Quarter / year granularity — fiscal bucket keys and the four-quarter rollup.
// ---------------------------------------------------------------------------
describe('quarter / year granularity: fiscal bucket keys and rollup', () => {
  const contract = makeContract({
    id: 6200,
    termStart: '2025-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 12,
    renewalType: 'One-Time',
    billingFrequency: 'Quarterly',
    products: [{ product_id: 100, year: 1, fees: 48000 }],
  });
  const fy2025 = { from: '2025-01-01', to: '2026-01-01' } as const;

  it.each(['amortized', 'actual'] as const)(
    '%s: four fiscal quarters carry FY-prefixed keys and sum to the fiscal-year total',
    (basis) => {
      const overrides =
        basis === 'amortized'
          ? ({ basis, proration: 'monthly' } as const)
          : ({ basis } as const);

      const quarters = run(contract, {
        ...overrides,
        granularity: 'quarter',
        window: fy2025,
      });
      const years = run(contract, {
        ...overrides,
        granularity: 'year',
        window: fy2025,
      });

      expect(quarters.items.map((i) => i.period)).toEqual([
        'FY2025-Q1',
        'FY2025-Q2',
        'FY2025-Q3',
        'FY2025-Q4',
      ]);
      expect(years.items.map((i) => i.period)).toEqual(['FY2025']);
      expect(total(quarters)).toBe(total(years));
    },
  );
});
