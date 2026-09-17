import { jest } from '@jest/globals';

const mockGetDailyUsdRates =
  jest.fn<
    (
      quotes: string[],
      from: string,
      to: string,
    ) => Promise<Map<string, Map<string, number>>>
  >();
const mockGetLatestUsdRates =
  jest.fn<(quotes: string[]) => Promise<Record<string, number>>>();

jest.mock('@/lib/v2/core/fxRates', () => {
  const actual = jest.requireActual<typeof import('@/lib/v2/core/fxRates')>(
    '@/lib/v2/core/fxRates',
  );
  return {
    __esModule: true,
    ...actual,
    getDailyUsdRates: (quotes: string[], from: string, to: string) =>
      mockGetDailyUsdRates(quotes, from, to),
    getLatestUsdRates: (quotes: string[]) => mockGetLatestUsdRates(quotes),
  };
});

const mockGetEffectiveBaseCurrency = jest.fn<() => Promise<string>>();

jest.mock('@/data/users', () => ({
  __esModule: true,
  getEffectiveBaseCurrency: () => mockGetEffectiveBaseCurrency(),
  // No org in unit tests: the default segment context resolves to undefined,
  // so ctx-less calls exercise the legacy fallback deliberately.
  getUserMetadata: () => Promise.resolve(null),
}));

import { processInvoiceData } from '@/lib/v2/reports/transforms/invoices';
import {
  buildSegmentFeeContext,
  type SegmentFeeContext,
} from '@/lib/v2/reports/transforms/expectedSegments';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import { invoicesReport } from '@/lib/v2/reports/definitions/invoices';
import { calculateContractYear } from '@/app/lib/budget/dateUtils';
import { determineProductYear } from '@/app/lib/budget/productSelectionStrategy';

interface ParentRow {
  product_id: number;
  year: number;
  fees: string;
  vendor_products?: { id: number; name: string };
}

interface InvoiceResult {
  expectedInvoiceAmount: number;
  invoiceAmount: number;
  discrepancy: number;
  discrepancyBase: number;
  hasUnmatchedProducts: boolean;
  invoiceFreqMultiplier: number;
  frequencyAligned: boolean;
  unmatchedProducts?: Array<{ product_id: number | string }>;
  matchedProducts?: Array<{
    parent_fee: number;
    parent_fee_converted: number;
    expectedInvoiceAmount: number;
    discrepancy: number;
  }>;
}

async function run(invoice: unknown): Promise<InvoiceResult> {
  return (await processInvoiceData(invoice)) as unknown as InvoiceResult;
}

function perYearParent(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    currency: 'USD',
    billing_frequency: 'Annually',
    subscription_term: 36,
    annual_increase: 0,
    renewal_type: 'Auto',
    term_start_date: [{ date: '2024-01-01' }],
    vendor_products_details: [
      { product_id: 1, year: 1, fees: '100000' },
      { product_id: 1, year: 2, fees: '110000' },
      { product_id: 1, year: 3, fees: '120000' },
    ] as ParentRow[],
    ...overrides,
  };
}

function makeInvoice({
  parent,
  termStartDate,
  products,
  billingFrequency = 'Annually',
  currency = 'USD',
  relationships,
}: {
  parent: unknown;
  termStartDate: unknown;
  products: Array<{
    product_id: number;
    fees: string;
    vendor_products?: { name: string };
  }>;
  billingFrequency?: string;
  currency?: string;
  relationships?: unknown[];
}) {
  return {
    id: 200,
    type_id: 6,
    currency,
    billing_frequency: billingFrequency,
    term_start_date: termStartDate,
    vendor_products_details: products,
    contract_relationships: relationships ?? [
      { active: true, disabled: false, parent },
    ],
  };
}

beforeEach(() => {
  // All-same-currency invoices never touch the rate store, so the defaults
  // only matter for the cross-currency tests, which override them.
  mockGetDailyUsdRates.mockReset().mockResolvedValue(new Map());
  mockGetLatestUsdRates.mockReset().mockResolvedValue({ USD: 1 });
  mockGetEffectiveBaseCurrency.mockReset().mockResolvedValue('USD');
});

