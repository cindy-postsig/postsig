import type { Contract } from '@/app/lib/budget/types';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import {
  buildEngineSpendByContract,
  EMPTY_LINEAGE,
  lineageFor,
  queryCommitments,
  resolveFeeSegments,
  type SpendEventQuery,
} from '@/lib/v2/spend';

interface Spec {
  id: number;
  /** Every recorded term start, oldest first. */
  termStarts: string[];
  /** Every recorded term end, oldest first. */
  termEnds: string[];
  subscriptionTerm?: number;
  renewalPeriod?: number;
  willNotRenew?: boolean;
  fees?: number;
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
    subscription_term: spec.subscriptionTerm ?? 12,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: 'Auto',
    billing_frequency: 'Annually',
    will_not_renew: spec.willNotRenew ?? false,
    term_start_date: spec.termStarts.map((date) => ({ date })),
    term_end_date: spec.termEnds.map((date) => ({ date })),
    cancel_date: [],
    cancel_by_date: null,
    vendor_products_details: [
      {
        product_id: 100,
        year: 1,
        fees: spec.fees ?? 80000,
        vendor_products: { id: 100, name: 'Product 100' },
      },
    ],
    vendors: { name: 'Test Vendor' },
  } as unknown as Contract;
}

// Mid-FY2026 on a January fiscal year, so "ends within the current fiscal
// year" can be either side of today.
const asOf = new Date(Date.UTC(2026, 8, 15));
const usd = { mode: 'preconverted-usd' } as const;
const fiscal = { startMonth: 1 };

function segmentsOf(contract: Contract) {
  return resolveFeeSegments(contract, lineageFor(EMPTY_LINEAGE, contract.id), {
    asOf,
    horizonStart: new Date(0),
    horizonEnd: new Date(Date.UTC(2031, 0, 1)),
    currency: usd,
  });
}

// The pair the budget table stamps as Current Spend / Projected Spend: FY
// start-dated commitments over currentFY and nextFY.
function commitmentTotal(
  contract: Contract,
  window: 'currentFY' | 'nextFY',
  fiscalConfig = fiscal,
) {
  const query: SpendEventQuery = {
    window,
    granularity: 'year',
    groupBy: 'contract',
    currency: usd,
    fiscalConfig,
    asOf,
  };
  return queryCommitments([contract], {
    ...query,
    valuation: 'annual',
    recognition: 'term-start',
  }).items.reduce((sum, item) => sum + item.value, 0);
}

