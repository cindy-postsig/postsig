import { queryRenewals, queryTCV } from '@/lib/v2/spend';
import { buildSpendLineage, type LineageMember } from '@/lib/v2/spend/resolver';
import type { Contract } from '@/app/lib/budget/types';
import type { CurrencyPolicy, SpendEventQuery } from '@/lib/v2/spend';

const CURRENCY: CurrencyPolicy = { mode: 'preconverted-usd' };
const AS_OF = new Date('2024-06-15T00:00:00.000Z');

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
}

interface ContractSpec {
  id: number;
  vendorId?: number;
  status?: string;
  renewalType?: string;
  willNotRenew?: boolean;
  termStart: string;
  termEnd?: string | null;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id,
    vendor_id: spec.vendorId ?? 1,
    status: spec.status ?? 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: spec.renewalType ?? 'Auto',
    billing_frequency: 'Annually',
    will_not_renew: spec.willNotRenew ?? false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: spec.termEnd ? [{ date: spec.termEnd }] : [],
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

function query(overrides: Partial<SpendEventQuery> = {}): SpendEventQuery {
  return {
    window: { from: '2025-01-01', to: '2026-01-01' },
    granularity: 'month',
    groupBy: 'total',
    currency: CURRENCY,
    fiscalConfig: { startMonth: 1 },
    asOf: AS_OF,
    ...overrides,
  };
}

const annual = makeContract({
  id: 1,
  termStart: '2024-01-01',
  termEnd: '2024-12-31',
  subscriptionTerm: 12,
  renewalPeriod: 12,
  products: [{ product_id: 71, fees: 10000 }],
});

describe('queryRenewals: renewal-term events', () => {
  it('emits one event per renewal-term start inside the window', () => {
    const result = queryRenewals([annual], query());
    expect(result.items).toEqual([
      { period: '2025-01', groupKey: 'total', value: 10000 },
    ]);
  });

  it('events outside the window are excluded', () => {
    const result = queryRenewals(
      [annual],
      query({ window: { from: '2025-02-01', to: '2026-01-01' } }),
    );
    expect(result.items).toEqual([]);
  });

  it('a multi-year renewal term is ONE event worth the full term, not one per year-slice', () => {
    const biennial = makeContract({
      id: 2,
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 24,
      products: [{ product_id: 71, fees: 10000 }],
    });
    const result = queryRenewals(
      [biennial],
      query({ window: { from: '2025-01-01', to: '2028-01-01' } }),
    );
    // Terms renew 2025-01-01 and 2027-01-01; each is a single 2×-annual event.
    expect(result.items).toEqual([
      { period: '2025-01', groupKey: 'total', value: 20000 },
      { period: '2027-01', groupKey: 'total', value: 20000 },
    ]);
  });

  it('the event keeps its full term value even when the term extends past the window', () => {
    const result = queryRenewals(
      [annual],
      query({ window: { from: '2025-01-01', to: '2025-03-01' } }),
    );
    expect(result.items).toEqual([
      { period: '2025-01', groupKey: 'total', value: 10000 },
    ]);
  });

  it('One-Time and will-not-renew contracts emit no events', () => {
    const oneTime = makeContract({
      id: 3,
      renewalType: 'One-Time',
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      products: [{ product_id: 71, fees: 10000 }],
    });
    const wontRenew = makeContract({
      id: 4,
      willNotRenew: true,
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      products: [{ product_id: 71, fees: 10000 }],
    });
    const result = queryRenewals([oneTime, wontRenew], query());
    expect(result.items).toEqual([]);
  });

  it('#1594 hint years appear as successive renewal events at their recorded fees', () => {
    const hinted = makeContract({
      id: 5,
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 12,
      products: [
        { product_id: 71, year: 1, fees: 10000 },
        { product_id: 71, year: 2, fees: 11000 },
      ],
    });
    const result = queryRenewals(
      [hinted],
      query({ window: { from: '2025-01-01', to: '2027-01-01' } }),
    );
    // Year-2 row = the 2025 hint cycle at its recorded fee; 2026 projects
    // from the final-year fee.
    expect(result.items).toEqual([
      { period: '2025-01', groupKey: 'total', value: 11000 },
      { period: '2026-01', groupKey: 'total', value: 11000 },
    ]);
  });

  it('a superseded contract projects no renewal events past its cutoff', () => {
    const members: LineageMember[] = [
      {
        contractId: 1,
        productId: 71,
        sourceContractId: 1,
        isSuperseding: false,
        originalStart: '2024-01-01',
      },
      {
        contractId: 9,
        productId: 71,
        sourceContractId: 1,
        isSuperseding: true,
        originalStart: '2025-01-01',
      },
    ];
    const result = queryRenewals([annual], query(), buildSpendLineage(members));
    expect(result.items).toEqual([]);
  });

  it('groups by contract and by composite product key', () => {
    const twoProducts = makeContract({
      id: 6,
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 12,
      products: [
        { product_id: 71, fees: 10000 },
        { product_id: 72, fees: 5000 },
      ],
    });
    const byContract = queryRenewals(
      [twoProducts],
      query({ groupBy: 'contract' }),
    );
    expect(byContract.items).toEqual([
      { period: '2025-01', groupKey: '6', value: 15000 },
    ]);

    const byProduct = queryRenewals(
      [twoProducts],
      query({ groupBy: 'product' }),
    );
    expect(byProduct.items).toEqual([
      { period: '2025-01', groupKey: '6:71', value: 10000 },
      { period: '2025-01', groupKey: '6:72', value: 5000 },
    ]);
  });
});

describe('queryTCV: committed obligation at term end', () => {
  it('buckets the committed total at the committed end month; projections never count', () => {
    const result = queryTCV(
      [annual],
      query({ window: { from: '2024-01-01', to: '2030-01-01' } }),
    );
    expect(result.items).toEqual([
      { period: '2024-12', groupKey: 'total', value: 10000 },
    ]);
  });

  it('a multi-year committed term sums every year row into one event at the final end', () => {
    const multiYear = makeContract({
      id: 7,
      termStart: '2024-01-01',
      termEnd: '2025-12-31',
      subscriptionTerm: 24,
      products: [
        { product_id: 71, year: 1, fees: 10000 },
        { product_id: 71, year: 2, fees: 12000 },
      ],
    });
    const result = queryTCV(
      [multiYear],
      query({ window: { from: '2024-01-01', to: '2030-01-01' } }),
    );
    expect(result.items).toEqual([
      { period: '2025-12', groupKey: 'total', value: 22000 },
    ]);
  });

  it('a truncated superseded contract reports a scaled TCV at its cutoff', () => {
    const straddled = makeContract({
      id: 8,
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      subscriptionTerm: 12,
      products: [{ product_id: 71, fees: 10000 }],
    });
    const members: LineageMember[] = [
      {
        contractId: 8,
        productId: 71,
        sourceContractId: 8,
        isSuperseding: false,
        originalStart: '2024-01-01',
      },
      {
        contractId: 9,
        productId: 71,
        sourceContractId: 8,
        isSuperseding: true,
        originalStart: '2024-07-01',
      },
    ];
    const result = queryTCV(
      [straddled],
      query({ window: { from: '2024-01-01', to: '2030-01-01' } }),
      buildSpendLineage(members),
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].period).toBe('2024-06');
    expect(result.items[0].value).toBeGreaterThan(0);
    expect(result.items[0].value).toBeLessThan(10000);
  });

  it('an event before the window start is excluded', () => {
    const result = queryTCV([annual], query());
    expect(result.items).toEqual([]);
  });

  it('an event at/after the window end is excluded', () => {
    const result = queryTCV(
      [annual],
      query({ window: { from: '2024-01-01', to: '2024-06-01' } }),
    );
    expect(result.items).toEqual([]);
  });

  it('fiscal-year granularity uses fiscal keys', () => {
    const result = queryTCV(
      [annual],
      query({
        window: { from: '2024-01-01', to: '2030-01-01' },
        granularity: 'year',
      }),
    );
    expect(result.items).toEqual([
      { period: 'FY2024', groupKey: 'total', value: 10000 },
    ]);
  });
});

describe('sibling query validation', () => {
  it('rejects native currency for cross-contract grouping', () => {
    expect(() =>
      queryTCV([annual], query({ currency: { mode: 'native' } })),
    ).toThrow(/per-contract grouping/);
  });

  it('accepts native currency for per-contract grouping', () => {
    expect(() =>
      queryTCV(
        [annual],
        query({ currency: { mode: 'native' }, groupBy: 'contract' }),
      ),
    ).not.toThrow();
  });
});