describe('processInvoiceData multi-year per-year fee handling', () => {
  it('flags no discrepancy when the invoice bills the current contract year fee', async () => {
    const invoice = makeInvoice({
      parent: perYearParent(),
      termStartDate: [{ date: '2026-06-15' }],
      products: [{ product_id: 1, fees: '120000' }],
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(120000);
    expect(result.discrepancy).toBe(0);
    expect(result.invoiceFreqMultiplier).toBe(1);
    expect(result.frequencyAligned).toBe(true);
  });

  it('anchors the expected fee to the year the invoice falls in', async () => {
    const invoice = makeInvoice({
      parent: perYearParent(),
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '120000' }],
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(110000);
    expect(result.discrepancy).toBe(10000);
  });

  // PSK-1928: a pure single-row parent follows the engine's decision #9
  // (annual-fee-repeat) — the fee prices 12 months and repeats per cycle on a
  // clean multi-year span, matching price history. The previous reading
  // (fee spread over the whole term) is what the ticket reports as the
  // mismatch. Mixed parents (per-year rows present) are exercised separately.
  it('reads a pure single-row fee as annual on a clean multi-year span (PSK-1928)', async () => {
    const parent = {
      id: 100,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 36,
      annual_increase: 0,
      renewal_type: 'Auto',
      term_start_date: [{ date: '2024-01-01' }],
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '360000' },
      ] as ParentRow[],
    };
    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '30000' }],
      billingFrequency: 'Monthly',
    });

    const result = await run(invoice);

    // 360000 is the ANNUAL price: 30000/mo, not 360000/36 = 10000/mo.
    expect(result.expectedInvoiceAmount).toBe(30000);
    expect(result.discrepancy).toBe(0);
    expect(result.invoiceFreqMultiplier).toBe(12);
    expect(result.frequencyAligned).toBe(false);
  });

  it('ignores a malformed earlier-sorting start date when deriving the span', async () => {
    // '0000-00-00' sorts before every real date; an unvalidated lexical pick
    // would anchor there, fail to parse, and silently fall back to
    // subscription_term. The validating pick must skip it.
    const parent = {
      id: 100,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 36,
      annual_increase: 0,
      renewal_type: 'Auto',
      term_start_date: [{ date: '0000-00-00' }, { date: '2024-01-01' }],
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '360000' },
      ] as ParentRow[],
    };
    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '30000' }],
      billingFrequency: 'Monthly',
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(30000);
    expect(result.discrepancy).toBe(0);
  });

  it('prices a non-12-multiple span as a whole-span fee (decision #9 carve-out)', async () => {
    // 30 months recorded, no shorter explicit term: the fee prices the whole
    // span, so the monthly expectation divides by the SPAN, not by 12 and not
    // by a mismatched subscription_term.
    const parent = {
      id: 100,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 30,
      annual_increase: 0,
      renewal_type: 'Auto',
      term_start_date: [{ date: '2024-01-01' }],
      term_end_date: [{ date: '2026-06-30' }],
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '30000' },
      ] as ParentRow[],
    };
    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '1000' }],
      billingFrequency: 'Monthly',
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(1000); // 30000 / 30 months
    expect(result.discrepancy).toBe(0);
  });

  it('repeats the annual fee under a downward term override (decision #9)', async () => {
    // 30-month recorded span with an explicit 12-month subscription_term:
    // legacy's downward override — the fee is a per-cycle (annual) price that
    // re-bills across the longer dated span.
    const parent = {
      id: 100,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      term_start_date: [{ date: '2024-01-01' }],
      term_end_date: [{ date: '2026-06-30' }],
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '12000' },
      ] as ParentRow[],
    };
    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '1000' }],
      billingFrequency: 'Monthly',
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(1000); // 12000 / 12, annual price
    expect(result.discrepancy).toBe(0);
  });

  it('computes the correct delta for a plain 12-month annual contract', async () => {
    const parent = {
      id: 100,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      term_start_date: [{ date: '2024-01-01' }],
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '50000' },
      ] as ParentRow[],
    };

    const matching = await run(
      makeInvoice({
        parent,
        termStartDate: [{ date: '2024-06-15' }],
        products: [{ product_id: 1, fees: '50000' }],
      }),
    );
    expect(matching.discrepancy).toBe(0);

    const mismatched = await run(
      makeInvoice({
        parent,
        termStartDate: [{ date: '2024-06-15' }],
        products: [{ product_id: 1, fees: '60000' }],
      }),
    );
    expect(mismatched.expectedInvoiceAmount).toBe(50000);
    expect(mismatched.discrepancy).toBe(10000);
  });

  it('anchors synced-invoice `{ start }` shape the same as an array date', async () => {
    const invoice = makeInvoice({
      parent: perYearParent(),
      termStartDate: { start: '2025-06-15' },
      products: [{ product_id: 1, fees: '120000' }],
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(110000);
    expect(result.discrepancy).toBe(10000);
  });

  it('falls back to today when the invoice has no start date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-15'));
    try {
      const invoice = makeInvoice({
        parent: perYearParent(),
        termStartDate: null,
        products: [{ product_id: 1, fees: '120000' }],
      });

      const result = await run(invoice);

      expect(result.expectedInvoiceAmount).toBe(100000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the parent from the first active, non-disabled relationship', async () => {
    const wrongParent = perYearParent({
      id: 999,
      vendor_products_details: [
        {
          product_id: 1,
          year: 1,
          fees: '1',
          vendor_products: { id: 1, name: 'Wrong' },
        },
        { product_id: 1, year: 2, fees: '2' },
        { product_id: 1, year: 3, fees: '3' },
      ],
    });
    const rightParent = perYearParent();

    const invoice = makeInvoice({
      parent: rightParent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '120000' }],
      relationships: [
        { active: false, disabled: true, parent: wrongParent },
        { active: true, disabled: false, parent: rightParent },
      ],
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(110000);
  });

  it('classifies unmatched vs cross-year products correctly', async () => {
    const parent = perYearParent({
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '100000' },
        { product_id: 1, year: 2, fees: '110000' },
        { product_id: 1, year: 3, fees: '120000' },
        { product_id: 2, year: 3, fees: '50000' },
      ],
    });

    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [
        { product_id: 1, fees: '110000' },
        { product_id: 2, fees: '50000' },
        { product_id: 99, fees: '7000' },
      ],
    });

    const result = await run(invoice);

    expect(result.matchedProducts).toHaveLength(2);
    expect(result.hasUnmatchedProducts).toBe(true);
    expect(result.unmatchedProducts).toHaveLength(1);
    expect(result.unmatchedProducts?.[0]?.product_id).toBe(99);
    expect(result.invoiceAmount).toBe(167000);
    expect(result.discrepancy).toBe(7000);
  });

  it('does not compound per-year fees even when the parent has an annual increase and is renewed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-15'));
    try {
      // Original 3-year term 2021-01-01..2023-12-31, renewed for 2024.
      const parent = perYearParent({
        annual_increase: 10,
        renewal_period: 12,
        term_start_date: [{ date: '2024-01-01' }, { date: '2021-01-01' }],
        term_end_date: [{ date: '2024-12-31' }, { date: '2023-12-31' }],
      });
      const invoice = makeInvoice({
        parent,
        termStartDate: [{ date: '2024-06-15' }],
        products: [{ product_id: 1, fees: '120000' }],
      });

      const result = await run(invoice);

      // Year-3 fee carried forward, taken directly — not compounded by the
      // renewal count (which would give 120000 * 1.1^3).
      expect(result.matchedProducts?.[0]?.parent_fee).toBe(120000);
      expect(result.expectedInvoiceAmount).toBe(120000);
      expect(result.discrepancy).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('anchors a renewal-period invoice to the latest original-term year fee (PSK-1819)', async () => {
    // Parent SO: original 3-year term 2021-07-01..2024-06-30 with per-year fees,
    // then auto-renews 1 year at a time. term_start_date accumulates newest-first
    // (renew_expired_contracts prepends); vendor_products_details keeps years 1-3,
    // so the year-3 fee is the carried-forward current fee. An invoice in the
    // current renewal period must expect that year-3 fee regardless of the
    // parent's status.
    const makeParent = (status?: string) => ({
      id: 3026,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 36,
      renewal_period: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      ...(status ? { status } : {}),
      term_start_date: [{ date: '2026-07-01' }, { date: '2021-07-01' }],
      term_end_date: [{ date: '2027-06-30' }, { date: '2024-06-30' }],
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '200000' },
        { product_id: 1, year: 2, fees: '206309' },
        { product_id: 1, year: 3, fees: '217401' },
      ],
    });

    for (const status of [undefined, 'active', 'expired']) {
      const invoice = makeInvoice({
        parent: makeParent(status),
        termStartDate: [{ date: '2026-07-01' }],
        products: [{ product_id: 1, fees: '217401' }],
      });

      const result = await run(invoice);

      expect(result.matchedProducts?.[0]?.parent_fee).toBe(217401);
      expect(result.expectedInvoiceAmount).toBe(217401);
      expect(result.discrepancy).toBe(0);
    }
  });

  it('treats each product by its own row shape when the parent mixes per-year and full-term rows', async () => {
    const parent = perYearParent({
      subscription_term: 36,
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '100000' },
        { product_id: 1, year: 2, fees: '120000' },
        { product_id: 1, year: 3, fees: '140000' },
        { product_id: 2, year: 1, fees: '360000' },
      ],
    });

    // Monthly invoice: product 1 (per-year, year-2 annual fee 120000) prorates
    // over 12 months = 10000/mo; product 2 (single full-term 360000) prorates
    // over the 36-month term = 10000/mo. Both align, so no discrepancy — but
    // only if product 2 keeps its full-term span instead of the global maxYear=3
    // forcing it to a 12-month term (which would expect 30000/mo).
    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [
        { product_id: 1, fees: '10000' },
        { product_id: 2, fees: '10000' },
      ],
      billingFrequency: 'Monthly',
    });

    const result = await run(invoice);

    // Both products land on 10000/mo by design, so a bug that swapped the two
    // shapes (360000/36 and 120000/12 also both give 10000) would cancel in the
    // aggregate; parent_fee pins the row each product actually resolved to.
    const [product1, product2] = result.matchedProducts ?? [];
    expect(product1?.parent_fee).toBe(120000);
    expect(product1?.expectedInvoiceAmount).toBe(10000);
    expect(product1?.discrepancy).toBe(0);
    expect(product2?.parent_fee).toBe(360000);
    expect(product2?.expectedInvoiceAmount).toBe(10000);
    expect(product2?.discrepancy).toBe(0);

    expect(result.expectedInvoiceAmount).toBe(20000);
    expect(result.discrepancy).toBe(0);
  });

  it('converts a non-USD parent fee into the invoice currency exactly once, at the invoice-date rate', async () => {
    // EUR quoted at 1/1.1 per USD on the invoice date: 1 EUR = 1.10 USD.
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([['EUR', new Map([['2024-06-15', 1 / 1.1]])]]),
    );
    const parent = {
      id: 100,
      currency: 'EUR',
      billing_frequency: 'Annually',
      subscription_term: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      term_start_date: [{ date: '2024-01-01' }],
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '100000' },
      ] as ParentRow[],
    };
    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '110000' }],
    });

    const result = await run(invoice);

    // The read spans back over unquoted days and ends on the invoice date.
    expect(mockGetDailyUsdRates).toHaveBeenCalledWith(
      expect.arrayContaining(['EUR', 'USD']),
      '2024-06-08',
      '2024-06-15',
    );
    expect(result.matchedProducts?.[0]?.parent_fee).toBe(100000);
    expect(result.matchedProducts?.[0]?.parent_fee_converted).toBeCloseTo(
      110000,
      5,
    );
    // 100000 * 1.1 is not exactly representable, so the unrounded expected
    // total carries ~1e-11 of float dust. It stays well under the half-cent
    // epsilon, so the pipeline still treats this invoice as matching.
    expect(result.expectedInvoiceAmount).toBeCloseTo(110000, 5);
    expect(Math.abs(result.discrepancy)).toBeLessThan(0.005);
  });
});

