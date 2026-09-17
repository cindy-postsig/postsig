import { jest } from '@jest/globals';

/**
 * Task 4.1: an invoice billed against several service orders reconciled only
 * against its hierarchy parent, so every line sourced from a `'billing'` parent
 * fell through to `unmatchedProducts` and was reported as a discrepancy the
 * vendor never caused.
 *
 * Expected products are now the union across the hierarchy parent and every
 * active billing parent. The reconciliation stays anchored to the hierarchy
 * parent (currency, frequency, term), so this is one reconciliation per
 * invoice, not one per parent.
 */

jest.mock('@/lib/v2/core/fxRates', () => {
  const actual = jest.requireActual<typeof import('@/lib/v2/core/fxRates')>(
    '@/lib/v2/core/fxRates',
  );
  return {
    __esModule: true,
    ...actual,
    getDailyUsdRates: async () => new Map(),
    getLatestUsdRates: async () => ({ USD: 1 }),
  };
});

jest.mock('@/data/users', () => ({
  __esModule: true,
  getEffectiveBaseCurrency: async () => 'USD',
}));

import { processInvoiceData } from '@/lib/v2/reports/transforms/invoices';
import {
  buildSegmentFeeContext,
  type SegmentFeeContext,
} from '@/lib/v2/reports/transforms/expectedSegments';

interface InvoiceResult {
  expectedInvoiceAmount: number;
  invoiceAmount: number;
  discrepancy: number;
  hasUnmatchedProducts: boolean;
  unmatchedProducts?: Array<{ product_id: number | string }>;
  matchedProducts?: Array<{
    product_id: number | string;
    parent_fee: number;
    expectedInvoiceAmount: number;
  }>;
  parentContract?: { id: number };
  parentBillingFrequency?: string;
}

async function run(
  invoice: unknown,
  segmentCtx?: SegmentFeeContext,
): Promise<InvoiceResult> {
  return (await processInvoiceData(
    invoice,
    segmentCtx,
  )) as unknown as InvoiceResult;
}

/** A service order pricing one product at `fee`. */
function serviceOrder(id: number, productId: number, fee: string) {
  return {
    id,
    currency: 'USD',
    billing_frequency: 'Annually',
    subscription_term: 12,
    annual_increase: 0,
    renewal_type: 'Auto',
    term_start_date: [{ date: '2024-01-01' }],
    vendor_products_details: [{ product_id: productId, year: 1, fees: fee }],
  };
}

const SO_A = serviceOrder(10, 1, '1000');
const SO_B = serviceOrder(20, 2, '500');

/** Invoice billing both products, one from each service order. */
function invoiceAcross(relationships: unknown[]) {
  return {
    id: 200,
    type_id: 6,
    currency: 'USD',
    billing_frequency: 'Annually',
    term_start_date: [{ date: '2024-06-01' }],
    vendor_products_details: [
      { product_id: 1, fees: '1000' },
      { product_id: 2, fees: '500' },
    ],
    contract_relationships: relationships,
  };
}

const HIERARCHY_EDGE = {
  active: true,
  disabled: false,
  relationship_type: null,
  parent: SO_A,
};
const BILLING_EDGE = {
  active: true,
  disabled: false,
  relationship_type: 'billing',
  parent: SO_B,
};

