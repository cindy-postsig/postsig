import { describe, expect, it, jest } from '@jest/globals';

// currency.ts constructs API/redis clients on import; nothing here converts
// (skipExchangeRates below), so stub the whole module.
jest.mock('@/lib/v2/core/currency', () => ({
  getExchangeRates: jest.fn(async () => ({ USD: 1 })),
  convertToUSD: (value: number) => value,
}));

import { enrichWithPricing, resolveCurrentFee } from '@/lib/v2/core/pricing';
import type { ContractWithLineage } from '@/lib/v2/core/types';

/**
 * Spend & budgeting numbers derive from the price histories this enrichment
 * produces. A product cancelled by a confirmed lineage event (PSK-1830) must
 * stop accruing here too, or Spend Overview / Monthly Report disagree with
 * the contract page and Price History.
 */

const CONTRACT_ID = 1;

interface FeeRow {
  productId: number;
  fees: number;
}

interface Period {
  startDate: string;
  fees: number;
  productFees: FeeRow[];
}

function productDetail(id: number, fees: number) {
  return {
    product_id: id,
    year: 1,
    fees,
    vendor_products: { id, name: `Product ${id}` },
  };
}

function productWithLineage(id: number, fees: number) {
  return {
    product_id: id,
    name: `Product ${id}`,
    fees,
    year: 1,
    sourceContractId: CONTRACT_ID,
    isSuperseded: false,
    isSuperseding: false,
  };
}

function contractRow() {
  return {
    id: CONTRACT_ID,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: null,
    renewal_period: 12,
    renewal_type: 'Auto-Renew',
    billing_frequency: null,
    will_not_renew: false,
    term_start_date: [{ date: '2020-01-01' }],
    term_end_date: [{ date: '2020-12-31' }],
    cancel_date: [],
    vendor_products_details: [productDetail(1, 1200), productDetail(2, 600)],
    vendors: { name: 'Test Vendor' },
    users: { organizations: { fiscal_year_start_month: 1 } },
  };
}

function makeInput(): ContractWithLineage {
  return {
    id: CONTRACT_ID,
    vendor_id: 1,
    vendor_name: 'Test Vendor',
    isLinkedChildInvoice: false,
    contract: contractRow(),
    products: [productWithLineage(1, 1200), productWithLineage(2, 600)],
  };
}

const enrich = (cutoffsByContract?: Map<number, Map<number, Date>>) =>
  enrichWithPricing([makeInput()], 1, {
    skipExchangeRates: true,
    cutoffsByContract,
  });

const cutoffFor = (contractId: number, productId: number, date: string) =>
  new Map([[contractId, new Map([[productId, new Date(date)]])]]);

const pastCutoff = () => cutoffFor(CONTRACT_ID, 1, '2022-01-01');

const feeOf = (period: Period, productId: number) =>
  period.productFees.find((pf) => pf.productId === productId)?.fees;

const currentFeeOf = (
  enriched: { products: Array<{ product_id: number; currentFee: number }> },
  productId: number,
) => enriched.products.find((p) => p.product_id === productId)?.currentFee;

describe('resolveCurrentFee', () => {
  const product = { product_id: 1, fees: 500 };
  const period = (fees: number, startDate = '2024-01-01') => ({
    startDate,
    productFees: [{ productId: 1, fees }],
  });

  it('prefers the active period fee', () => {
    expect(resolveCurrentFee(product, period(700), undefined)).toBe(700);
  });

  it('falls back to the base fee when the period fee is zero', () => {
    expect(resolveCurrentFee(product, period(0), undefined)).toBe(500);
  });

  it('falls back to the base fee when there is no active period', () => {
    expect(resolveCurrentFee(product, undefined, undefined)).toBe(500);
  });

  it('suppresses the fallback when a cutoff struck the active period', () => {
    const cutoff = new Date('2023-01-01');

    expect(resolveCurrentFee(product, period(0), cutoff)).toBe(0);
  });

  it('keeps the fallback when the cutoff is after the active period start', () => {
    const cutoff = new Date('2025-01-01');

    expect(resolveCurrentFee(product, period(0), cutoff)).toBe(500);
  });
});

describe('enrichWithPricing — cancellation cutoffs', () => {
  it('zeroes the cancelled product in periods from the cutoff forward', async () => {
    const [enriched] = await enrich(pastCutoff());

    const postCutoff = (enriched.priceHistory.periods as Period[]).filter(
      (p) => new Date(p.startDate) >= new Date('2022-01-01'),
    );
    expect(postCutoff.length).toBeGreaterThan(0);
    postCutoff.forEach((p) => {
      expect(feeOf(p, 1)).toBe(0);
      expect(feeOf(p, 2)).toBe(600);
    });
  });

  it('does not resurrect the zeroed fee through the base-fee fallback', async () => {
    const [enriched] = await enrich(pastCutoff());

    expect(currentFeeOf(enriched, 1)).toBe(0);
    expect(
      enriched.products.find((p) => p.product_id === 1)?.currentFeeUSD,
    ).toBe(0);
    expect(currentFeeOf(enriched, 2)).toBe(600);
  });

  it('keeps fees accruing before the cutoff date', async () => {
    const [enriched] = await enrich(pastCutoff());

    const preCutoff = (enriched.priceHistory.periods as Period[]).filter(
      (p) => new Date(p.startDate) < new Date('2022-01-01'),
    );
    expect(preCutoff.length).toBeGreaterThan(0);
    preCutoff.forEach((p) => expect(p.fees).toBe(1800));
  });

  it('flags a product with a cutoff as cancelled for the table UI', async () => {
    const [enriched] = await enrich(pastCutoff());

    expect(enriched.products.find((p) => p.product_id === 1)?.isCancelled).toBe(
      true,
    );
    expect(enriched.products.find((p) => p.product_id === 2)?.isCancelled).toBe(
      false,
    );
  });

  it('leaves a future cutoff inert until it takes effect', async () => {
    const [enriched] = await enrich(cutoffFor(CONTRACT_ID, 1, '2100-01-01'));

    expect(currentFeeOf(enriched, 1)).toBe(1200);
  });

  it('ignores cutoffs belonging to a different contract', async () => {
    const [enriched] = await enrich(cutoffFor(999, 1, '2022-01-01'));

    expect(currentFeeOf(enriched, 1)).toBe(1200);
  });

  it('is byte-identical to before when no cutoffs are passed', async () => {
    const [withoutOption] = await enrichWithPricing([makeInput()], 1, {
      skipExchangeRates: true,
    });
    const [withUndefined] = await enrich(undefined);
    const [withEmpty] = await enrich(new Map());

    expect(withUndefined).toEqual(withoutOption);
    expect(withEmpty).toEqual(withoutOption);
  });
});