describe('processInvoiceData source-currency amounts and base stamp (PSK-1796)', () => {
  function eurParent(overrides: Record<string, unknown> = {}) {
    return perYearParent({
      currency: 'EUR',
      subscription_term: 12,
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '100000' },
      ] as ParentRow[],
      ...overrides,
    });
  }

  it('computes a same-currency EUR invoice natively, with no FX fetch', async () => {
    mockGetEffectiveBaseCurrency.mockResolvedValue('EUR');
    const invoice = makeInvoice({
      parent: eurParent(),
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '110000' }],
      currency: 'EUR',
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(100000);
    expect(result.invoiceAmount).toBe(110000);
    expect(result.discrepancy).toBe(10000);
    expect(result.discrepancyBase).toBe(10000);
    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
  });

  it('stamps discrepancyBase at the invoice-date rate while the row stays native', async () => {
    // 0.9 EUR per USD on the invoice date: 9,000 EUR over = 10,000 USD.
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([['EUR', new Map([['2024-06-15', 0.9]])]]),
    );
    const invoice = makeInvoice({
      parent: eurParent(),
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '109000' }],
      currency: 'EUR',
    });

    const result = await run(invoice);

    expect(result.discrepancy).toBe(9000);
    expect(result.discrepancyBase).toBeCloseTo(10000, 5);
  });

  it('steps back to the nearest stored day when the invoice date has no quote', async () => {
    // Sunday invoice; the quote is Friday's.
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([['EUR', new Map([['2024-06-14', 0.9]])]]),
    );
    const invoice = makeInvoice({
      parent: eurParent(),
      termStartDate: [{ date: '2024-06-16' }],
      products: [{ product_id: 1, fees: '109000' }],
      currency: 'EUR',
    });

    const result = await run(invoice);

    expect(result.discrepancyBase).toBeCloseTo(10000, 5);
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
  });

  it('clamps a future-dated invoice to today for the daily-rate read', async () => {
    // Local-time "today" so the yyyy-MM-dd formatting matches on any TZ.
    jest.useFakeTimers({ now: new Date(2024, 5, 20, 12) });
    try {
      mockGetDailyUsdRates.mockResolvedValue(
        new Map([['EUR', new Map([['2024-06-20', 0.9]])]]),
      );
      const invoice = makeInvoice({
        parent: eurParent(),
        termStartDate: [{ date: '2025-01-15' }],
        products: [{ product_id: 1, fees: '109000' }],
        currency: 'EUR',
      });

      const result = await run(invoice);

      expect(mockGetDailyUsdRates).toHaveBeenCalledWith(
        expect.arrayContaining(['EUR', 'USD']),
        '2024-06-13',
        '2024-06-20',
      );
      expect(result.discrepancyBase).toBeCloseTo(10000, 5);
    } finally {
      jest.useRealTimers();
    }
  });

  it("falls back to today's rates when no stored day quotes the pair", async () => {
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.9 });
    const invoice = makeInvoice({
      parent: eurParent(),
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '109000' }],
      currency: 'EUR',
    });

    const result = await run(invoice);

    expect(result.discrepancy).toBe(9000);
    expect(result.discrepancyBase).toBeCloseTo(10000, 5);
  });
});