describe('invoice reconciliation across billing parents', () => {
  it('reports no discrepancy when an active billing edge supplies the other lines', async () => {
    const result = await run(invoiceAcross([HIERARCHY_EDGE, BILLING_EDGE]));

    expect(result.hasUnmatchedProducts).toBe(false);
    expect(result.unmatchedProducts).toEqual([]);
    expect(result.expectedInvoiceAmount).toBe(1500);
    expect(result.invoiceAmount).toBe(1500);
    expect(result.discrepancy).toBe(0);
  });

  it('falls back to today’s single-parent result when the billing edge is inactive', async () => {
    const result = await run(
      invoiceAcross([HIERARCHY_EDGE, { ...BILLING_EDGE, active: false }]),
    );

    // Product 2 has no qualifying parent, so it stays an unmatched line.
    expect(result.hasUnmatchedProducts).toBe(true);
    expect(result.unmatchedProducts?.map((p) => p.product_id)).toEqual([2]);
    expect(result.expectedInvoiceAmount).toBe(1000);
    expect(result.discrepancy).toBe(500);
  });

  it('ignores a disabled billing edge the same way', async () => {
    const result = await run(
      invoiceAcross([HIERARCHY_EDGE, { ...BILLING_EDGE, disabled: true }]),
    );

    expect(result.unmatchedProducts?.map((p) => p.product_id)).toEqual([2]);
  });

  it('still flags a genuinely mismatched line', async () => {
    // Product 2 is billed at 700 but SO-B prices it at 500 — a real gap that
    // must survive the union.
    const invoice = invoiceAcross([HIERARCHY_EDGE, BILLING_EDGE]);
    invoice.vendor_products_details[1].fees = '700';

    const result = await run(invoice);

    expect(result.hasUnmatchedProducts).toBe(false);
    expect(result.expectedInvoiceAmount).toBe(1500);
    expect(result.invoiceAmount).toBe(1700);
    expect(result.discrepancy).toBe(200);
  });

  it('still flags a line no parent prices at all', async () => {
    const invoice = invoiceAcross([HIERARCHY_EDGE, BILLING_EDGE]);
    invoice.vendor_products_details.push({ product_id: 9, fees: '42' });

    const result = await run(invoice);

    expect(result.unmatchedProducts?.map((p) => p.product_id)).toEqual([9]);
  });

  it('anchors the reconciliation to the hierarchy parent, not the billing one', async () => {
    // Edge order is Postgres's, so the billing edge arriving first must not
    // make SO-B the reported parent.
    const result = await run(invoiceAcross([BILLING_EDGE, HIERARCHY_EDGE]));

    expect(result.parentContract?.id).toBe(SO_A.id);
    expect(result.discrepancy).toBe(0);
  });

  it('anchors to the lowest-id billing parent when no hierarchy edge exists, in either edge order', async () => {
    // All qualifying edges are billing edges, so the anchor falls to the
    // lowest-id parent — SO-A (id 10) — regardless of fetch row order.
    const billingA = { ...BILLING_EDGE, parent: SO_A };
    const abOrder = await run(invoiceAcross([billingA, BILLING_EDGE]));
    const baOrder = await run(invoiceAcross([BILLING_EDGE, billingA]));

    for (const result of [abOrder, baOrder]) {
      expect(result.parentContract?.id).toBe(SO_A.id);
      expect(result.expectedInvoiceAmount).toBe(1500);
      expect(result.discrepancy).toBe(0);
    }
  });

  it('ignores a qualifying edge with no embedded parent instead of losing the valid one', async () => {
    // A parentless edge cannot anchor; arriving last it must not displace the
    // valid billing parent and skip the reconciliation outright.
    const parentless = { ...BILLING_EDGE, parent: null };
    const invoice = {
      id: 200,
      type_id: 6,
      currency: 'USD',
      billing_frequency: 'Annually',
      term_start_date: [{ date: '2024-06-01' }],
      vendor_products_details: [{ product_id: 2, fees: '500' }],
      contract_relationships: [BILLING_EDGE, parentless],
    };

    const result = await run(invoice);

    expect(result.parentContract?.id).toBe(SO_B.id);
    expect(result.expectedInvoiceAmount).toBe(500);
    expect(result.discrepancy).toBe(0);
  });

  it('never lets a billing parent displace the hierarchy parent’s fee', async () => {
    // Both parents price product 1. The billing parent's row is year 2, which
    // is the year this invoice falls in, so pooling both parents' rows would
    // let selectParentRowForYear pick 9999 over the hierarchy parent's 1000.
    const contestedB = serviceOrder(20, 1, '9999');
    contestedB.vendor_products_details = [
      { product_id: 1, year: 2, fees: '9999' },
    ];
    const invoice = {
      id: 200,
      type_id: 6,
      currency: 'USD',
      billing_frequency: 'Annually',
      // Year 2 of the parents' 2024-01-01 term.
      term_start_date: [{ date: '2025-06-01' }],
      vendor_products_details: [{ product_id: 1, fees: '1000' }],
      contract_relationships: [
        HIERARCHY_EDGE,
        { ...BILLING_EDGE, parent: contestedB },
      ],
    };

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(1000);
    expect(result.discrepancy).toBe(0);
  });

  it('does not let a billing parent’s per-year rows re-shape the hierarchy parent’s term', async () => {
    // SO-B prices its OWN product across years. That says nothing about SO-A's
    // term shape, but reading it as "the parent has per-year rows" would send
    // resolveFeeSpanMonths down the mixed-shape branch (subscription_term)
    // instead of the pure single-row one, halving the fee's span and doubling
    // product 1's expected amount.
    //
    // SO-A quotes 1800 once over an 18-month recorded span with a 6-month
    // subscription_term — a span annualFeeRepeats does not repeat, so the pure
    // single-row branch spreads the fee over all 18 months and the annually
    // billed invoice expects 12 of them: 1200. A leaked mixed-shape read
    // spreads it over subscription_term (6) instead and expects 3600 — the
    // billing parent's product-2 rows silently tripling product 1.
    const spanA = {
      ...serviceOrder(10, 1, '1800'),
      subscription_term: 6,
      term_start_date: [{ date: '2024-01-01' }],
      term_end_date: [{ date: '2025-06-30' }],
    };
    const perYearB = serviceOrder(20, 2, '500');
    perYearB.vendor_products_details = [
      { product_id: 2, year: 1, fees: '500' },
      { product_id: 2, year: 2, fees: '600' },
    ];
    const invoice = {
      id: 200,
      type_id: 6,
      currency: 'USD',
      billing_frequency: 'Annually',
      term_start_date: [{ date: '2024-06-01' }],
      vendor_products_details: [{ product_id: 1, fees: '1200' }],
      contract_relationships: [
        { ...HIERARCHY_EDGE, parent: spanA },
        { ...BILLING_EDGE, parent: perYearB },
      ],
    };

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(1200);
    expect(result.discrepancy).toBe(0);
    expect(result.hasUnmatchedProducts).toBe(false);
  });

  it('prices a product two billing parents both list from the lowest-id parent, in either edge order', async () => {
    // SO-B (id 20) and SO-C (id 30) both price product 3 in the invoice's
    // year. The relationship fetch has no ORDER BY, so edge order must not
    // decide whose row selectParentRowForYear picks — the lowest-id parent
    // supplies it, mirroring the anchor fallback rule.
    const contestedB = serviceOrder(20, 3, '500');
    const contestedC = serviceOrder(30, 3, '800');
    const withBillingParents = (parents: unknown[]) => ({
      id: 200,
      type_id: 6,
      currency: 'USD',
      billing_frequency: 'Annually',
      term_start_date: [{ date: '2024-06-01' }],
      vendor_products_details: [
        { product_id: 1, fees: '1000' },
        { product_id: 3, fees: '500' },
      ],
      contract_relationships: [
        HIERARCHY_EDGE,
        ...parents.map((parent) => ({ ...BILLING_EDGE, parent })),
      ],
    });

    const bFirst = await run(withBillingParents([contestedB, contestedC]));
    const cFirst = await run(withBillingParents([contestedC, contestedB]));

    for (const result of [bFirst, cFirst]) {
      expect(result.expectedInvoiceAmount).toBe(1500);
      expect(result.discrepancy).toBe(0);
      expect(result.hasUnmatchedProducts).toBe(false);
    }
  });

  it('leaves a single-parent invoice byte-identical', async () => {
    const single = {
      id: 200,
      type_id: 6,
      currency: 'USD',
      billing_frequency: 'Annually',
      term_start_date: [{ date: '2024-06-01' }],
      vendor_products_details: [{ product_id: 1, fees: '1000' }],
      contract_relationships: [HIERARCHY_EDGE],
    };

    const result = await run(single);

    expect(result.expectedInvoiceAmount).toBe(1000);
    expect(result.discrepancy).toBe(0);
    expect(result.hasUnmatchedProducts).toBe(false);
  });

  it('treats an edge with no relationship_type as the hierarchy parent', async () => {
    // Every pre-existing row predates the column and reads as a hierarchy edge.
    const legacy = {
      id: 200,
      type_id: 6,
      currency: 'USD',
      billing_frequency: 'Annually',
      term_start_date: [{ date: '2024-06-01' }],
      vendor_products_details: [{ product_id: 1, fees: '1000' }],
      contract_relationships: [{ active: true, disabled: false, parent: SO_A }],
    };

    const result = await run(legacy);

    expect(result.parentContract?.id).toBe(SO_A.id);
    expect(result.expectedInvoiceAmount).toBe(1000);
  });

  /**
   * The transform cannot distinguish "no relationship_type column was selected"
   * from "this is a hierarchy edge" — `undefined == null` for both, which is
   * what the test above pins for legacy rows. So the guarantee that billing
   * parents survive belongs to the FETCH: every select feeding this transform
   * must ask for the column. That is asserted in
   * `__tests__/v2/report-relationship-select.test.ts`.
   *
   * Contract 45 hit exactly this: the report's fetch omitted the column, both
   * of its edges read as hierarchy edges, `billingParentRows` found no billing
   * parents, and three of four invoice lines were flagged as unexpected
   * products against a $1,250 expected total on $13,926 billed (+1014%).
   */
});

