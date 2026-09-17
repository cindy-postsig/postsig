import {
  resolveFeeSegments,
  buildSpendLineage,
  lineageFor,
  type LineageMember,
} from '@/lib/v2/spend/resolver';
import { querySpend } from '@/lib/v2/spend';
import type { Contract } from '@/app/lib/budget/types';
import type { CurrencyPolicy, SpendQuery, SpendLineItem } from '@/lib/v2/spend';

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
}
interface ContractSpec {
  id: number;
  status?: string;
  termStart: string;
  termEnd: string;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  billingFrequency?: string | null;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id,
    vendor_id: 1,
    status: spec.status ?? 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: 'Auto',
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

function member(
  contractId: number,
  productId: number,
  sourceContractId: number,
  originalStart: string,
): LineageMember {
  return {
    contractId,
    productId,
    sourceContractId,
    isSuperseding: sourceContractId !== contractId,
    originalStart,
  };
}

const CURRENCY: CurrencyPolicy = { mode: 'preconverted-usd' };
const AS_OF = new Date(2026, 6, 15);
const HORIZON = new Date('2028-01-01T00:00:00.000Z');
const HORIZON_START = new Date(0);

function utcDays(fromISO: string, toISO: string): number {
  return (
    (new Date(`${toISO}T00:00:00.000Z`).getTime() -
      new Date(`${fromISO}T00:00:00.000Z`).getTime()) /
    86400000
  );
}

// ---------------------------------------------------------------------------
// buildSpendLineage — the cutoff walk (port of buildCutoffsByContract).
// ---------------------------------------------------------------------------
describe('buildSpendLineage: cutoff derivation from family timelines', () => {
  it('a boundary amendment cuts its source at the child original start', () => {
    const lineage = buildSpendLineage([
      member(646, 71, 646, '2023-01-01'),
      member(657, 71, 646, '2024-01-01'),
    ]);

    expect(lineage.cutoffs.get(646)?.get(71)).toBe('2024-01-01');
    expect(lineage.cutoffs.get(657)).toBeUndefined();
    expect(lineage.amends.get(657)?.get(71)).toBe(646);
    expect(lineage.amends.get(646)).toBeUndefined();
  });

  it('parallel SOWs — tied start AND role — never cut each other', () => {
    const lineage = buildSpendLineage([
      member(501, 71, 500, '2024-01-01'),
      member(502, 71, 500, '2024-01-01'),
    ]);

    expect(lineage.cutoffs.size).toBe(0);
    expect(lineage.amends.get(501)?.get(71)).toBe(500);
    expect(lineage.amends.get(502)?.get(71)).toBe(500);
  });

  it('chained amendments cut each predecessor at the next original start', () => {
    const lineage = buildSpendLineage([
      member(700, 71, 700, '2023-01-01'),
      member(701, 71, 700, '2024-01-01'),
      member(702, 71, 700, '2025-01-01'),
    ]);

    expect(lineage.cutoffs.get(700)?.get(71)).toBe('2024-01-01');
    expect(lineage.cutoffs.get(701)?.get(71)).toBe('2025-01-01');
    expect(lineage.cutoffs.get(702)).toBeUndefined();
  });

  it('a single-member family produces no cutoff', () => {
    const lineage = buildSpendLineage([member(900, 71, 900, '2024-01-01')]);
    expect(lineage.cutoffs.size).toBe(0);
  });

  it('per-product: only the superseded product is cut; siblings continue', () => {
    // Product 71 is amended; product 72 lives only on the source contract.
    const lineage = buildSpendLineage([
      member(646, 71, 646, '2023-01-01'),
      member(646, 72, 646, '2023-01-01'),
      member(657, 71, 646, '2024-01-01'),
    ]);

    expect(lineage.cutoffs.get(646)?.get(71)).toBe('2024-01-01');
    expect(lineage.cutoffs.get(646)?.get(72)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Resolver — zero-at-cutoff applied to a boundary amendment.
// ---------------------------------------------------------------------------
const parentSpec: ContractSpec = {
  id: 646,
  termStart: '2023-01-01',
  termEnd: '2023-12-31',
  subscriptionTerm: 12,
  renewalPeriod: 12,
  billingFrequency: 'Annually',
  products: [{ product_id: 71, year: 1, fees: 10000 }],
};
const childSpec: ContractSpec = {
  id: 657,
  termStart: '2024-01-01',
  termEnd: '2024-12-31',
  subscriptionTerm: 12,
  renewalPeriod: 12,
  billingFrequency: 'Annually',
  products: [{ product_id: 71, year: 1, fees: 12000 }],
};
const boundaryLineage = buildSpendLineage([
  member(646, 71, 646, '2023-01-01'),
  member(657, 71, 646, '2024-01-01'),
]);

describe('resolver: zero-at-cutoff truncates the superseded parent', () => {
  it('the parent keeps its pre-cutoff term and projects no renewals past it', () => {
    const segments = resolveFeeSegments(
      makeContract(parentSpec),
      lineageFor(boundaryLineage, 646),
      {
        asOf: AS_OF,
        horizonStart: HORIZON_START,
        horizonEnd: HORIZON,
        currency: CURRENCY,
      },
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      from: '2023-01-01',
      to: '2024-01-01',
      fee: 10000,
      source: 'year-entry',
    });
    expect(segments.some((s) => s.source === 'renewal-projection')).toBe(false);
  });

  it("the child's own term is retagged 'amendment'; its renewals are not", () => {
    const segments = resolveFeeSegments(
      makeContract(childSpec),
      lineageFor(boundaryLineage, 657),
      {
        asOf: AS_OF,
        horizonStart: HORIZON_START,
        horizonEnd: HORIZON,
        currency: CURRENCY,
      },
    );

    const amendment = segments.find((s) => s.from === '2024-01-01');
    expect(amendment).toMatchObject({
      to: '2025-01-01',
      fee: 12000,
      source: 'amendment',
    });
    expect(segments.some((s) => s.source === 'renewal-projection')).toBe(true);
  });

  it('without lineage the parent still projects renewals (backward compat)', () => {
    const segments = resolveFeeSegments(makeContract(parentSpec), undefined, {
      asOf: AS_OF,
      horizonStart: HORIZON_START,
      horizonEnd: HORIZON,
      currency: CURRENCY,
    });
    expect(segments.some((s) => s.source === 'renewal-projection')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Boundary pin: a cutoff exactly on a cycle boundary hands over cleanly — the
// parent keeps its full pre-cutoff cycle, the child owns every year after.
// These literals were proven equal to the legacy price-history rollup
// (truncateSupersededAtChildStart) while it existed; the full-model pin now
// lives in price-history-goldens.
// ---------------------------------------------------------------------------
describe('boundary cutoff: committed spend hands over at the cycle boundary', () => {
  it('parent keeps 2023 in full; child owns 2024 onward', () => {
    const query: SpendQuery = {
      basis: 'committed',
      source: 'expected',
      window: { from: '2023-01-01', to: '2028-01-01' },
      granularity: 'year',
      groupBy: 'vendor',
      currency: CURRENCY,
      fiscalConfig: { startMonth: 1 },
      asOf: AS_OF,
    };
    const result = querySpend(
      [makeContract(parentSpec), makeContract(childSpec)],
      query,
      boundaryLineage,
    );
    const byYear = new Map(result.items.map((i) => [i.period, i.value]));

    expect(byYear.get('FY2023')).toBe(10000);
    expect(byYear.get('FY2024')).toBe(12000);
    expect(byYear.get('FY2025')).toBe(12000);
    expect(byYear.get('FY2026')).toBe(12000);
    expect(byYear.get('FY2027')).toBe(12000);
    expect(result.items).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Parallel SOWs coexist: no cutoff, both fees count.
// ---------------------------------------------------------------------------
describe('parallel SOWs: concurrent siblings both contribute', () => {
  it('two same-day SOWs on one product sum, not supersede', () => {
    const sowA: ContractSpec = {
      id: 501,
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 12,
      billingFrequency: 'Annually',
      products: [{ product_id: 71, year: 1, fees: 5000 }],
    };
    const sowB: ContractSpec = {
      ...sowA,
      id: 502,
      products: [{ product_id: 71, year: 1, fees: 7000 }],
    };
    const lineage = buildSpendLineage([
      member(501, 71, 500, '2024-01-01'),
      member(502, 71, 500, '2024-01-01'),
    ]);

    const result = querySpend(
      [makeContract(sowA), makeContract(sowB)],
      {
        basis: 'committed',
        source: 'expected',
        window: { from: '2024-01-01', to: '2025-01-01' },
        granularity: 'year',
        groupBy: 'total',
        currency: CURRENCY,
        fiscalConfig: { startMonth: 1 },
        asOf: AS_OF,
      },
      lineage,
    );

    const fy2024 = result.items.find((i) => i.period === 'FY2024');
    expect(fy2024?.value).toBe(12000);
  });
});

// ---------------------------------------------------------------------------
// Chained amendments: each child begins exactly where its predecessor is cut —
// no gap, no overlap.
// ---------------------------------------------------------------------------
describe('chained amendments: contiguous handover', () => {
  it("the middle amendment starts at the parent's cutoff and is itself cut", () => {
    const p = makeContract({
      id: 700,
      termStart: '2023-01-01',
      termEnd: '2023-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 12,
      billingFrequency: 'Annually',
      products: [{ product_id: 71, year: 1, fees: 10000 }],
    });
    const a1 = makeContract({
      id: 701,
      termStart: '2024-01-01',
      termEnd: '2024-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 12,
      billingFrequency: 'Annually',
      products: [{ product_id: 71, year: 1, fees: 11000 }],
    });
    const lineage = buildSpendLineage([
      member(700, 71, 700, '2023-01-01'),
      member(701, 71, 700, '2024-01-01'),
      member(702, 71, 700, '2025-01-01'),
    ]);

    const parentSegs = resolveFeeSegments(p, lineageFor(lineage, 700), {
      asOf: AS_OF,
      horizonStart: HORIZON_START,
      horizonEnd: HORIZON,
      currency: CURRENCY,
    });
    const a1Segs = resolveFeeSegments(a1, lineageFor(lineage, 701), {
      asOf: AS_OF,
      horizonStart: HORIZON_START,
      horizonEnd: HORIZON,
      currency: CURRENCY,
    });

    // Parent ends exactly where amend1 begins.
    expect(parentSegs.every((s) => s.to <= '2024-01-01')).toBe(true);
    expect(Math.min(...a1Segs.map((s) => new Date(s.from).getTime()))).toBe(
      new Date('2024-01-01').getTime(),
    );
    // Amend1 is itself cut at amend2's start — no segment survives past 2025.
    expect(a1Segs.every((s) => s.to <= '2025-01-01')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Straddling (mid-term) amendment — the set-B correctness fix. Legacy chart /
// monthly report keep the parent's full fee over the overlap and double-count;
// the resolver truncates the parent at the cutoff and scales its fee to the
// retained span, so no month is counted twice.
// ---------------------------------------------------------------------------
describe('straddling amendment: truncate-and-scale, no double count', () => {
  const parent = makeContract({
    id: 800,
    termStart: '2023-06-01',
    termEnd: '2024-05-31',
    subscriptionTerm: 12,
    billingFrequency: 'Annually',
    products: [{ product_id: 71, year: 1, fees: 12000 }],
  });
  const child = makeContract({
    id: 801,
    termStart: '2024-01-01',
    termEnd: '2024-12-31',
    subscriptionTerm: 12,
    renewalPeriod: 12,
    billingFrequency: 'Annually',
    products: [{ product_id: 71, year: 1, fees: 18000 }],
  });
  const lineage = buildSpendLineage([
    member(800, 71, 800, '2023-06-01'),
    member(801, 71, 800, '2024-01-01'),
  ]);

  it('the parent term is cut at the child start and its fee scaled by retained span', () => {
    const segs = resolveFeeSegments(parent, lineageFor(lineage, 800), {
      asOf: AS_OF,
      horizonStart: HORIZON_START,
      horizonEnd: HORIZON,
      currency: CURRENCY,
    });
    const initial = segs.find((s) => s.from === '2023-06-01');
    const expectedFee =
      Math.round(
        ((12000 * utcDays('2023-06-01', '2024-01-01')) /
          utcDays('2023-06-01', '2024-06-01')) *
          100,
      ) / 100;

    expect(initial?.to).toBe('2024-01-01');
    expect(initial?.fee).toBe(expectedFee);
    expect(initial!.fee).toBeLessThan(12000);
  });

  it('overlap months (Jan–May 2024) count the child only, not parent+child', () => {
    const overlapQuery: SpendQuery = {
      basis: 'amortized',
      source: 'expected',
      window: { from: '2024-01-01', to: '2024-06-01' },
      granularity: 'year',
      groupBy: 'total',
      proration: 'daily',
      currency: CURRENCY,
      fiscalConfig: { startMonth: 1 },
      asOf: AS_OF,
    };
    const withLineage = querySpend([parent, child], overlapQuery, lineage);
    const withoutLineage = querySpend([parent, child], overlapQuery);

    const sum = (r: { items: SpendLineItem[] }) =>
      r.items.reduce((s, i) => s + i.value, 0);

    // Without lineage the parent's Jan–May fee stacks on the child's over the
    // overlap; with lineage the parent is gone there, so the total is strictly
    // lower — the double count is removed.
    expect(sum(withLineage)).toBeLessThan(sum(withoutLineage));
  });
});