describe('processInvoiceData unrounded invoice totals (PSK-1876)', () => {
  function centParent(fees: string, overrides: Record<string, unknown> = {}) {
    return {
      id: 100,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      term_start_date: [{ date: '2024-01-01' }],
      vendor_products_details: [
        { product_id: 1, year: 1, fees },
      ] as ParentRow[],
      ...overrides,
    };
  }

  it('keeps both sides at cent precision instead of rounding to dollars', async () => {
    // Previously each side rounded to whole dollars ($1,000 vs $1,001), turning
    // a two-cent gap into a reported $1 discrepancy.
    const result = await run(
      makeInvoice({
        parent: centParent('1000.49'),
        termStartDate: [{ date: '2024-06-15' }],
        products: [{ product_id: 1, fees: '1000.51' }],
      }),
    );

    expect(result.expectedInvoiceAmount).toBeCloseTo(1000.49, 10);
    expect(result.invoiceAmount).toBeCloseTo(1000.51, 10);
    expect(result.discrepancy).toBeCloseTo(0.02, 10);
  });

  it('reports sub-dollar overbills instead of absorbing them', async () => {
    // Whole-dollar rounding silently swallowed both of these: 10c rounded away
    // to $0, and 50c rounded up to a full $1.
    const tenCents = await run(
      makeInvoice({
        parent: centParent('1000'),
        termStartDate: [{ date: '2024-06-15' }],
        products: [{ product_id: 1, fees: '1000.10' }],
      }),
    );
    expect(tenCents.invoiceAmount).toBeCloseTo(1000.1, 10);
    expect(tenCents.discrepancy).toBeCloseTo(0.1, 10);

    const fiftyCents = await run(
      makeInvoice({
        parent: centParent('1000'),
        termStartDate: [{ date: '2024-06-15' }],
        products: [{ product_id: 1, fees: '1000.50' }],
      }),
    );
    expect(fiftyCents.invoiceAmount).toBeCloseTo(1000.5, 10);
    expect(fiftyCents.discrepancy).toBeCloseTo(0.5, 10);
  });

  it('keeps the cents a monthly proration introduces', async () => {
    // Parent annual 1204.98 → 100.415/mo against a billed 100.42.
    const result = await run(
      makeInvoice({
        parent: centParent('1204.98'),
        termStartDate: [{ date: '2024-06-15' }],
        products: [{ product_id: 1, fees: '100.42' }],
        billingFrequency: 'Monthly',
      }),
    );

    expect(result.expectedInvoiceAmount).toBeCloseTo(100.415, 10);
    expect(result.invoiceAmount).toBeCloseTo(100.42, 10);
    expect(result.discrepancy).toBeCloseTo(0.005, 10);
  });

  it('sums per-product cents into the invoice total without inflating it', async () => {
    // Three products each billed 50c over (ICE invoice 3053 in production):
    // the true gap is $1.50 — rounding per product reported $3, and rounding
    // the totals reported $2.
    const parent = centParent('0', {
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '1337.00' },
        { product_id: 2, year: 1, fees: '1337.00' },
        { product_id: 3, year: 1, fees: '1337.00' },
      ] as ParentRow[],
    });
    const result = await run(
      makeInvoice({
        parent,
        termStartDate: [{ date: '2024-06-15' }],
        products: [
          { product_id: 1, fees: '1337.50' },
          { product_id: 2, fees: '1337.50' },
          { product_id: 3, fees: '1337.50' },
        ],
      }),
    );

    expect(result.expectedInvoiceAmount).toBeCloseTo(4011, 10);
    expect(result.invoiceAmount).toBeCloseTo(4012.5, 10);
    expect(result.discrepancy).toBeCloseTo(1.5, 10);
  });

  it('leaves matched product rows unrounded so subrows can show cents', async () => {
    const parent = centParent('0', {
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '1337.00' },
        { product_id: 2, year: 1, fees: '1337.00' },
      ] as ParentRow[],
    });
    const result = await run(
      makeInvoice({
        parent,
        termStartDate: [{ date: '2024-06-15' }],
        products: [
          { product_id: 1, fees: '1337.50' },
          { product_id: 2, fees: '1337.50' },
        ],
      }),
    );

    expect(result.matchedProducts?.[0]?.expectedInvoiceAmount).toBe(1337);
    expect(result.matchedProducts?.[0]?.discrepancy).toBe(0.5);
  });

  it('counts unmatched product fees toward the invoice total at full precision', async () => {
    const parent = centParent('1000.00');
    const result = await run(
      makeInvoice({
        parent,
        termStartDate: [{ date: '2024-06-15' }],
        products: [
          { product_id: 1, fees: '1000.00' },
          { product_id: 99, fees: '250.50' },
        ],
      }),
    );

    expect(result.expectedInvoiceAmount).toBeCloseTo(1000, 10);
    expect(result.invoiceAmount).toBeCloseTo(1250.5, 10);
    expect(result.discrepancy).toBeCloseTo(250.5, 10);
    expect(result.hasUnmatchedProducts).toBe(true);
  });
});

