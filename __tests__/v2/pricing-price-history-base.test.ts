/**
 * Price-history denomination after enrichWithPricing (PSK-1796).
 *
 * The price-history chain reads each product row's `convertedFees` and falls
 * back to the native `fees` when it is absent, so an unstamped row makes
 * priceHistory.totalContractValueUSD / annualContractValueUSD / feesUSD hold a
 * foreign amount under a base-currency label — and vendor TCV, price-history
 * ACV and the report totals all read those fields.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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

import { enrichWithPricing } from '@/lib/v2/core/pricing';
import type { ContractWithLineage } from '@/lib/v2/core/types';

const START_DATE = '2023-01-01';
/** 1 USD buys 0.8 EUR on the start date, so EUR -> USD is 1.25. */
const START_DATE_MULTIPLIER = 1.25;
const FEE = 1000;

function makeContract(): ContractWithLineage {
  return {
    id: 1,
    vendor_id: 1,
    vendor_name: 'Test Vendor',
    isLinkedChildInvoice: false,
    contract: {
      id: 1,
      status: 'active',
      status_id: 4,
      currency: 'EUR',
      annual_increase: null,
      annual_increase_months: null,
      subscription_term: null,
      renewal_period: 12,
      renewal_type: 'Auto-Renew',
      billing_frequency: null,
      will_not_renew: false,
      term_start_date: [{ date: START_DATE }],
      term_end_date: [{ date: '2023-12-31' }],
      cancel_date: [],
      // Deliberately unstamped: this is the row shape the price-history chain
      // would otherwise read a native fee from.
      vendor_products_details: [
        {
          product_id: 1,
          year: 1,
          fees: FEE,
          vendor_products: { id: 1, name: 'Product 1' },
        },
      ],
      vendors: { name: 'Test Vendor' },
      users: { organizations: { fiscal_year_start_month: 1 } },
    },
    products: [
      {
        product_id: 1,
        name: 'Product 1',
        fees: FEE,
        year: 1,
        sourceContractId: 1,
        isSuperseded: false,
        isSuperseding: false,
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDailyUsdRates.mockResolvedValue(
    new Map([['EUR', new Map([[START_DATE, 0.8]])]]),
  );
  // Deliberately different from the start-date rate, so a latest-rate
  // conversion would be visible in the numbers below.
  mockGetLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.5 });
});

describe('enrichWithPricing — price-history denomination', () => {
  it('denominates the price-history USD fields in the base currency', async () => {
    const [enriched] = await enrichWithPricing([makeContract()], 1, {
      baseCurrency: 'USD',
    });
    const priceHistory = enriched.priceHistory;

    expect(priceHistory.totalContractValue).toBeGreaterThan(0);
    expect(priceHistory.totalContractValueUSD).toBeCloseTo(
      priceHistory.totalContractValue * START_DATE_MULTIPLIER,
    );
    expect(priceHistory.annualContractValueUSD).toBeCloseTo(
      FEE * START_DATE_MULTIPLIER,
    );
    priceHistory.periods.forEach(
      (period: { fees: number; feesUSD: number }) => {
        expect(period.feesUSD).toBeCloseTo(period.fees * START_DATE_MULTIPLIER);
      },
    );
  });

  it('leaves the caller contract row untouched, so the engine sees native fees', async () => {
    const input = makeContract();

    await enrichWithPricing([input], 1, { baseCurrency: 'USD' });

    expect(input.contract.vendor_products_details[0]).not.toHaveProperty(
      'convertedFees',
    );
  });

  it('keeps the USD fields native when conversion is skipped', async () => {
    const [enriched] = await enrichWithPricing([makeContract()], 1, {
      baseCurrency: 'USD',
      skipExchangeRates: true,
    });

    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(enriched.priceHistory.annualContractValueUSD).toBe(FEE);
  });
});
