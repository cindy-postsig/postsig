import { querySpend } from '@/lib/v2/spend';
import type { SpendQuery, SpendResult, CurrencyPolicy } from '@/lib/v2/spend';
import type { Contract } from '@/app/lib/budget/types';

// makeContract copied from spend-resolver-equivalence.test.ts (extended with
// vendor_id, owner sponsors, and per-product display name) rather than
// imported, so this file never depends on or mutates another test.
interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
  name?: string;
}
interface ContractSpec {
  id?: number;
  vendorId?: number;
  status?: string;
  termStart: string;
  termEnd: string;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  renewalType?: string | null;
  billingFrequency?: string | null;
  annualIncrease?: number | null;
  willNotRenew?: boolean;
  sponsors?: string[];
  products: ProductSpec[];
}

const sponsorOwnerRows = (names: readonly string[]) =>
  names.map((label, index) => ({
    id: index + 1,
    role: 'sponsor',
    user_id: null,
    org_employee_id: null,
    label,
    org_unit_id: null,
  }));

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: spec.vendorId ?? 1,
    status: spec.status ?? 'active',
    status_id: 4,
    currency: 'usd',
    contract_owners: sponsorOwnerRows(spec.sponsors ?? []),
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
      vendor_products: {
        id: p.product_id,
        name: p.name ?? `Product ${p.product_id}`,
      },
    })),
    vendors: { name: 'Test Vendor' },
    users: { organizations: { fiscal_year_start_month: 1 } },
  } as unknown as Contract;
}

const CURRENCY: CurrencyPolicy = { mode: 'preconverted-usd' };
const AS_OF = new Date(2026, 6, 15);

const baseQuery: Omit<SpendQuery, 'basis' | 'window' | 'groupBy'> = {
  source: 'expected',
  granularity: 'year',
  currency: CURRENCY,
  fiscalConfig: { startMonth: 1 },
  asOf: AS_OF,
};

const run = (
  contracts: Contract[],
  overrides: Partial<SpendQuery>,
): SpendResult =>
  querySpend(contracts, { ...baseQuery, ...overrides } as SpendQuery);

const cents = (value: number): number => Math.round(value * 100) / 100;

const sumByPeriod = (result: SpendResult): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const item of result.items) {
    totals.set(item.period, cents((totals.get(item.period) ?? 0) + item.value));
  }
  return totals;
};

const groupKeys = (result: SpendResult): Set<string> =>
  new Set(result.items.map((i) => i.groupKey));

// A single window aligned to FY2025 (January fiscal), so a committed year query
// lands each one-time cycle fee entirely in the FY2025 bucket.
const FY2025 = { from: '2025-01-01', to: '2026-01-01' } as const;