describe('invoicesReport row inclusion at cent precision (PSK-1876)', () => {
  function enriched(id: number) {
    return {
      id,
      contract: { id, currency: 'USD' },
      products: [],
      priceHistory: null,
    } as unknown as Parameters<typeof invoicesReport.transform>[0][number];
  }

  function transformWith(discrepancy: number, hasUnmatchedProducts = false) {
    const context = new Map([
      [1, { discrepancy, hasUnmatchedProducts } as never],
    ]) as unknown as Parameters<typeof invoicesReport.transform>[1];
    return invoicesReport.transform([enriched(1)], context);
  }

  it('keeps a genuine sub-dollar overbill that dollar rounding used to hide', () => {
    expect(transformWith(0.5)).toHaveLength(1);
    expect(transformWith(0.01)).toHaveLength(1);
    expect(transformWith(-0.01)).toHaveLength(1);
  });

  it('keeps an exact half-cent gap despite double-precision drift', () => {
    // 100.42 billed against a prorated 100.415 computes as 0.00499999999999545,
    // so a threshold of exactly 0.005 would discard a real half-cent gap.
    expect(transformWith(0.0049999999999954525)).toHaveLength(1);
  });

  it('drops sub-cent proration and float-conversion remainders', () => {
    // A $1,000 annual fee billed monthly leaves $0.0033; converting a non-USD
    // fee leaves ~1e-11. Neither is a vendor over-billing.
    expect(transformWith(0.0033333333333)).toHaveLength(0);
    expect(transformWith(-1.4551915228366852e-11)).toHaveLength(0);
    expect(transformWith(0)).toHaveLength(0);
  });

  it('still keeps a zero-discrepancy row that has unmatched products', () => {
    expect(transformWith(0, true)).toHaveLength(1);
  });
});

describe('calculateContractYear with an explicit asOfDate', () => {
  it('returns year 1 before the contract starts', () => {
    expect(calculateContractYear('2024-01-01', new Date('2023-06-01'))).toBe(1);
  });

  it('returns year 2 eighteen months in', () => {
    expect(calculateContractYear('2024-01-01', new Date('2025-07-01'))).toBe(2);
  });
});

describe('determineProductYear honoring asOfDate', () => {
  const contract = {
    term_start_date: [{ date: '2024-01-01' }],
    vendor_products_details: [
      { year: 1, fees: '100000' },
      { year: 2, fees: '110000' },
      { year: 3, fees: '120000' },
    ],
  };

  it('picks the year the asOfDate falls in', () => {
    expect(
      determineProductYear(contract as never, {
        asOfDate: new Date('2025-06-15'),
      }),
    ).toBe(2);
    expect(
      determineProductYear(contract as never, {
        asOfDate: new Date('2026-06-15'),
      }),
    ).toBe(3);
  });
});

/**
 * Exchange Agreement Invoices (type 13) must behave exactly like regular ones.
 * The matching engine already keys on product_id, so the only thing that had to
 * change was the type gate — these cases pin that down, and prove the code
 * travels through to the report rows.
 */
describe('Exchange Agreement Invoices (type 13)', () => {
  function eaParent() {
    return {
      id: 300,
      currency: 'EUR',
      billing_frequency: 'Annually',
      subscription_term: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      term_start_date: [{ date: '2024-01-01' }],
      vendor_products_details: [
        {
          product_id: 11,
          year: 1,
          fees: '24246',
          vendor_products: {
            id: 11,
            name: 'ENX Milan AFF L2-ND Trading Platform',
            product_code: 'MAFFL2-TPLNDRUA',
          },
        },
      ],
    };
  }

  it('produces discrepancy rows for an Exchange Agreement Invoice', async () => {
    const invoice = {
      ...makeInvoice({
        parent: eaParent(),
        termStartDate: [{ date: '2024-06-01' }],
        products: [
          {
            product_id: 11,
            fees: '30000',
            vendor_products: {
              id: 11,
              name: 'ENX Milan AFF L2-ND Trading Platform',
              product_code: 'MAFFL2-TPLNDRUA',
            },
          } as never,
        ],
        currency: 'EUR',
      }),
      type_id: 13,
    };

    const result = await run(invoice);

    expect(result.matchedProducts).toHaveLength(1);
    // Both documents are EUR, so the amounts stay native (PSK-1796).
    expect(result.expectedInvoiceAmount).toBeCloseTo(24246, 6);
    expect(result.invoiceAmount).toBeCloseTo(30000, 6);
    expect(result.discrepancy).toBeGreaterThan(0);
  });

  it('carries the product code onto the matched row', async () => {
    const invoice = {
      ...makeInvoice({
        parent: eaParent(),
        termStartDate: [{ date: '2024-06-01' }],
        products: [
          {
            product_id: 11,
            fees: '24246',
            vendor_products: {
              id: 11,
              name: 'ENX Milan AFF L2-ND Trading Platform',
              product_code: 'MAFFL2-TPLNDRUA',
            },
          } as never,
        ],
        currency: 'EUR',
      }),
      type_id: 13,
    };

    const result = (await run(invoice)) as InvoiceResult & {
      matchedProducts?: Array<{ product_code: string | null }>;
    };

    expect(result.matchedProducts?.[0].product_code).toBe('MAFFL2-TPLNDRUA');
  });

  it('carries the product code onto an unmatched row', async () => {
    const invoice = {
      ...makeInvoice({
        parent: eaParent(),
        termStartDate: [{ date: '2024-06-01' }],
        products: [
          {
            product_id: 99,
            fees: '2930',
            vendor_products: {
              id: 99,
              name: 'ENX Dublin Equities L2-ND Trading Platform',
              product_code: 'DEQL2-TPLNDRUA',
            },
          } as never,
        ],
        currency: 'EUR',
      }),
      type_id: 13,
    };

    const result = (await run(invoice)) as InvoiceResult & {
      unmatchedProducts?: Array<{ product_code: string | null }>;
    };

    expect(result.hasUnmatchedProducts).toBe(true);
    expect(result.unmatchedProducts?.[0].product_code).toBe('DEQL2-TPLNDRUA');
  });

  it('returns nothing for a type that is not an invoice', async () => {
    const invoice = {
      ...makeInvoice({
        parent: eaParent(),
        termStartDate: [{ date: '2024-06-01' }],
        products: [{ product_id: 11, fees: '30000' }],
      }),
      // 12 is the Exchange Agreement Service Order, not an invoice.
      type_id: 12,
    };

    expect(await processInvoiceData(invoice)).toEqual({});
  });
});

