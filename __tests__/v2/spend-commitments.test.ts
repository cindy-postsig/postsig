import type { Contract } from '@/app/lib/budget/types';
import {
  queryCommitments,
  queryRenewals,
  queryTCV,
  querySpend,
  resolveFeeSegments,
  EMPTY_LINEAGE,
  lineageFor,
  type SpendEventQuery,
} from '@/lib/v2/spend';

interface Spec {
  id: number;
  termStart: string;
  termEnd: string;
  subscriptionTerm?: number;
  renewalPeriod?: number;
  renewalType?: string;
  cancelByDays?: number;
  products: Array<{ product_id: number; year?: number; fees: number }>;
}

function makeContract(spec: Spec): Contract {
  return {
    id: spec.id,
    vendor_id: 10,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: spec.renewalType ?? 'Auto',
    billing_frequency: 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    cancel_by_date: spec.cancelByDays ?? null,
    vendor_products_details: spec.products.map((p) => ({
      product_id: p.product_id,
      year: p.year ?? 1,
      fees: p.fees,
      vendor_products: { id: p.product_id, name: `Product ${p.product_id}` },
    })),
    vendors: { name: 'Test Vendor' },
  } as unknown as Contract;
}

const multiYear = makeContract({
  id: 1,
  termStart: '2024-01-01',
  termEnd: '2026-12-31',
  subscriptionTerm: 36,
  renewalPeriod: 12,
  products: [
    { product_id: 100, year: 1, fees: 51044 },
    { product_id: 100, year: 2, fees: 56044 },
    { product_id: 100, year: 3, fees: 56044 },
  ],
});

const oneTime = makeContract({
  id: 2,
  termStart: '2026-03-01',
  termEnd: '2027-02-28',
  subscriptionTerm: 12,
  renewalType: 'One-Time',
  products: [{ product_id: 200, year: 1, fees: 8000 }],
});

const asOf = new Date(Date.UTC(2026, 6, 15));
const HORIZON_START = new Date(0);
const usd = { mode: 'preconverted-usd' } as const;

const wideQuery: SpendEventQuery = {
  window: { from: '2024-01-01', to: '2028-01-01' },
  granularity: 'month',
  groupBy: 'contract',
  currency: usd,
  fiscalConfig: { startMonth: 1 },
  asOf,
};

describe('termStart stamping on committed segments', () => {
  it('every slice of the recorded span shares the recorded start', () => {
    const segments = resolveFeeSegments(
      multiYear,
      lineageFor(EMPTY_LINEAGE, 1),
      {
        asOf,
        horizonStart: HORIZON_START,
        horizonEnd: new Date(Date.UTC(2028, 0, 1)),
        currency: usd,
      },
    );
    const committed = segments.filter((s) => s.source !== 'renewal-projection');
    expect(committed.length).toBeGreaterThan(1);
    for (const segment of committed) {
      expect(segment.termStart).toBe('2024-01-01');
    }
  });
});