/**
 * A billing parent names a DIFFERENT service order, which carries its own term
 * length, currency, billing frequency and annual increase. Pricing its products
 * off the hierarchy parent's terms is wrong whenever the two disagree.
 *
 * Production case (org 4d2bdb8f…, invoice 3056): contract 3047 is the hierarchy
 * parent (Quarterly, subscription_term 36) and prices products 3784-3787;
 * contract 3048 is the billing parent (Annually, subscription_term 12) and is
 * the only contract pricing product 3790, at $5,000/yr. The invoice bills 3790
 * for one quarter at $1,250.
 *
 * Reported: expected $416.67 against $1,250 billed — a phantom $833.33
 * discrepancy. $5,000 spread over the HIERARCHY parent's 36 months instead of
 * the owner's 12: 5000/36 × 3 = 416.67, where 5000/12 × 3 = 1250 is correct.
 *
 * Two independent defects produce it:
 *   1. `segmentFee` is forced to null. The gate reads
 *      `hasPerYearRows || !parentHasPerYearRows`; 3790 has one row and 3047 has
 *      per-year rows for its OWN products, so the resolver — which returns the
 *      correct {fee: 5000, spanMonths: 12} — is never consulted.
 *   2. The span then falls back to the hierarchy parent's subscription_term.
 *
 * Every test above runs WITHOUT a segment context, but both production call
 * sites always pass one (definitions/invoices.ts, processing.ts). These cases
 * pin both paths so the fix cannot regress either.
 */
