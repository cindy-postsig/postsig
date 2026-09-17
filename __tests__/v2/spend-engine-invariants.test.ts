import { querySpend } from '@/lib/v2/spend';
import type { CurrencyPolicy, SpendQuery } from '@/lib/v2/spend';
import type { Contract } from '@/app/lib/budget/types';

// Engine-side versions of design invariants 2 (conservation: actual) and 6
// (determinism). spend-invariants.test.ts and asOf-determinism.test.ts pin the
// LEGACY pipeline; these run the same properties through querySpend so a
// regression inside lib/v2/spend/ — including a stray new Date() — fails here.

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
}
interface ContractSpec {
  id?: number;
  termStart: string;
  termEnd: string;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  renewalType?: string | null;
  billingFrequency?: string | null;
  annualIncrease?: number | null;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: spec.annualIncrease ?? null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: spec.renewalType ?? 'Auto',
    billing_frequency: spec.billingFrequency ?? null,
    will_not_renew: false,
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

const USD: CurrencyPolicy = { mode: 'preconverted-usd' };

function total(items: Array<{ value: number }>): number {
  return items.reduce((sum, item) => sum + item.value, 0);
}

// Stamp a hand-edited fee onto every product, the shape hasFeeOverrides looks
// for. Contract's type omits the versions relation, but the DB row carries it.
function withFeeOverride(contract: Contract): Contract {
  const details = (
    contract as unknown as {
      vendor_products_details: Array<Record<string, unknown>>;
    }
  ).vendor_products_details;
  return {
    ...contract,
    vendor_products_details: details.map((vpd) => ({
      ...vpd,
      vendor_products_details_versions: [{ changed_data: { fees: 9999 } }],
    })),
  } as unknown as Contract;
}

// The resolver derives fee-override suppression from the contract itself
// rather than trusting a caller-supplied flag: every call site computed the
// same value, and one that forgot silently compounded annual_increase over
// fees a human had already set.
describe('annual_increase suppression is derived, not passed in', () => {
  const spec = {
    termStart: '2025-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 12,
    annualIncrease: 10,
    products: [{ product_id: 100, fees: 12000 }],
  };
  const window = { from: '2026-01-01', to: '2027-01-01' };

  const renewalTotal = (contract: Contract) =>
    total(
      querySpend([contract], {
        basis: 'actual',
        source: 'expected',
        window,
        granularity: 'month',
        groupBy: 'total',
        currency: USD,
        fiscalConfig: { startMonth: 1 },
        asOf: new Date(Date.UTC(2025, 6, 1)),
      }).items,
    );

  it('compounds the increase when no fee was hand-edited', () => {
    expect(renewalTotal(makeContract(spec))).toBeCloseTo(13200, 6);
  });

  it('suppresses the increase when the contract carries a fee override', () => {
    expect(renewalTotal(withFeeOverride(makeContract(spec)))).toBeCloseTo(
      12000,
      6,
    );
  });
});

describe('invariant 2 (engine): billing events within a cycle sum to the cycle fee', () => {
  const cycle = {
    termStart: '2025-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 12,
    renewalType: 'One-Time',
    products: [{ product_id: 100, fees: 12000 }],
  };
  const wholeCycle = { from: '2025-01-01', to: '2026-01-01' };

  it.each([
    ['Monthly', 12],
    ['Quarterly', 4],
    ['Bi-Annually', 2],
    ['Annually', 1],
  ])('%s billing: %i events, exact conservation', (frequency, eventCount) => {
    const result = querySpend(
      [makeContract({ ...cycle, billingFrequency: frequency })],
      {
        basis: 'actual',
        source: 'expected',
        window: wholeCycle,
        granularity: 'month',
        groupBy: 'total',
        currency: USD,
        fiscalConfig: { startMonth: 1 },
        asOf: new Date(Date.UTC(2025, 6, 1)),
      },
    );
    const events = result.items.filter((i) => i.value > 0);
    expect(events).toHaveLength(eventCount);
    expect(total(result.items)).toBe(12000);
  });

  // A segment SHORTER than its billing interval — the mid-cycle amendment
  // truncation shape phase 4 introduced. Each bill's coverage caps at the
  // segment end, so the events still sum to the (scaled) segment fee instead
  // of over-billing a full interval.
  it.each([
    ['Annually', 1],
    ['Quarterly', 2],
  ])(
    'sub-interval segment, %s billing: conserves the truncated fee',
    (frequency, eventCount) => {
      const result = querySpend(
        [
          makeContract({
            termStart: '2025-01-01',
            termEnd: '2025-05-31',
            subscriptionTerm: 5,
            renewalType: 'One-Time',
            billingFrequency: frequency,
            products: [{ product_id: 100, fees: 5000 }],
          }),
        ],
        {
          basis: 'actual',
          source: 'expected',
          window: { from: '2025-01-01', to: '2026-01-01' },
          granularity: 'month',
          groupBy: 'total',
          currency: USD,
          fiscalConfig: { startMonth: 1 },
          asOf: new Date(Date.UTC(2025, 2, 1)),
        },
      );
      const events = result.items.filter((i) => i.value > 0);
      expect(events).toHaveLength(eventCount);
      expect(total(result.items)).toBe(5000);
    },
  );
});

describe('invariant 6 (engine): same inputs + same asOf, any wall clock', () => {
  const contracts = [
    makeContract({
      id: 1,
      termStart: '2024-01-01',
      termEnd: '2026-12-31',
      subscriptionTerm: 36,
      billingFrequency: 'Quarterly',
      annualIncrease: 5,
      products: [
        { product_id: 100, year: 1, fees: 51044 },
        { product_id: 100, year: 2, fees: 56044 },
        { product_id: 100, year: 3, fees: 56044 },
      ],
    }),
    makeContract({
      id: 2,
      termStart: '2025-03-01',
      termEnd: '2026-02-28',
      subscriptionTerm: 12,
      billingFrequency: 'Monthly',
      products: [{ product_id: 200, fees: 24000 }],
    }),
  ];

  const queries: SpendQuery[] = [
    {
      basis: 'actual',
      source: 'expected',
      window: 'currentFY',
      granularity: 'month',
      groupBy: 'contract',
      currency: USD,
      fiscalConfig: { startMonth: 1 },
      asOf: new Date(Date.UTC(2026, 6, 15)),
    },
    {
      basis: 'amortized',
      source: 'expected',
      window: { fiscalYear: 2028 },
      granularity: 'quarter',
      groupBy: 'product',
      proration: 'daily',
      currency: USD,
      fiscalConfig: { startMonth: 1 },
      asOf: new Date(Date.UTC(2026, 6, 15)),
    },
    {
      basis: 'committed',
      source: 'expected',
      window: { from: '2024-01-01', to: '2029-01-01' },
      granularity: 'year',
      groupBy: 'total',
      currency: USD,
      fiscalConfig: { startMonth: 1 },
      asOf: new Date(Date.UTC(2026, 6, 15)),
    },
  ];

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(queries.map((q) => [q.basis, q] as const))(
    '%s basis: output is identical under two different system clocks',
    (_basis, query) => {
      jest.useFakeTimers();

      jest.setSystemTime(new Date(Date.UTC(2026, 6, 15)));
      const first = querySpend(contracts, query);

      jest.setSystemTime(new Date(Date.UTC(2031, 1, 3)));
      const second = querySpend(contracts, query);

      expect(second).toEqual(first);
      expect(first.items.length).toBeGreaterThan(0);
    },
  );
});

// Determinism (invariant 6) covers CONTRACT ORDER too: the engine is handed
// whatever order the DB returned. Daily proration is the case where it can
// show: the slicer hands the accumulator raw fee*days/spanDays values, so
// rounding the running total on every add would make the final cent depend on
// which contract arrived first. These three sum to 14960.24 in one order and
// 14960.23 in the other under per-add rounding.
describe('daily proration is independent of contract order', () => {
  const first = makeContract({
    id: 1,
    termStart: '2026-10-03',
    termEnd: '2028-12-10',
    renewalType: 'One-Time',
    products: [{ product_id: 100, fees: 150 }],
  });
  const second = makeContract({
    id: 2,
    termStart: '2026-01-01',
    termEnd: '2027-01-01',
    renewalType: 'One-Time',
    products: [{ product_id: 200, fees: 10200 }],
  });
  const third = makeContract({
    id: 3,
    termStart: '2026-10-03',
    termEnd: '2027-10-02',
    renewalType: 'One-Time',
    products: [{ product_id: 300, fees: 19350 }],
  });

  const query: SpendQuery = {
    basis: 'amortized',
    source: 'expected',
    window: { from: '2026-01-01', to: '2027-01-01' },
    granularity: 'year',
    groupBy: 'total',
    proration: 'daily',
    currency: USD,
    fiscalConfig: { startMonth: 1 },
    asOf: new Date(Date.UTC(2026, 6, 15)),
  };

  it('yields identical items whatever order the contracts arrive in', () => {
    const inOrder = querySpend([first, second, third], query);
    const shuffled = querySpend([second, first, third], query);

    expect(shuffled.items).toEqual(inOrder.items);
    // The order-free answer is the one rounded from the raw sum.
    expect(inOrder.items).toEqual([
      { period: 'FY2026', groupKey: 'total', value: 14960.24 },
    ]);
  });
});
