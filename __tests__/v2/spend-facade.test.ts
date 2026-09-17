import { readFileSync } from 'fs';
import { join } from 'path';
import { querySpend } from '@/lib/v2/spend';
import type { SpendQuery } from '@/lib/v2/spend';
import type { Contract } from '@/app/lib/budget/types';

// Copied from spend-resolver-equivalence.test.ts rather than imported, so this
// file never depends on or mutates another test.
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

const shapes: Record<string, ContractSpec> = {
  standardMultiYear: {
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
  },
  gartnerStub: {
    id: 1504,
    termStart: '2025-10-01',
    termEnd: '2027-12-31',
    subscriptionTerm: 27,
    products: [
      { product_id: 100, year: 1, fees: 0 },
      { product_id: 100, year: 2, fees: 36900 },
      { product_id: 100, year: 3, fees: 38374 },
      { product_id: 200, year: 1, fees: 0 },
      { product_id: 200, year: 2, fees: 147600 },
      { product_id: 200, year: 3, fees: 153496 },
    ],
  },
};

function loadGoldens() {
  const goldenPath = join(__dirname, '__goldens__', 'spend-goldens.json');
  return JSON.parse(readFileSync(goldenPath, 'utf8'));
}

// querySpend returns SpendLineItem { period, groupKey, value }; the goldens are
// {key, value} with zero buckets dropped. Map between the two.
function chart(items: { period: string; value: number }[]) {
  return items
    .filter((item) => item.value !== 0)
    .map((item) => ({ key: item.period, value: item.value }));
}

const baseQuery: Omit<SpendQuery, 'basis' | 'window'> = {
  source: 'expected',
  granularity: 'month',
  groupBy: 'total',
  currency: { mode: 'preconverted-usd' },
  fiscalConfig: { startMonth: 1 },
  asOf: new Date(2026, 6, 15),
};

// The rerouted facade drives the resolver + real slicers, then aggregates per
// contract. Green here proves the new engine reproduces the pinned oracle
// (single product AND multi-product aggregation) under the axes the facade
// exposes today.
describe('querySpend reroute reproduces the pinned goldens', () => {
  const goldens = loadGoldens();

  it.each(['standardMultiYear', 'gartnerStub'])(
    '%s: amortized/currentFY matches the golden',
    (name) => {
      const result = querySpend([makeContract(shapes[name])], {
        ...baseQuery,
        basis: 'amortized',
        window: 'currentFY',
      });

      expect(result.basis).toBe('amortized');
      expect(result.items.every((i) => i.groupKey === 'total')).toBe(true);
      expect(chart(result.items)).toEqual(
        goldens.extractors[name].amortizedCurrent,
      );
    },
  );

  it.each(['standardMultiYear', 'gartnerStub'])(
    '%s: actual/currentFY matches the golden',
    (name) => {
      const result = querySpend([makeContract(shapes[name])], {
        ...baseQuery,
        basis: 'actual',
        window: 'currentFY',
      });

      expect(result.basis).toBe('actual');
      expect(chart(result.items)).toEqual(
        goldens.extractors[name].actualCurrent,
      );
    },
  );
});

describe('querySpend aggregates across contracts', () => {
  it('sums two contracts bucket-by-bucket into the combined total', () => {
    const query: SpendQuery = {
      ...baseQuery,
      basis: 'amortized',
      window: 'currentFY',
    };
    const a = querySpend([makeContract(shapes.standardMultiYear)], query);
    const b = querySpend([makeContract(shapes.gartnerStub)], query);
    const combined = querySpend(
      [
        makeContract(shapes.standardMultiYear),
        makeContract(shapes.gartnerStub),
      ],
      query,
    );

    const expected = new Map<string, number>();
    for (const item of [...a.items, ...b.items]) {
      expected.set(
        item.period,
        Math.round(((expected.get(item.period) ?? 0) + item.value) * 100) / 100,
      );
    }

    expect(new Map(combined.items.map((i) => [i.period, i.value]))).toEqual(
      expected,
    );
  });
});

// Flagged domain rule: a contract marked inactive is done — no projected
// renewals past its recorded end. Queried for a future window it contributes
// nothing, unlike the same contract left active (which renews into the window).
describe('querySpend: inactive contracts stop projecting', () => {
  const spec: ContractSpec = {
    id: 7001,
    termStart: '2023-01-01',
    termEnd: '2023-12-31',
    subscriptionTerm: 12,
    renewalPeriod: 12,
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 10000 }],
  };

  it.each(['amortized', 'actual'] as const)(
    'inactive contract contributes nothing to a future window (%s)',
    (basis) => {
      const result = querySpend(
        [makeContract({ ...spec, status: 'inactive' })],
        { ...baseQuery, basis, window: 'nextFY' },
      );
      expect(chart(result.items)).toEqual([]);
    },
  );

  it('the same contract left active DOES renew into the future window', () => {
    const result = querySpend([makeContract({ ...spec, status: 'active' })], {
      ...baseQuery,
      basis: 'amortized',
      window: 'nextFY',
    });
    const total = result.items.reduce((sum, i) => sum + i.value, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe('querySpend rejects unsupported combinations', () => {
  const contract = makeContract(shapes.standardMultiYear);

  // Phase 3c-A opened committed basis, {fiscalYear}/{from,to} windows,
  // quarter/year granularity, and daily proration; phase 3c-B opened
  // groupBy vendor/contract/product/sponsor (asserted in spend-3c-groupby.test.ts);
  // psk-1846 phase 3 replaced decision-#13's 'group' with the allocation
  // dimension. What STILL throws: explain, native currency, and proration on
  // a non-amortized basis.
  it.each([
    [{ basis: 'amortized', window: 'currentFY', explain: true }, /explain/],
    [
      { basis: 'actual', window: 'currentFY', proration: 'monthly' },
      /proration is only valid/,
    ],
    [
      { basis: 'committed', window: 'currentFY', proration: 'daily' },
      /proration is only valid/,
    ],
    // Native currency is a per-contract read; cross-contract grouping (the
    // base query's groupBy 'total') would sum mixed currencies.
    [
      { basis: 'amortized', window: 'currentFY', currency: { mode: 'native' } },
      /per-contract grouping/,
    ],
  ])('throws for %o', (overrides, expected) => {
    expect(() =>
      querySpend([contract], {
        ...baseQuery,
        ...(overrides as Partial<SpendQuery>),
      } as SpendQuery),
    ).toThrow(expected);
  });
});