describe('segment-sourced expected fees (PSK-1928 follow-up)', () => {
  // Wraps a raw contract row in the minimal enriched shape lineage reads.
  const enriched = (
    contract: Record<string, unknown>,
    products: Array<{
      product_id: number;
      sourceContractId: number;
      isSuperseding: boolean;
    }> = [],
  ): ContractWithPricing =>
    ({
      id: contract.id,
      contract,
      products,
      isLinkedChildInvoice: false,
    }) as unknown as ContractWithPricing;

  const ctxFor = (
    contracts: ContractWithPricing[],
    relationships: Array<{
      parent_contract_id: number;
      child_contract_id: number;
    }> = [],
    cutoffs?: Map<number, Map<number, Date>>,
  ): SegmentFeeContext =>
    buildSegmentFeeContext(
      contracts,
      relationships,
      cutoffs,
      new Date('2025-06-20T00:00:00.000Z'),
      new Date('2028-01-01T00:00:00.000Z'),
    );

  const singleRowParent = {
    id: 100,
    currency: 'USD',
    billing_frequency: 'Annually',
    subscription_term: 36,
    annual_increase: 0,
    renewal_type: 'Auto',
    type_id: 2,
    term_start_date: [{ date: '2024-01-01' }],
    term_end_date: [{ date: '2026-12-31' }],
    vendor_products_details: [{ product_id: 1, year: 1, fees: '360000' }],
  };

  it('matches the decision-#9 reading through segments (parity with legacy)', async () => {
    const ctx = ctxFor([enriched(singleRowParent)]);
    const invoice = makeInvoice({
      parent: singleRowParent,
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '30000' }],
      billingFrequency: 'Monthly',
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.expectedInvoiceAmount).toBe(30000);
    expect(result.discrepancy).toBe(0);
  });

  it('prices a post-supersession period at the AMENDMENT fee (real lineage)', async () => {
    // Amendment 200 re-prices product 1 from 2025-01-01: the parent's own
    // rows say 360000/yr, the amendment says 480000/yr. An invoice dated
    // after the cutoff must expect the amendment fee — the legacy walk
    // reads raw parent rows and cannot see this.
    const amendment = {
      id: 200,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 24,
      annual_increase: 0,
      renewal_type: 'Auto',
      type_id: 2,
      term_start_date: [{ date: '2025-01-01' }],
      term_end_date: [{ date: '2026-12-31' }],
      vendor_products_details: [{ product_id: 1, year: 1, fees: '480000' }],
    };
    const ctx = ctxFor(
      [
        enriched(singleRowParent, [
          { product_id: 1, sourceContractId: 100, isSuperseding: false },
        ]),
        enriched(amendment, [
          { product_id: 1, sourceContractId: 100, isSuperseding: true },
        ]),
      ],
      [{ parent_contract_id: 100, child_contract_id: 200 }],
    );
    const invoice = makeInvoice({
      parent: singleRowParent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '40000' }],
      billingFrequency: 'Monthly',
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.expectedInvoiceAmount).toBe(40000); // 480000 / 12
    expect(result.discrepancy).toBe(0);
  });

  it('clamps to the pre-cutoff fee after a PSK-1830 cancellation with no superseder', async () => {
    const cutoffs = new Map([
      [100, new Map([[1, new Date('2025-01-01T00:00:00.000Z')]])],
    ]);
    const ctx = ctxFor([enriched(singleRowParent)], [], cutoffs);
    const invoice = makeInvoice({
      parent: singleRowParent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '30000' }],
      billingFrequency: 'Monthly',
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    // Segments end at the cutoff; the clamp carries the last (pre-cutoff)
    // fee forward, mirroring the legacy clamp's carried-forward semantics.
    expect(result.expectedInvoiceAmount).toBe(30000);
    expect(result.discrepancy).toBe(0);
  });

  it('prices via the embedded parent when the resolved set lacks it (expired parent)', async () => {
    // Only the AMENDMENT is in the resolved active set — the expired parent
    // rides embedded on the invoice. The seed lets its segments resolve, the
    // lineage graph (built from the amendment's membership) still truncates
    // them at the cutoff, and a post-cutoff invoice prices at the amendment
    // fee. The legacy walk would have read the stale parent row (30000/mo).
    const amendment = {
      id: 200,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 24,
      annual_increase: 0,
      renewal_type: 'Auto',
      type_id: 2,
      term_start_date: [{ date: '2025-01-01' }],
      term_end_date: [{ date: '2026-12-31' }],
      vendor_products_details: [{ product_id: 1, year: 1, fees: '480000' }],
    };
    const ctx = ctxFor(
      [
        enriched(amendment, [
          { product_id: 1, sourceContractId: 100, isSuperseding: true },
        ]),
      ],
      [{ parent_contract_id: 100, child_contract_id: 200 }],
    );
    const invoice = makeInvoice({
      parent: singleRowParent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '40000' }],
      billingFrequency: 'Monthly',
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.expectedInvoiceAmount).toBe(40000); // amendment 480000 / 12
    expect(result.discrepancy).toBe(0);
  });

  it('keeps each product of a seeded parent on its own supersession chain', async () => {
    // The seeded parent is absent from the resolved set and lists two
    // products: product 1 runs untouched, product 2 is re-priced by an
    // amendment. The resolver memo keys on contract, not product, so the
    // seeded lineage must cover every product of the parent at once — a
    // per-product lineage cached under product 1 (no cutoffs) would leave
    // product 2's parent segment uncut and shadow the amendment.
    const twoProductParent = {
      ...singleRowParent,
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '360000' },
        { product_id: 2, year: 1, fees: '120000' },
      ],
    };
    const amendment = {
      id: 200,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 24,
      annual_increase: 0,
      renewal_type: 'Auto',
      type_id: 2,
      term_start_date: [{ date: '2025-01-01' }],
      term_end_date: [{ date: '2026-12-31' }],
      vendor_products_details: [{ product_id: 2, year: 1, fees: '240000' }],
    };
    const ctx = ctxFor(
      [
        enriched(amendment, [
          { product_id: 2, sourceContractId: 100, isSuperseding: true },
        ]),
      ],
      [{ parent_contract_id: 100, child_contract_id: 200 }],
    );
    const invoice = makeInvoice({
      parent: twoProductParent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [
        { product_id: 1, fees: '30000' },
        { product_id: 2, fees: '20000' },
      ],
      billingFrequency: 'Monthly',
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.matchedProducts?.[0]?.expectedInvoiceAmount).toBe(30000);
    expect(result.matchedProducts?.[1]?.expectedInvoiceAmount).toBe(20000);
    expect(result.discrepancy).toBe(0);
  });

  it('prices an undated invoice at asOf instead of falling back to legacy', async () => {
    // An amendment re-prices product 1 from 2025-01-01; asOf (2025-06-20)
    // falls after the cutoff. The segment answer is the amendment's 40000/mo
    // — the legacy walk would read the stale parent row (30000/mo), so this
    // fails if the undated invoice ever falls back.
    const amendment = {
      id: 200,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 24,
      annual_increase: 0,
      renewal_type: 'Auto',
      type_id: 2,
      term_start_date: [{ date: '2025-01-01' }],
      term_end_date: [{ date: '2026-12-31' }],
      vendor_products_details: [{ product_id: 1, year: 1, fees: '480000' }],
    };
    const ctx = ctxFor(
      [
        enriched(singleRowParent, [
          { product_id: 1, sourceContractId: 100, isSuperseding: false },
        ]),
        enriched(amendment, [
          { product_id: 1, sourceContractId: 100, isSuperseding: true },
        ]),
      ],
      [{ parent_contract_id: 100, child_contract_id: 200 }],
    );
    const invoice = makeInvoice({
      parent: singleRowParent,
      termStartDate: null,
      products: [{ product_id: 1, fees: '40000' }],
      billingFrequency: 'Monthly',
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.expectedInvoiceAmount).toBe(40000);
    expect(result.discrepancy).toBe(0);
  });

  it("converts a supersession-chain fee in the AMENDMENT's currency, not the parent's", async () => {
    // EUR amendment supersedes a USD parent; 1 EUR = 1.10 USD on the invoice
    // date. The expected fee must cross over with the EUR multiplier — using
    // the parent's USD identity multiplier would understate it by 10%.
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([['EUR', new Map([['2025-06-15', 1 / 1.1]])]]),
    );
    const amendment = {
      id: 200,
      currency: 'EUR',
      billing_frequency: 'Annually',
      subscription_term: 24,
      annual_increase: 0,
      renewal_type: 'Auto',
      type_id: 2,
      term_start_date: [{ date: '2025-01-01' }],
      term_end_date: [{ date: '2026-12-31' }],
      vendor_products_details: [{ product_id: 1, year: 1, fees: '432000' }],
    };
    const ctx = ctxFor(
      [
        enriched(singleRowParent, [
          { product_id: 1, sourceContractId: 100, isSuperseding: false },
        ]),
        enriched(amendment, [
          { product_id: 1, sourceContractId: 100, isSuperseding: true },
        ]),
      ],
      [{ parent_contract_id: 100, child_contract_id: 200 }],
    );
    const invoice = makeInvoice({
      parent: singleRowParent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '39600' }],
      billingFrequency: 'Monthly',
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    // 432000 EUR × 1.1 = 475200 USD annual → 39600/mo. Conversion float
    // dust lands far below the report's half-cent MIN_DISCREPANCY.
    expect(result.expectedInvoiceAmount).toBeCloseTo(39600, 6);
    expect(result.discrepancy).toBeCloseTo(0, 6);
  });

  it('keeps the 1819 per-year renewal clamp answer through segments', async () => {
    const parent = {
      id: 3026,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 36,
      renewal_period: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      type_id: 2,
      term_start_date: [{ date: '2026-07-01' }, { date: '2021-07-01' }],
      term_end_date: [{ date: '2027-06-30' }, { date: '2024-06-30' }],
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '200000' },
        { product_id: 1, year: 2, fees: '206309' },
        { product_id: 1, year: 3, fees: '217401' },
      ],
    };
    const ctx = ctxFor([enriched(parent)]);
    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2026-07-01' }],
      products: [{ product_id: 1, fees: '217401' }],
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.matchedProducts?.[0]?.parent_fee).toBe(217401);
    expect(result.expectedInvoiceAmount).toBe(217401);
    expect(result.discrepancy).toBe(0);
  });

  describe('mid-cycle cutoffs price the whole cycle (PSK-1956)', () => {
    // Berenberg JPM: MSA #3040 prices 4 × $10,000 from 2024-01-14; Addendum 2
    // (#3038) starts 2024-04-16, mid-cycle, and re-prices to 4 × $12,500.
    const fourProducts = (fee: string): ParentRow[] =>
      [1, 2, 3, 4].map((product_id) => ({ product_id, year: 1, fees: fee }));
    const msa = {
      id: 3040,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      type_id: 2,
      term_start_date: [{ date: '2024-01-14' }],
      term_end_date: [{ date: '2025-01-13' }],
      vendor_products_details: fourProducts('10000'),
    };
    const addendum = {
      id: 3038,
      currency: 'USD',
      billing_frequency: 'Annually',
      subscription_term: 12,
      annual_increase: 0,
      renewal_type: 'Auto',
      type_id: 3,
      term_start_date: [{ date: '2024-04-16' }],
      term_end_date: [{ date: '2025-04-15' }],
      vendor_products_details: fourProducts('12500'),
    };
    const members = (sourceContractId: number, isSuperseding: boolean) =>
      [1, 2, 3, 4].map((product_id) => ({
        product_id,
        sourceContractId,
        isSuperseding,
      }));
    const ctx = () =>
      ctxFor(
        [
          enriched(msa, members(3040, false)),
          enriched(addendum, members(3040, true)),
        ],
        [{ parent_contract_id: 3040, child_contract_id: 3038 }],
      );

    it('expects the full MSA price for an invoice whose billing period starts before the addendum', async () => {
      const invoice = makeInvoice({
        parent: msa,
        termStartDate: [{ date: '2024-01-14' }],
        products: [1, 2, 3, 4].map((product_id) => ({
          product_id,
          fees: '10000',
        })),
      });

      const result = (await processInvoiceData(
        invoice,
        ctx(),
      )) as unknown as InvoiceResult;

      // The cut segment covering 2024-01-14 is 93/366 days of the cycle with
      // a day-prorated fee over a 3-month rounded span — read that way, a
      // correct $40,000 invoice expected $40,655.68.
      expect(result.matchedProducts?.[0]?.parent_fee).toBe(10000);
      expect(result.expectedInvoiceAmount).toBe(40000);
      expect(result.discrepancy).toBe(0);
    });

    it('expects the addendum price once the billing period starts after it', async () => {
      const invoice = makeInvoice({
        parent: msa,
        termStartDate: [{ date: '2024-06-14' }],
        products: [1, 2, 3, 4].map((product_id) => ({
          product_id,
          fees: '12500',
        })),
      });

      const result = (await processInvoiceData(
        invoice,
        ctx(),
      )) as unknown as InvoiceResult;

      expect(result.expectedInvoiceAmount).toBe(50000);
      expect(result.discrepancy).toBe(0);
    });

    it('expects the full cycle fee inside a cycle a PSK-1830 cancellation cuts mid-way', async () => {
      const cutoffs = new Map([
        [100, new Map([[1, new Date('2025-07-15T00:00:00.000Z')]])],
      ]);
      const invoice = makeInvoice({
        parent: singleRowParent,
        termStartDate: [{ date: '2025-03-15' }],
        products: [{ product_id: 1, fees: '30000' }],
        billingFrequency: 'Monthly',
      });

      const result = (await processInvoiceData(
        invoice,
        ctxFor([enriched(singleRowParent)], [], cutoffs),
      )) as unknown as InvoiceResult;

      expect(result.expectedInvoiceAmount).toBe(30000);
      expect(result.discrepancy).toBe(0);
    });
  });
});

