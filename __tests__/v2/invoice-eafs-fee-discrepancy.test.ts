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
  getUserMetadata: () => Promise.resolve(null),
}));

import { processInvoiceData } from '@/lib/v2/reports/transforms/invoices';
import {
  buildSegmentFeeContext,
  type SegmentFeeContext,
} from '@/lib/v2/reports/transforms/expectedSegments';
import type { ContractWithPricing } from '@/lib/v2/core/types';

interface InvoiceResult {
  expectedInvoiceAmount: number;
  invoiceAmount: number;
  discrepancy: number;
  hasUnmatchedProducts: boolean;
  unmatchedProducts?: Array<{
    product_id: number | string;
    invoice_fee: number;
  }>;
  matchedProducts?: Array<{
    product_id: number | string;
    parent_fee: number;
  }>;
}

async function run(
  invoice: unknown,
  ctx?: SegmentFeeContext,
): Promise<InvoiceResult> {
  return (await processInvoiceData(invoice, ctx)) as unknown as InvoiceResult;
}

function easoParent(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    type_id: 12,
    currency: 'USD',
    billing_frequency: 'Annually',
    subscription_term: 12,
    annual_increase: 0,
    renewal_type: 'Auto',
    term_start_date: [{ date: '2024-01-01' }],
    vendor_products_details: [{ product_id: 1, year: 1, fees: '12000' }],
    ...overrides,
  };
}

function soParent(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    type_id: 2,
    currency: 'USD',
    billing_frequency: 'Annually',
    subscription_term: 12,
    annual_increase: 0,
    renewal_type: 'Auto',
    term_start_date: [{ date: '2024-01-01' }],
    vendor_products_details: [{ product_id: 1, year: 1, fees: '12000' }],
    ...overrides,
  };
}

function makeInvoice({
  parent,
  products,
  billingFrequency = 'Monthly',
  typeId = 13,
}: {
  parent: unknown;
  products: unknown[];
  billingFrequency?: string;
  typeId?: number;
}) {
  return {
    id: 200,
    type_id: typeId,
    currency: 'USD',
    billing_frequency: billingFrequency,
    term_start_date: [{ date: '2024-06-15' }],
    vendor_products_details: products,
    contract_relationships: [{ active: true, disabled: false, parent }],
  };
}

beforeEach(() => {
  mockGetDailyUsdRates.mockReset().mockResolvedValue(new Map());
  mockGetLatestUsdRates.mockReset().mockResolvedValue({ USD: 1 });
  mockGetEffectiveBaseCurrency.mockReset().mockResolvedValue('USD');
});