describe('billing-parent products price against their own parent', () => {
  /** Enriched shape buildSpendLineageFromEnriched consumes. */
  function enriched(contract: {
    id: number;
    vendor_products_details: unknown[];
  }) {
    const seen = new Set<number>();
    const products = [];
    for (const row of contract.vendor_products_details as Array<{
      product_id: number;
    }>) {
      if (seen.has(row.product_id)) continue;
      seen.add(row.product_id);
      products.push({
        product_id: row.product_id,
        sourceContractId: contract.id,
        isSuperseding: false,
      });
    }
    return { id: contract.id, contract, products, isLinkedChildInvoice: false };
  }

  function segmentContext(
    ...contracts: Array<{ id: number; vendor_products_details: unknown[] }>
  ): SegmentFeeContext {
    return buildSegmentFeeContext(
      contracts.map(enriched) as never,
      [] as never,
      undefined,
      new Date('2026-08-20'),
      new Date('2029-08-20'),
    );
  }

  /** Contract 3047 — hierarchy parent, 3-year term, per-year rows. */
  const HIERARCHY_3047 = {
    id: 3047,
    currency: 'USD',
    billing_frequency: 'Quarterly',
    subscription_term: 36,
    annual_increase: 0,
    renewal_type: 'Auto',
    type_id: 2,
    term_start_date: [{ date: '2024-01-01' }],
    term_end_date: [{ date: '2026-12-31' }],
    vendor_products_details: [
      { product_id: 3784, year: 1, fees: '35000', one_time_only: false },
      { product_id: 3784, year: 2, fees: '40000', one_time_only: false },
      { product_id: 3784, year: 3, fees: '40000', one_time_only: false },
    ],
  };

  /** Contract 3048 — billing parent, annual term, sole owner of 3790. */
  const BILLING_3048 = {
    id: 3048,
    currency: 'USD',
    billing_frequency: 'Annually',
    subscription_term: 12,
    annual_increase: 0,
    renewal_type: 'Auto',
    type_id: 2,
    term_start_date: [{ date: '2025-10-01' }, { date: '2024-10-01' }],
    term_end_date: [{ date: '2026-09-30' }, { date: '2025-09-30' }],
    vendor_products_details: [
      { product_id: 3790, year: 1, fees: '5000', one_time_only: false },
    ],
  };

  /** Invoice 3056 — one quarter, billing 3790 at $1,250. */
  function invoice3056(products = [{ product_id: 3790, fees: '1250' }]) {
    return {
      id: 3056,
      type_id: 6,
      currency: 'USD',
      billing_frequency: 'Quarterly',
      term_start_date: [{ date: '2025-01-01' }],
      term_end_date: [{ date: '2025-03-31' }],
      vendor_products_details: products,
      contract_relationships: [
        {
          active: true,
          disabled: false,
          relationship_type: null,
          parent: HIERARCHY_3047,
        },
        {
          active: true,
          disabled: false,
          relationship_type: 'billing',
          parent: BILLING_3048,
        },
      ],
    };
  }

  it('prices product 3790 over its own 12-month term, not the hierarchy parent’s 36 (legacy path)', async () => {
    const result = await run(invoice3056());

    // 5000/12 × 3 = 1250, NOT 5000/36 × 3 = 416.67.
    expect(result.expectedInvoiceAmount).toBeCloseTo(1250, 2);
    expect(result.discrepancy).toBeCloseTo(0, 2);
  });

  it('prices product 3790 over its own 12-month term (segment path — what production runs)', async () => {
    const result = await run(
      invoice3056(),
      segmentContext(HIERARCHY_3047, BILLING_3048),
    );

    expect(result.expectedInvoiceAmount).toBeCloseTo(1250, 2);
    expect(result.discrepancy).toBeCloseTo(0, 2);
  });

  it('converts a billing parent’s fee from ITS currency, not the hierarchy parent’s', async () => {
    // Same numbers, but the owner prices in EUR. With the mocked 1:1 rates the
    // expected amount is unchanged; what this pins is that the conversion reads
    // the OWNER's currency — reading 'USD' off the hierarchy parent for a fee
    // denominated in EUR is the PSK-1796 violation.
    const eurOwner = { ...BILLING_3048, currency: 'EUR' };
    const inv = invoice3056();
    inv.contract_relationships[1].parent = eurOwner;

    const result = await run(inv, segmentContext(HIERARCHY_3047, eurOwner));

    expect(result.expectedInvoiceAmount).toBeCloseTo(1250, 2);
  });

  it('uses the billing parent’s own billing frequency for its products', async () => {
    // The owner bills Monthly: one month of a $5,000 annual fee is 416.67, and
    // the invoice bills exactly that. Reading the hierarchy parent's Quarterly
    // frequency instead would expect a quarter — 1250 — and invent a gap.
    const monthlyOwner = { ...BILLING_3048, billing_frequency: 'Monthly' };
    const inv = {
      ...invoice3056([{ product_id: 3790, fees: '416.67' }]),
      billing_frequency: 'Monthly',
    };
    inv.contract_relationships[1].parent = monthlyOwner;

    const result = await run(inv, segmentContext(HIERARCHY_3047, monthlyOwner));

    expect(result.expectedInvoiceAmount).toBeCloseTo(416.67, 1);
    expect(result.discrepancy).toBeCloseTo(0, 1);
  });

  it('reads annual_increase from the owning parent, not the hierarchy parent', async () => {
    // Compounding is driven by calculateRenewalCount, which measures elapsed
    // renewals against TODAY rather than the invoice date. The clock is pinned
    // so the count is deterministic: 2026-06-15 is far enough past 3048's
    // original 2024-10-01 start for at least one renewal to have elapsed, which
    // is what makes the increase observable at all.
    //
    // The assertion stays a comparison rather than a fixed compounded figure —
    // the exact multiplier is calculateRenewalCount's business, while what this
    // test owns is WHICH contract supplies annual_increase. The owner's 200% is
    // unmissable if read; the hierarchy parent's 0 leaves the two runs equal.
    //
    // Legacy path only: on the segment path the resolver owns compounding and
    // `segmentFee.fee` bypasses compoundedNativeFee entirely.
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00Z'));
    try {
      const flatOwner = { ...BILLING_3048, annual_increase: 0 };
      const risingOwner = { ...BILLING_3048, annual_increase: 200 };

      const withFlat = invoice3056();
      withFlat.contract_relationships[1].parent = flatOwner;
      const withRising = invoice3056();
      withRising.contract_relationships[1].parent = risingOwner;

      const flat = await run(withFlat);
      const rising = await run(withRising);

      // The hierarchy parent's annual_increase is 0 in both runs, so any
      // difference can only come from the owner's.
      expect(rising.expectedInvoiceAmount).toBeGreaterThan(
        flat.expectedInvoiceAmount,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves hierarchy-parent products untouched', async () => {
    // The regression guard: 3784 is priced by the hierarchy parent and must be
    // byte-identical after the fix. Year 2 of 3047's term is 40000/yr; the
    // invoice bills one quarter of it.
    const inv = invoice3056([
      { product_id: 3784, fees: '10000' },
      { product_id: 3790, fees: '1250' },
    ]);

    const result = await run(inv, segmentContext(HIERARCHY_3047, BILLING_3048));
    const p3784 = result.matchedProducts?.find((p) => p.product_id === 3784);

    expect(p3784?.parent_fee).toBe(40000);
    expect(p3784?.expectedInvoiceAmount).toBeCloseTo(10000, 2);
    // Invoice-level anchoring is unchanged: still the hierarchy parent.
    expect(result.parentContract?.id).toBe(3047);
    expect(result.parentBillingFrequency).toBe('Quarterly');
  });

  it('prices a billing parent’s per-year product exactly as the same contract would alone', async () => {
    // The reverse of the reported bug, and the second of only two input
    // combinations the owner-anchored gate changes: the product is single-row
    // on a billing parent that HAS per-year rows, while the hierarchy parent is
    // pure single-row.
    //
    // Before, `expectedPeriodFee` was handed the HIERARCHY parent's id for a
    // product that parent does not price. It returned null and the legacy walk
    // took over. That produced a plausible-looking number by accident — the
    // same accident class that produced the $416.67 this suite fixes — and it
    // disagreed with how every other spend surface prices the identical
    // contract.
    //
    // The invariant pinned here is CONSISTENCY, not a magic constant: a product
    // owned by a billing parent must price exactly as it would if that same
    // contract were the invoice's only parent. The absolute figure is the
    // resolver's own reading of per-year rows (it spans them as one segment at
    // the year-1 fee) and predates this change — asserting it directly would
    // pin unrelated resolver behavior into this suite.
    const perYearOwner = {
      id: 4100,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      type_id: 2,
      term_start_date: [{ date: '2024-01-01' }],
      term_end_date: [{ date: '2026-12-31' }],
      vendor_products_details: [
        { product_id: 4200, year: 1, fees: '500', one_time_only: false },
        { product_id: 4200, year: 2, fees: '600', one_time_only: false },
      ],
    };
    const pureHierarchy = {
      ...HIERARCHY_3047,
      id: 4000,
      vendor_products_details: [
        { product_id: 4001, year: 1, fees: '1000', one_time_only: false },
      ],
    };
    const billed = [{ product_id: 4200, fees: '600' }];

    // Same invoice, same owning contract — once reached through a billing edge
    // beside a pure single-row hierarchy parent, once as the sole parent.
    const viaBillingEdge = {
      ...invoice3056(billed),
      billing_frequency: 'Annually',
      term_start_date: [{ date: '2025-06-01' }],
      contract_relationships: [
        {
          active: true,
          disabled: false,
          relationship_type: null,
          parent: pureHierarchy,
        },
        {
          active: true,
          disabled: false,
          relationship_type: 'billing',
          parent: perYearOwner,
        },
      ],
    };
    const asSoleParent = {
      ...viaBillingEdge,
      contract_relationships: [
        {
          active: true,
          disabled: false,
          relationship_type: null,
          parent: perYearOwner,
        },
      ],
    };

    const multi = await run(
      viaBillingEdge,
      segmentContext(pureHierarchy, perYearOwner),
    );
    const single = await run(asSoleParent, segmentContext(perYearOwner));

    expect(multi.expectedInvoiceAmount).toBeCloseTo(
      single.expectedInvoiceAmount,
      2,
    );
    expect(multi.discrepancy).toBeCloseTo(single.discrepancy, 2);
    // And the hierarchy parent's own term shape must not leak in: its
    // subscription_term is 36 against the owner's 12.
    expect(multi.hasUnmatchedProducts).toBe(false);
  });

  it('falls back to the hierarchy parent when a product has no resolvable owner', async () => {
    // A product the hierarchy parent prices has no billing-parent owner to
    // find; resolution must fall back rather than throw.
    const inv = invoice3056([{ product_id: 3784, fees: '10000' }]);

    const result = await run(inv, segmentContext(HIERARCHY_3047, BILLING_3048));

    expect(result.expectedInvoiceAmount).toBeCloseTo(10000, 2);
    expect(result.hasUnmatchedProducts).toBe(false);
  });
});
