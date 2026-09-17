/**
 * getContractStartDate / convertAllProductsToUSD (PSK-1796).
 *
 * `convertedFees` is the stamp the whole legacy read path treats as "the
 * money", so what it is denominated in — and whether the rate behind it is
 * real — has to be pinned: the org's base currency, at the contract's start
 * date, with a null fxRate rather than a fabricated 1.0 when the provider had
 * no quote.
 */
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

const mockCalculateCompoundedProductFee =
  jest.fn<(product: unknown, contract: unknown) => { compoundedFee: number }>();

jest.mock('@/app/lib/budget', () => ({
  __esModule: true,
  generatePriceHistory: jest.fn(),
  extractBudgetFromPriceHistory: jest.fn(),
  calculateCompoundedProductFee: (product: unknown, contract: unknown) =>
    mockCalculateCompoundedProductFee(product, contract),
}));

import {
  getContractStartDate,
  convertAllProductsToUSD,
} from '@/lib/v2/products/transforms';
import type { BaseCurrencyRates } from '@/lib/v2/core/baseRates';

describe('getContractStartDate', () => {
  it('returns the date of the most recently updated entry', () => {
    expect(
      getContractStartDate({
        term_start_date: [
          { date: '2021-05-01', updated_at: '2021-05-02T00:00:00Z' },
          { date: '2023-09-10', updated_at: '2024-01-15T12:00:00Z' },
          { date: '2022-01-01', updated_at: '2022-06-01T00:00:00Z' },
        ],
      }),
    ).toBe('2023-09-10');
  });

  it('normalizes a full ISO timestamp to the date part', () => {
    expect(
      getContractStartDate({
        term_start_date: [
          {
            date: '2023-09-10T09:30:00.000Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      }),
    ).toBe('2023-09-10');
  });

  it('keeps query order when the rows carry no updated_at', () => {
    expect(
      getContractStartDate({
        term_start_date: [{ date: '2026-01-01' }, { date: '2025-01-01' }],
      }),
    ).toBe('2026-01-01');
  });

  it('returns null when there is no term_start_date', () => {
    expect(getContractStartDate({})).toBeNull();
    expect(getContractStartDate({ term_start_date: [] })).toBeNull();
    expect(getContractStartDate({ term_start_date: null })).toBeNull();
  });

  it('returns null when the latest entry has a null date, ignoring older dated entries', () => {
    expect(
      getContractStartDate({
        term_start_date: [
          { date: '2022-01-01', updated_at: '2022-01-01T00:00:00Z' },
          { date: null, updated_at: '2024-01-01T00:00:00Z' },
        ],
      }),
    ).toBeNull();
  });
});

describe('convertAllProductsToUSD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDailyUsdRates.mockResolvedValue(new Map());
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1 });
  });

  it('converts at the start-date rate and stamps the fx details', async () => {
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([
        ['GBP', new Map([['2023-06-15', 0.5]])],
        ['EUR', new Map([['2023-06-15', 0.8]])],
      ]),
    );

    const contract = {
      currency: 'GBP',
      term_start_date: [
        { date: '2023-06-15', updated_at: '2023-06-15T00:00:00Z' },
      ],
      vendor_products_details: [{ product_id: 1, fees: 100 }],
    };

    const [product] = await convertAllProductsToUSD(contract, 'EUR');

    expect(mockGetDailyUsdRates.mock.calls[0][1]).toBe('2023-06-15');
    // 100 GBP -> 200 USD -> 160 EUR.
    expect(product.convertedFees).toBeCloseTo(160);
    expect(product.compoundedFees).toBeCloseTo(160);
    expect(product.fees).toBe(100);
    expect(product.fxRate).toBeCloseTo(1.6);
    expect(product.fxDate).toBe('2023-06-15');
    expect(product.fxTargetCurrency).toBe('EUR');
  });

  it('falls back to the latest rate and a null fxDate when the start date is missing', async () => {
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1, GBP: 0.5, EUR: 0.8 });

    const contract = {
      currency: 'GBP',
      vendor_products_details: [{ product_id: 1, fees: 100 }],
    };

    const [product] = await convertAllProductsToUSD(contract, 'EUR');

    expect(product.convertedFees).toBeCloseTo(160);
    expect(product.fxDate).toBeNull();
    expect(product.fxRate).toBeCloseTo(1.6);
  });

  it('skips rate fetching entirely when the contract is already in the target', async () => {
    const contract = {
      currency: 'EUR',
      term_start_date: [
        { date: '2023-06-15', updated_at: '2023-06-15T00:00:00Z' },
      ],
      vendor_products_details: [{ product_id: 1, fees: 250 }],
    };

    const [product] = await convertAllProductsToUSD(contract, 'EUR');

    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
    expect(product.convertedFees).toBe(250);
    expect(product.fxRate).toBeNull();
    expect(product.fxDate).toBeNull();
    expect(product.fxTargetCurrency).toBe('EUR');
  });

  it('stamps a null fxRate rather than 1.0 when the provider quoted nothing', async () => {
    // Both fetchers degrade silently (quota exhausted, outage), so conversion
    // falls back 1:1 — the stamp must disclose that.
    const contract = {
      currency: 'EUR',
      term_start_date: [
        { date: '2023-06-15', updated_at: '2023-06-15T00:00:00Z' },
      ],
      vendor_products_details: [{ product_id: 1, fees: 100 }],
    };

    const [product] = await convertAllProductsToUSD(contract, 'USD');

    expect(product.convertedFees).toBe(100);
    expect(product.fxRate).toBeNull();
    expect(product.fxDate).toBeNull();
  });

  it('converts the compounded fee for contracts with an annual increase', async () => {
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([['GBP', new Map([['2023-06-15', 0.5]])]]),
    );
    mockCalculateCompoundedProductFee.mockReturnValue({ compoundedFee: 200 });

    const contract = {
      currency: 'GBP',
      annual_increase: 5,
      renewal_type: 'Auto-Renew',
      term_start_date: [
        { date: '2023-06-15', updated_at: '2023-06-15T00:00:00Z' },
      ],
      vendor_products_details: [{ product_id: 1, fees: 100 }],
    };

    const [product] = await convertAllProductsToUSD(contract, 'USD');

    expect(mockCalculateCompoundedProductFee).toHaveBeenCalled();
    expect(product.convertedFees).toBeCloseTo(200);
    expect(product.compoundedFees).toBeCloseTo(400);
  });

  it('converts off a prefetched rate table without fetching per contract', async () => {
    const quote = jest.fn<(from: string, startDate: string | null) => number>(
      () => 1.6,
    );
    const prefetched: BaseCurrencyRates = {
      target: 'EUR',
      quote,
      multiplier: quote,
    };

    const contract = {
      currency: 'GBP',
      term_start_date: [
        { date: '2023-06-15', updated_at: '2023-06-15T00:00:00Z' },
      ],
      vendor_products_details: [{ product_id: 1, fees: 100 }],
    };

    const [product] = await convertAllProductsToUSD(
      contract,
      'EUR',
      prefetched,
    );

    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
    expect(quote).toHaveBeenCalledWith('GBP', '2023-06-15');
    expect(product.convertedFees).toBeCloseTo(160);
    expect(product.compoundedFees).toBeCloseTo(160);
    expect(product.fees).toBe(100);
    expect(product.fxRate).toBeCloseTo(1.6);
    expect(product.fxDate).toBe('2023-06-15');
    expect(product.fxTargetCurrency).toBe('EUR');
  });

  it('stamps a null fxRate when the prefetched table has no quote for the pair', async () => {
    const prefetched: BaseCurrencyRates = {
      target: 'EUR',
      quote: () => null,
      multiplier: () => 1,
    };

    const contract = {
      currency: 'GBP',
      term_start_date: [
        { date: '2023-06-15', updated_at: '2023-06-15T00:00:00Z' },
      ],
      vendor_products_details: [{ product_id: 1, fees: 100 }],
    };

    const [product] = await convertAllProductsToUSD(
      contract,
      'EUR',
      prefetched,
    );

    expect(product.convertedFees).toBe(100);
    expect(product.fxRate).toBeNull();
    expect(product.fxDate).toBeNull();
  });

  it('returns an empty array when the contract has no products', async () => {
    expect(await convertAllProductsToUSD({ currency: 'USD' }, 'EUR')).toEqual(
      [],
    );
    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
  });
});