describe('one-time products in expected fees (psk-1492)', () => {
  const enriched = (contract: Record<string, unknown>): ContractWithPricing =>
    ({
      id: contract.id,
      contract,
      products: [],
      isLinkedChildInvoice: false,
    }) as unknown as ContractWithPricing;

  const ctxFor = (contracts: ContractWithPricing[]): SegmentFeeContext =>
    buildSegmentFeeContext(
      contracts,
      [],
      undefined,
      new Date('2025-06-20T00:00:00.000Z'),
      new Date('2028-01-01T00:00:00.000Z'),
    );

  const oneTimeParent = {
    id: 100,
    currency: 'USD',
    billing_frequency: 'Annually',
    subscription_term: 12,
    annual_increase: 0,
    renewal_type: 'Auto',
    type_id: 2,
    term_start_date: [{ date: '2024-01-01' }],
    term_end_date: [{ date: '2024-12-31' }],
    vendor_products_details: [
      { product_id: 1, year: 1, fees: '50000', one_time_only: true },
    ],
  };

  it('expects the fee for an invoice dated inside the booked segment', async () => {
    const ctx = ctxFor([enriched(oneTimeParent)]);
    const invoice = makeInvoice({
      parent: oneTimeParent,
      termStartDate: [{ date: '2024-06-15' }],
      products: [{ product_id: 1, fees: '50000' }],
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.expectedInvoiceAmount).toBe(50000);
    expect(result.discrepancy).toBe(0);
  });

  it('expects zero for an invoice dated after the booked segment (re-billed one-time fee)', async () => {
    const ctx = ctxFor([enriched(oneTimeParent)]);
    const invoice = makeInvoice({
      parent: oneTimeParent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '50000' }],
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.expectedInvoiceAmount).toBe(0);
    expect(result.discrepancy).toBe(50000);
  });

  it('keeps the nearest-fee grace for an invoice dated before the booking', async () => {
    const ctx = ctxFor([enriched(oneTimeParent)]);
    const invoice = makeInvoice({
      parent: oneTimeParent,
      termStartDate: [{ date: '2023-12-28' }],
      products: [{ product_id: 1, fees: '50000' }],
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.expectedInvoiceAmount).toBe(50000);
    expect(result.discrepancy).toBe(0);
  });

  it('expects zero on the ctx-less legacy path when the selected row is an expired one-time booking', async () => {
    const invoice = makeInvoice({
      parent: oneTimeParent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '50000' }],
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(0);
    expect(result.discrepancy).toBe(50000);
  });

  it('legacy path still expects a recurring later-year row over an expired one-time row', async () => {
    const parent = {
      ...oneTimeParent,
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '50000', one_time_only: true },
        { product_id: 1, year: 2, fees: '60000' },
      ],
    };
    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '60000' }],
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(60000);
    expect(result.discrepancy).toBe(0);
  });

  it('expects zero at the exact exclusive end of the booked segment', async () => {
    const ctx = ctxFor([enriched(oneTimeParent)]);
    const invoice = makeInvoice({
      parent: oneTimeParent,
      termStartDate: [{ date: '2025-01-01' }],
      products: [{ product_id: 1, fees: '50000' }],
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.expectedInvoiceAmount).toBe(0);
    expect(result.discrepancy).toBe(50000);
  });

  it('segment path expects the recurring later-year fee when rows are mixed', async () => {
    const parent = {
      ...oneTimeParent,
      vendor_products_details: [
        { product_id: 1, year: 1, fees: '50000', one_time_only: true },
        { product_id: 1, year: 2, fees: '60000' },
      ],
    };
    const ctx = ctxFor([enriched(parent)]);
    const invoice = makeInvoice({
      parent,
      termStartDate: [{ date: '2025-06-15' }],
      products: [{ product_id: 1, fees: '60000' }],
    });

    const result = (await processInvoiceData(
      invoice,
      ctx,
    )) as unknown as InvoiceResult;

    expect(result.expectedInvoiceAmount).toBe(60000);
    expect(result.discrepancy).toBe(0);
  });
});