describe('queryCommitments', () => {
  it('emits ONE new event per recorded span at its start, valued at the full committed total', () => {
    const { items } = queryCommitments([multiYear], wideQuery);
    const news = items.filter((i) => i.kind === 'new');
    expect(news).toEqual([
      { period: '2024-01', groupKey: '1', value: 163132, kind: 'new' },
    ]);
  });

  // With no cancel-by offset the action date IS the new term's start, so the
  // two queries coincide. They diverge only where an offset exists — see the
  // recognition-date cases below.
  it('renewal events match queryRenewals exactly when no offset is recorded', () => {
    const { items } = queryCommitments([multiYear], wideQuery);
    const renewals = items
      .filter((i) => i.kind === 'renewal')
      .map(({ kind, ...item }) => item);
    expect(renewals).toEqual(queryRenewals([multiYear], wideQuery).items);
    expect(renewals.length).toBeGreaterThan(0);
  });

  it('new totals conserve against queryTCV (same committed sum, recognition-date bucketing)', () => {
    const commitmentTotal = queryCommitments([multiYear, oneTime], wideQuery)
      .items.filter((i) => i.kind === 'new')
      .reduce((sum, i) => sum + i.value, 0);
    const tcvTotal = queryTCV([multiYear, oneTime], wideQuery).items.reduce(
      (sum, i) => sum + i.value,
      0,
    );
    expect(commitmentTotal).toBe(tcvTotal);
  });

  it('a One-Time contract is a single new commitment with no renewals', () => {
    const { items } = queryCommitments([oneTime], wideQuery);
    expect(items).toEqual([
      { period: '2026-03', groupKey: '2', value: 8000, kind: 'new' },
    ]);
  });

  it('window filtering applies to commitment events', () => {
    const { items } = queryCommitments([multiYear], {
      ...wideQuery,
      window: { from: '2026-01-01', to: '2028-01-01' },
    });
    expect(items.filter((i) => i.kind === 'new')).toEqual([]);
    expect(items.filter((i) => i.kind === 'renewal').length).toBeGreaterThan(0);
  });

  describe("'annual' valuation kinds", () => {
    // The S&P #3024 confusion (product review 2026-08-04): under 'annual'
    // valuation only the slice that BEGINS the recorded term is 'new'; year
    // 2/3 of a signed multi-year deal are 'multi-year' (recurring,
    // pre-committed), never "New" and never a projection.
    it("tags later year-slices of a recorded multi-year term 'multi-year'", () => {
      const { items } = queryCommitments([multiYear], {
        ...wideQuery,
        valuation: 'annual',
        recognition: 'term-start',
      });
      const recorded = items
        .filter((i) => i.kind !== 'renewal')
        .sort((a, b) => a.period.localeCompare(b.period));
      expect(recorded).toEqual([
        { period: '2024-01', groupKey: '1', value: 51044, kind: 'new' },
        { period: '2025-01', groupKey: '1', value: 56044, kind: 'multi-year' },
        { period: '2026-01', groupKey: '1', value: 56044, kind: 'multi-year' },
      ]);
    });

    it("a single-year term has no 'multi-year' slices", () => {
      const { items } = queryCommitments([oneTime], {
        ...wideQuery,
        valuation: 'annual',
        recognition: 'term-start',
      });
      expect(items).toEqual([
        { period: '2026-03', groupKey: '2', value: 8000, kind: 'new' },
      ]);
    });
  });

  describe('recognition date', () => {
    // ICE #3047 shape: Dec-ending term, 90-day cancel window — the renewal
    // binds in October, not at the January term start.
    const cancelBy = makeContract({
      id: 3,
      termStart: '2026-01-01',
      termEnd: '2026-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 12,
      cancelByDays: 90,
      products: [{ product_id: 300, year: 1, fees: 5000 }],
    });

    it('a renewal recognizes at the cancel-by deadline (term end − offset days)', () => {
      const { items } = queryCommitments([cancelBy], wideQuery);
      const renewals = items.filter((i) => i.kind === 'renewal');
      // 2026-12-31 − 90d = 2026-10-02; next cycle 2027-12-31 − 90d = 2027-10-02.
      expect(renewals.map((i) => i.period)).toEqual(['2026-10', '2027-10']);
    });

    it('recognition decides window membership', () => {
      const { items } = queryCommitments([cancelBy], {
        ...wideQuery,
        window: { fiscalYear: 2026 },
      });
      expect(
        items.filter((i) => i.kind === 'renewal').map((i) => i.period),
      ).toEqual(['2026-10']);
    });

    it('the new event ignores the cancel-by offset', () => {
      const { items } = queryCommitments([cancelBy], wideQuery);
      expect(items.filter((i) => i.kind === 'new')).toEqual([
        { period: '2026-01', groupKey: '3', value: 5000, kind: 'new' },
      ]);
    });

    it('no offset means recognition at the new term start', () => {
      const { items } = queryCommitments([multiYear], wideQuery);
      const renewals = items.filter((i) => i.kind === 'renewal');
      expect(renewals[0].period).toBe('2027-01');
    });
  });

  describe("recognition: 'term-start' (psk-1844 Contract Term)", () => {
    const cancelBy = makeContract({
      id: 3,
      termStart: '2026-01-01',
      termEnd: '2026-12-31',
      subscriptionTerm: 12,
      renewalPeriod: 12,
      cancelByDays: 90,
      products: [{ product_id: 300, year: 1, fees: 5000 }],
    });

    it('keeps every renewal on its own cycle start despite the offset', () => {
      const { items } = queryCommitments([cancelBy], {
        ...wideQuery,
        recognition: 'term-start',
      });
      // Under the default the 2027 cycle recognizes at 2026-10 and a padded
      // horizon adds the 2028 cycle at 2027-10; term-start dating has neither.
      expect(
        items.filter((i) => i.kind === 'renewal').map((i) => i.period),
      ).toEqual(['2027-01']);
    });

    // The engine property relating the two placements: with 'annual'
    // valuation, term-start commitments place every dollar exactly where
    // basis:'committed' does — the deadline shift is the ONLY thing that
    // separates recognized commitments from committed spend. (The overview
    // uses cancel-by recognition by decision; this mode documents and pins
    // the relationship.)
    it("with 'annual' valuation matches basis:'committed' per period and group", () => {
      const contracts = [cancelBy, multiYear, oneTime];
      const sums = (
        items: Array<{ period: string; groupKey: string; value: number }>,
      ) => {
        const byKey = new Map<string, number>();
        for (const item of items) {
          const key = `${item.period}|${item.groupKey}`;
          byKey.set(key, (byKey.get(key) ?? 0) + item.value);
        }
        return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b));
      };

      const committed = querySpend(contracts, {
        ...wideQuery,
        basis: 'committed',
        source: 'expected',
      });
      const commitments = queryCommitments(contracts, {
        ...wideQuery,
        valuation: 'annual',
        recognition: 'term-start',
      });

      expect(sums(commitments.items)).toEqual(sums(committed.items));
      expect(commitments.items.some((i) => i.kind === 'new')).toBe(true);
      expect(commitments.items.some((i) => i.kind === 'renewal')).toBe(true);
    });
  });
});