describe('will-not-renew stops the renewal projection at the cycle in force', () => {
  it('projects nothing past the recorded term when it ends after today', () => {
    const contract = makeContract({
      id: 1,
      termStarts: ['2025-12-01'],
      termEnds: ['2026-11-30'],
      willNotRenew: true,
    });

    expect(
      segmentsOf(contract).filter((s) => s.source === 'renewal-projection'),
    ).toEqual([]);
    expect(commitmentTotal(contract, 'nextFY')).toBe(0);
  });

  // asOf carries a wall clock in production. Capping the horizon at asOf plus
  // a day without normalizing to midnight lands at tomorrow's same hour, which
  // still sits after a term starting tomorrow at midnight — so the cycle the
  // flag exists to suppress was emitted anyway.
  it('excludes a cycle starting the day after a mid-afternoon asOf', () => {
    const afternoon = new Date(2026, 8, 15, 15, 30);
    const contract = makeContract({
      id: 7,
      termStarts: ['2025-09-16'],
      termEnds: ['2026-09-15'],
      willNotRenew: true,
    });

    const segments = resolveFeeSegments(
      contract,
      lineageFor(EMPTY_LINEAGE, contract.id),
      {
        asOf: afternoon,
        horizonStart: new Date(0),
        horizonEnd: new Date(Date.UTC(2031, 0, 1)),
        currency: usd,
      },
    );

    expect(segments.filter((s) => s.source === 'renewal-projection')).toEqual(
      [],
    );
  });

  // The reported bug: the engine commits only the EARLIEST recorded term and
  // regenerates the rest, so a contract that has already renewed had an
  // initial term end in the past and the flag was never consulted.
  it('honours the flag on a contract that has already renewed', () => {
    const contract = makeContract({
      id: 2,
      termStarts: ['2024-12-01', '2025-12-01'],
      termEnds: ['2025-11-30', '2026-11-30'],
      renewalPeriod: 12,
      willNotRenew: true,
    });

    // The cycle running today is still resolved — it is a recorded term the
    // engine regenerates — but nothing follows it.
    expect(segmentsOf(contract).map((s) => [s.from, s.to, s.source])).toEqual([
      ['2024-12-01', '2025-12-01', 'year-entry'],
      ['2025-12-01', '2026-12-01', 'renewal-projection'],
    ]);
    expect(commitmentTotal(contract, 'nextFY')).toBe(0);
  });

  it('keeps the projected cycle running today when the recorded term has lapsed', () => {
    const contract = makeContract({
      id: 3,
      termStarts: ['2025-07-01'],
      termEnds: ['2026-06-30'],
      willNotRenew: true,
    });

    expect(segmentsOf(contract).map((s) => [s.from, s.to, s.source])).toEqual([
      ['2025-07-01', '2026-07-01', 'year-entry'],
      ['2026-07-01', '2027-07-01', 'renewal-projection'],
    ]);
    // That cycle starts in FY2026, so it is current spend, not projected.
    expect(commitmentTotal(contract, 'currentFY')).toBe(80000);
    expect(commitmentTotal(contract, 'nextFY')).toBe(0);
  });

  // The contract from the report, on its org's October fiscal year: the term
  // running today started inside the current FY, so Current Spend keeps the
  // in-force annual fee while Projected Spend drops to zero — the pair the
  // MCP tools report off the legacy price-history reader.
  it('reports the in-force fee as current and nothing as projected', () => {
    const october = { startMonth: 10 };
    const contract = makeContract({
      id: 5,
      termStarts: ['2024-10-23', '2025-10-23'],
      termEnds: ['2025-10-22', '2026-10-22'],
      renewalPeriod: 12,
      willNotRenew: true,
      fees: 4600,
    });

    expect(commitmentTotal(contract, 'currentFY', october)).toBe(4600);
    expect(commitmentTotal(contract, 'nextFY', october)).toBe(0);
  });

  // The row from the report: a single recorded term running today, flagged.
  // Projected Spend was already 0 (the flag fires on an unrenewed contract);
  // Current Spend read 0 only because the term STARTED in the previous FY,
  // leaving nothing recognised in this one on a contract plainly still
  // running. MCP reports 4,600 / 0 off the legacy reader, and the stamps that
  // fill the two columns now agree with it.
  it('stamps the in-force fee as current on a term that began last FY', () => {
    const contract = makeContract({
      id: 6,
      termStarts: ['2025-10-23'],
      termEnds: ['2026-10-22'],
      willNotRenew: true,
      fees: 4600,
    });
    const record: ContractWithPricing = {
      id: contract.id as number,
      vendor_id: 10,
      vendor_name: 'Trademo Technologies Inc',
      contract,
      products: [],
      priceHistory: null,
      isLinkedChildInvoice: false,
    };

    const stamp = buildEngineSpendByContract([record], [], fiscal, asOf, {
      currency: usd,
    }).get(contract.id as number);

    expect(stamp?.currentNative).toBe(4600);
    expect(stamp?.projectedNative).toBe(0);
  });

  // The in-force fallback must not put the flag's own money back: a flagged
  // term still running when next FY opens would otherwise report a full annual
  // fee as projected spend — the forward commitment the flag denies.
  it('keeps projected at zero when the flagged term runs into next FY', () => {
    const contract = makeContract({
      id: 8,
      termStarts: ['2026-04-01'],
      termEnds: ['2027-03-31'],
      willNotRenew: true,
      fees: 4600,
    });
    const record: ContractWithPricing = {
      id: contract.id as number,
      vendor_id: 10,
      vendor_name: 'Test Vendor',
      contract,
      products: [],
      priceHistory: null,
      isLinkedChildInvoice: false,
    };

    const stamp = buildEngineSpendByContract([record], [], fiscal, asOf, {
      currency: usd,
      productValues: true,
    }).get(contract.id as number);

    expect(stamp?.currentNative).toBe(4600);
    expect(stamp?.projectedNative).toBe(0);
    // Sub-rows follow the parent, so the product stamp must be zero too.
    expect(stamp?.products?.[100]?.projectedNative ?? 0).toBe(0);
  });

  it('leaves an unflagged contract projecting to the caller horizon', () => {
    const contract = makeContract({
      id: 4,
      termStarts: ['2024-12-01', '2025-12-01'],
      termEnds: ['2025-11-30', '2026-11-30'],
      renewalPeriod: 12,
    });

    expect(
      segmentsOf(contract).filter((s) => s.source === 'renewal-projection')
        .length,
    ).toBeGreaterThan(1);
    expect(commitmentTotal(contract, 'nextFY')).toBe(80000);
  });
});