// ---------------------------------------------------------------------------
// Additivity — the governing invariant: for ANY groupBy, the sum over all
// group buckets for a period equals the 'total' value for that period.
// Multi-contract, multi-vendor, multi-product fixture; committed basis keeps
// every bucket an exact integer so the equality is exact.
// ---------------------------------------------------------------------------
describe('additivity: sum over group buckets == total, per period', () => {
  const fixture: Contract[] = [
    makeContract({
      id: 10,
      vendorId: 99,
      sponsors: ['Alice', 'Bob'],
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [
        { product_id: 100, year: 1, fees: 1000 },
        { product_id: 200, year: 1, fees: 2000 },
      ],
    }),
    makeContract({
      id: 20,
      vendorId: 99,
      sponsors: ['Alice'],
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [{ product_id: 100, year: 1, fees: 3000 }],
    }),
    makeContract({
      id: 30,
      vendorId: 88,
      sponsors: [],
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [{ product_id: 300, year: 1, fees: 4000 }],
    }),
  ];

  const totalByPeriod = sumByPeriod(
    run(fixture, { basis: 'committed', groupBy: 'total', window: FY2025 }),
  );

  it.each(['product', 'contract', 'vendor', 'sponsor'] as const)(
    '%s buckets sum back to the total per period',
    (groupBy) => {
      const grouped = run(fixture, {
        basis: 'committed',
        groupBy,
        window: FY2025,
      });
      expect(sumByPeriod(grouped)).toEqual(totalByPeriod);
    },
  );

  it('the FY2025 total is the sum of every product fee', () => {
    expect(totalByPeriod.get('FY2025')).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// product — composite (contractId, productId) keys.
// ---------------------------------------------------------------------------
describe('product groupBy: keyed by (contractId, productId)', () => {
  it('gartnerStub two products yield distinct id:100 / id:200 series summing to total', () => {
    const contract = makeContract({
      id: 1504,
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [
        { product_id: 100, year: 1, fees: 100 },
        { product_id: 200, year: 1, fees: 200 },
      ],
    });

    const result = run([contract], {
      basis: 'committed',
      groupBy: 'product',
      window: FY2025,
    });

    expect(result.items).toEqual([
      { period: 'FY2025', groupKey: '1504:100', value: 100 },
      { period: 'FY2025', groupKey: '1504:200', value: 200 },
    ]);
  });

  it('two DIFFERENT products sharing a display label stay separate series', () => {
    // Both products render as "Shared Label" but carry distinct ids; keying by
    // (contractId, productId) must NOT merge them.
    const contract = makeContract({
      id: 7,
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [
        { product_id: 100, year: 1, fees: 100, name: 'Shared Label' },
        { product_id: 200, year: 1, fees: 200, name: 'Shared Label' },
      ],
    });

    const result = run([contract], {
      basis: 'committed',
      groupBy: 'product',
      window: FY2025,
    });

    expect(groupKeys(result)).toEqual(new Set(['7:100', '7:200']));
  });

  it('the same product id on two contracts stays two series', () => {
    const contracts = [
      makeContract({
        id: 10,
        termStart: '2025-01-01',
        termEnd: '2025-12-31',
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        billingFrequency: 'Annually',
        products: [{ product_id: 100, year: 1, fees: 100 }],
      }),
      makeContract({
        id: 20,
        termStart: '2025-01-01',
        termEnd: '2025-12-31',
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        billingFrequency: 'Annually',
        products: [{ product_id: 100, year: 1, fees: 200 }],
      }),
    ];

    const result = run(contracts, {
      basis: 'committed',
      groupBy: 'product',
      window: FY2025,
    });

    expect(groupKeys(result)).toEqual(new Set(['10:100', '20:100']));
  });
});

// ---------------------------------------------------------------------------
// vendor / contract — two contracts under one vendor.
// ---------------------------------------------------------------------------
describe('vendor / contract groupBy: one vendor, two contracts', () => {
  const contracts = [
    makeContract({
      id: 10,
      vendorId: 99,
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [{ product_id: 100, year: 1, fees: 100 }],
    }),
    makeContract({
      id: 20,
      vendorId: 99,
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [{ product_id: 200, year: 1, fees: 200 }],
    }),
  ];

  it('vendor merges both contracts into one bucket', () => {
    const result = run(contracts, {
      basis: 'committed',
      groupBy: 'vendor',
      window: FY2025,
    });
    expect(result.items).toEqual([
      { period: 'FY2025', groupKey: '99', value: 300 },
    ]);
  });

  it('contract keeps them as two buckets', () => {
    const result = run(contracts, {
      basis: 'committed',
      groupBy: 'contract',
      window: FY2025,
    });
    expect(result.items).toEqual([
      { period: 'FY2025', groupKey: '10', value: 100 },
      { period: 'FY2025', groupKey: '20', value: 200 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// sponsor — even split, odd-cent preservation, no-sponsor 'unassigned'.
// ---------------------------------------------------------------------------
describe('sponsor groupBy: even split with cents preserved', () => {
  it('two sponsors split evenly; an odd-cent total splits without a lost cent', () => {
    const contract = makeContract({
      id: 5,
      sponsors: ['Alice', 'Bob'],
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [{ product_id: 100, year: 1, fees: 999.99 }],
    });

    const result = run([contract], {
      basis: 'committed',
      groupBy: 'sponsor',
      window: FY2025,
    });

    expect(result.items).toEqual([
      { period: 'FY2025', groupKey: 'Alice', value: 500.0 },
      { period: 'FY2025', groupKey: 'Bob', value: 499.99 },
    ]);
    // The two halves sum back to the whole line value — no lost cent.
    expect(sumByPeriod(result).get('FY2025')).toBe(999.99);
  });

  it('the same sponsor spelt with stray whitespace shares one bucket', () => {
    const contract = makeContract({
      id: 7,
      sponsors: ['Alice', ' Alice '],
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [{ product_id: 100, year: 1, fees: 1000 }],
    });

    const result = run([contract], {
      basis: 'committed',
      groupBy: 'sponsor',
      window: FY2025,
    });

    expect(result.items).toEqual([
      { period: 'FY2025', groupKey: 'Alice', value: 1000 },
    ]);
  });

  it('a contract with no sponsor lands entirely in the unassigned bucket', () => {
    const contract = makeContract({
      id: 6,
      sponsors: [],
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [{ product_id: 100, year: 1, fees: 1234 }],
    });

    const result = run([contract], {
      basis: 'committed',
      groupBy: 'sponsor',
      window: FY2025,
    });

    expect(result.items).toEqual([
      { period: 'FY2025', groupKey: 'unassigned', value: 1234 },
    ]);
  });

  it('sponsor buckets sum to the total across a mixed sponsor / no-sponsor set', () => {
    const contracts = [
      makeContract({
        id: 10,
        sponsors: ['Alice', 'Bob'],
        termStart: '2025-01-01',
        termEnd: '2025-12-31',
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        billingFrequency: 'Annually',
        products: [{ product_id: 100, year: 1, fees: 1000 }],
      }),
      makeContract({
        id: 20,
        sponsors: [],
        termStart: '2025-01-01',
        termEnd: '2025-12-31',
        subscriptionTerm: 12,
        renewalType: 'One-Time',
        billingFrequency: 'Annually',
        products: [{ product_id: 100, year: 1, fees: 500 }],
      }),
    ];

    const total = run(contracts, {
      basis: 'committed',
      groupBy: 'total',
      window: FY2025,
    });
    const sponsor = run(contracts, {
      basis: 'committed',
      groupBy: 'sponsor',
      window: FY2025,
    });

    expect(groupKeys(sponsor)).toEqual(new Set(['Alice', 'Bob', 'unassigned']));
    expect(sumByPeriod(sponsor)).toEqual(sumByPeriod(total));
  });
});

// ---------------------------------------------------------------------------
// allocation — replaced decision-#13's 'group' (psk-1846 phase 3); dimension
// semantics are pinned in spend-allocation-dimension.test.ts. Here it only
// joins the additivity family: nothing is resolved, so everything routes to
// 'unassigned' and must still sum back to the total.
// ---------------------------------------------------------------------------
describe('groupBy allocation', () => {
  it("buckets unallocated fixtures under 'unassigned', conserving the total", () => {
    const contract = makeContract({
      id: 1,
      termStart: '2025-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 12,
      renewalType: 'One-Time',
      billingFrequency: 'Annually',
      products: [{ product_id: 100, year: 1, fees: 100 }],
    });

    const grouped = querySpend(
      [contract],
      {
        ...baseQuery,
        basis: 'committed',
        groupBy: { kind: 'allocation', level: 'business_group' },
        window: FY2025,
      } as SpendQuery,
      undefined,
      { allocations: { resolved: new Map(), unitsById: new Map() } },
    );
    expect(groupKeys(grouped)).toEqual(new Set(['unassigned']));
    expect(grouped.items.reduce((sum, i) => sum + i.value, 0)).toBe(100);
  });
});