describe('EAINV x EASO fee-schedule override (eafs-fee-invoice-discrepancy)', () => {
  it('applies the fee-schedule fee, with proration, over the raw fee-schedule SO row', async () => {
    const invoice = makeInvoice({
      parent: easoParent(),
      products: [
        {
          product_id: 1,
          fees: '1050',
          vendor_products_eafs_fees: {
            product_fee: 12000,
            period_months: 12,
          } as never,
        },
      ],
    });

    const result = await run(invoice);

    expect(result.expectedInvoiceAmount).toBe(1000);
    expect(result.discrepancy).toBe(50);
    expect(result.matchedProducts?.[0]?.parent_fee).toBe(12000);
  });

  it('prorates a monthly fee-schedule price to a quarterly invoice', async () => {
    const invoice = makeInvoice({
      parent: easoParent({ billing_frequency: 'Quarterly' }),
      billingFrequency: 'Quarterly',
      products: [
        {
          product_id: 1,
          fees: '3100',
          vendor_products_eafs_fees: {
            product_fee: 1000,
            period_months: 1,
          } as never,
        },
      ],
    });

    const result = await run(invoice);

    // 1000/month x 3 months, not 1000/12 x 3.
    expect(result.expectedInvoiceAmount).toBe(3000);
    expect(result.discrepancy).toBe(100);
    expect(result.matchedProducts?.[0]?.parent_fee).toBe(1000);
  });

  it('wins over the SO row when the two disagree', async () => {
    const invoice = makeInvoice({
      parent: easoParent({
        vendor_products_details: [{ product_id: 1, year: 1, fees: '6000' }],
      }),
      products: [
        {
          product_id: 1,
          fees: '1050',
          vendor_products_eafs_fees: {
            product_fee: 12000,
            period_months: 12,
          } as never,
        },
      ],
    });

    const result = await run(invoice);

    // 12000/12 = 1000, not the SO row's 6000/12 = 500.
    expect(result.expectedInvoiceAmount).toBe(1000);
  });

  it('skips the product entirely when the fee-schedule row is missing', async () => {
    const invoice = makeInvoice({
      parent: easoParent(),
      products: [{ product_id: 1, fees: '1050' }],
    });

    const result = await run(invoice);

    expect(result.matchedProducts).toHaveLength(0);
    expect(result.expectedInvoiceAmount).toBe(0);
    expect(result.invoiceAmount).toBe(0);
    expect(result.hasUnmatchedProducts).toBe(false);
  });

  it('leaves an EAINV under a plain SO on the existing flow (no fee-schedule row)', async () => {
    const invoice = makeInvoice({
      parent: soParent(),
      products: [{ product_id: 1, fees: '1000' }],
    });

    const result = await run(invoice);

    expect(result.matchedProducts?.[0]?.parent_fee).toBe(12000);
    expect(result.expectedInvoiceAmount).toBe(1000);
    expect(result.discrepancy).toBe(0);
  });

  it('leaves a plain Invoice under an EASO on the existing flow, ignoring a present fee-schedule row', async () => {
    const invoice = makeInvoice({
      parent: easoParent(),
      typeId: 6,
      products: [
        {
          product_id: 1,
          fees: '1000',
          vendor_products_eafs_fees: {
            product_fee: 999999,
            period_months: 12,
          } as never,
        },
      ],
    });

    const result = await run(invoice);

    expect(result.matchedProducts?.[0]?.parent_fee).toBe(12000);
    expect(result.expectedInvoiceAmount).toBe(1000);
    expect(result.discrepancy).toBe(0);
  });

  it('still surfaces an unmatched product on an EAINV x EASO invoice, added to billed', async () => {
    const invoice = makeInvoice({
      parent: easoParent(),
      products: [
        {
          product_id: 1,
          fees: '1000',
          vendor_products_eafs_fees: {
            product_fee: 12000,
            period_months: 12,
          } as never,
        },
        { product_id: 99, fees: '500' },
      ],
    });

    const result = await run(invoice);

    expect(result.hasUnmatchedProducts).toBe(true);
    expect(result.unmatchedProducts?.[0]?.product_id).toBe(99);
    expect(result.invoiceAmount).toBe(1500);
  });

  it('bypasses the segment-sourced fee value as well', async () => {
    const owner = easoParent({
      vendor_products_details: [{ product_id: 1, year: 1, fees: '6000' }],
    });
    const ctx = buildSegmentFeeContext(
      [
        {
          id: owner.id,
          contract: owner,
          products: [],
          isLinkedChildInvoice: false,
        } as unknown as ContractWithPricing,
      ],
      [],
      undefined,
      new Date('2024-06-20T00:00:00.000Z'),
      new Date('2028-01-01T00:00:00.000Z'),
    );
    const invoice = makeInvoice({
      parent: owner,
      products: [
        {
          product_id: 1,
          fees: '1050',
          vendor_products_eafs_fees: {
            product_fee: 12000,
            period_months: 12,
          } as never,
        },
      ],
    });

    const result = await run(invoice, ctx);

    // The segment for the SO's own row would expect 6000/12 = 500; the
    // fee-schedule override still wins.
    expect(result.matchedProducts?.[0]?.parent_fee).toBe(12000);
    expect(result.expectedInvoiceAmount).toBe(1000);
    expect(result.discrepancy).toBe(50);
  });

  it("converts the fee-schedule fee in the EASO's currency, not a superseding segment's", async () => {
    // A EUR amendment supersedes the USD EASO, so the owning segment is EUR
    // (1 EUR = 1.10 USD on the invoice date). The fee schedule prices the
    // EASO, so its fee stays on the USD identity rate: 12000/12 = 1000, not
    // 1100.
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([['EUR', new Map([['2024-06-15', 1 / 1.1]])]]),
    );
    const owner = easoParent({
      term_end_date: [{ date: '2025-12-31' }],
      subscription_term: 24,
    });
    const amendment = easoParent({
      id: 102,
      currency: 'EUR',
      subscription_term: 12,
      term_start_date: [{ date: '2024-06-01' }],
      term_end_date: [{ date: '2025-05-31' }],
      vendor_products_details: [{ product_id: 1, year: 1, fees: '6000' }],
    });
    const enriched = (
      contract: Record<string, unknown>,
      isSuperseding: boolean,
    ) =>
      ({
        id: contract.id,
        contract,
        products: [{ product_id: 1, sourceContractId: 100, isSuperseding }],
        isLinkedChildInvoice: false,
      }) as unknown as ContractWithPricing;
    const ctx = buildSegmentFeeContext(
      [enriched(owner, false), enriched(amendment, true)],
      [{ parent_contract_id: 100, child_contract_id: 102 }] as never,
      undefined,
      new Date('2024-06-20T00:00:00.000Z'),
      new Date('2028-01-01T00:00:00.000Z'),
    );
    const invoice = makeInvoice({
      parent: owner,
      products: [
        {
          product_id: 1,
          fees: '1000',
          vendor_products_eafs_fees: {
            product_fee: 12000,
            period_months: 12,
          } as never,
        },
      ],
    });

    const result = await run(invoice, ctx);

    expect(result.matchedProducts?.[0]?.parent_fee).toBe(12000);
    expect(result.expectedInvoiceAmount).toBeCloseTo(1000, 6);
    expect(result.discrepancy).toBeCloseTo(0, 6);
  });
});
