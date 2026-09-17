/**
 * enrichWithPricing / enrichWithAmendments base-currency conversion (PSK-1796).
 *
 * Both legacy enrichment paths convert each contract's recorded fee at the
 * rate of the day THAT contract started — the same rule the spend engine's
 * committed basis applies — and neither may touch the rate provider when the
 * whole set is already denominated in the base currency.
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

jest.mock('@/app/lib/budget', () => ({
  __esModule: true,
  generatePriceHistory: jest.fn(() => ({ periods: [] })),
  extractBudgetFromPriceHistory: jest.fn(() => ({ currentProducts: [] })),
  calculateCompoundedProductFee: jest.fn(),
}));

import { enrichWithPricing } from '@/lib/v2/core/pricing';
import { enrichWithAmendments } from '@/lib/v2/core/amendments';
import { extractProducts } from '@/lib/v2/core/products';
import type { ContractWithLineage } from '@/lib/v2/core/types';

function makeContract(
  id: number,
  currency: string,
  fees: number,
  startDate: string | null,
): ContractWithLineage {
  return {
    id,
    vendor_id: id,
    vendor_name: `vendor-${id}`,
    contract: {
      id,
      currency,
      vendor_products_details: [],
      term_start_date: startDate
        ? [{ date: startDate, updated_at: `${startDate}T00:00:00Z` }]
        : [],
    },
    products: [
      {
        product_id: id * 10,
        name: `product-${id}`,
        fees,
        year: 1,
        sourceContractId: id,
        isSuperseded: false,
        isSuperseding: false,
      },
    ],
    isLinkedChildInvoice: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDailyUsdRates.mockResolvedValue(new Map());
  mockGetLatestUsdRates.mockResolvedValue({ USD: 1 });
});

describe('enrichWithPricing base-currency conversion', () => {
  it('prices each contract at its own start date, and undated ones at the latest rate', async () => {
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([['EUR', new Map([['2023-01-01', 0.8]])]]),
    );
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.5, GBP: 0.5 });

    const result = await enrichWithPricing(
      [
        makeContract(1, 'EUR', 100, '2023-01-01'),
        makeContract(2, 'GBP', 50, null),
      ],
      1,
      { baseCurrency: 'USD' },
    );

    // One prefetch for the whole set, reaching back to the earliest start.
    expect(mockGetDailyUsdRates).toHaveBeenCalledTimes(1);
    expect(mockGetDailyUsdRates.mock.calls[0][1]).toBe('2023-01-01');

    // 100 EUR at 0.8 EUR/USD = 125 USD (start-date rate, not the latest 0.5).
    expect(result[0].products[0].currentFeeUSD).toBeCloseTo(125);
    // 50 GBP with no start date falls to the latest rate: 100 USD.
    expect(result[1].products[0].currentFeeUSD).toBeCloseTo(100);
  });

  it('converts into a non-USD base by crossing through USD', async () => {
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([
        ['GBP', new Map([['2023-03-01', 0.5]])],
        ['EUR', new Map([['2023-03-01', 0.8]])],
      ]),
    );

    const result = await enrichWithPricing(
      [makeContract(1, 'GBP', 100, '2023-03-01')],
      1,
      { baseCurrency: 'EUR' },
    );

    // 100 GBP -> 200 USD -> 160 EUR.
    expect(result[0].products[0].currentFeeUSD).toBeCloseTo(160);
  });

  it('never touches the provider when every contract is already in the base currency', async () => {
    const result = await enrichWithPricing(
      [
        makeContract(1, 'EUR', 100, '2023-01-01'),
        makeContract(2, 'eur', 50, '2024-01-01'),
      ],
      1,
      { baseCurrency: 'EUR' },
    );

    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
    expect(result[0].products[0].currentFeeUSD).toBe(100);
    expect(result[1].products[0].currentFeeUSD).toBe(50);
  });

  it('keeps native values and fetches nothing when skipExchangeRates is set', async () => {
    const result = await enrichWithPricing(
      [makeContract(1, 'EUR', 100, '2023-01-01')],
      1,
      { baseCurrency: 'USD', skipExchangeRates: true },
    );

    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
    expect(result[0].products[0].currentFeeUSD).toBe(100);
  });

  it('defaults to USD when no base currency is stated', async () => {
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([['EUR', new Map([['2023-01-01', 0.8]])]]),
    );

    const result = await enrichWithPricing(
      [makeContract(1, 'EUR', 100, '2023-01-01')],
      1,
    );

    expect(result[0].products[0].currentFeeUSD).toBeCloseTo(125);
  });
});

/** The contract row type enrichWithAmendments consumes (not exported). */
type AmendmentInput = Parameters<typeof enrichWithAmendments>[0][number];

/**
 * Only the fields conversion reads; the full contract row carries ~80 more
 * that nothing on this path touches.
 */
function makeAmendmentContract(
  id: number,
  currency: string,
  fees: number,
  startDate: string,
): AmendmentInput {
  return {
    id,
    currency,
    term_start_date: [
      { date: startDate, updated_at: `${startDate}T00:00:00Z` },
    ],
    vendor_products_details: [
      { product_id: 1, year: 1, fees, vendor_products: { id: 1, name: 'P1' } },
    ],
  } as unknown as AmendmentInput;
}

describe('enrichWithAmendments base-currency conversion', () => {
  it('prices each fee at its own contract start date, amendment included', async () => {
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([
        ['EUR', new Map([['2023-01-01', 0.8]])],
        ['GBP', new Map([['2024-01-01', 0.5]])],
      ]),
    );
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.1, GBP: 0.1 });

    // Contract 2 supersedes contract 1's only product.
    const [parent] = await enrichWithAmendments(
      [
        makeAmendmentContract(1, 'EUR', 100, '2023-01-01'),
        makeAmendmentContract(2, 'GBP', 200, '2024-01-01'),
      ],
      [{ parent_contract_id: 1, child_contract_id: 2 }],
      1,
      { baseCurrency: 'USD' },
    );

    // 100 EUR at the parent's own 2023 rate = 125 USD.
    expect(parent.products[0].currentFeeUSD).toBeCloseTo(125);
    // The effective fee is the amendment's 200 GBP at the AMENDMENT's 2024
    // rate (400 USD) — not the parent's rate, and not the latest one.
    expect(parent.products[0].effectiveFeeUSD).toBeCloseTo(400);
    expect(parent.products[0].feeSourceContractId).toBe(2);
  });

  it('never touches the provider when every contract is already in the base currency', async () => {
    const [parent] = await enrichWithAmendments(
      [makeAmendmentContract(1, 'EUR', 100, '2023-01-01')],
      [],
      1,
      { baseCurrency: 'EUR' },
    );

    expect(mockGetDailyUsdRates).not.toHaveBeenCalled();
    expect(mockGetLatestUsdRates).not.toHaveBeenCalled();
    expect(parent.products[0].currentFeeUSD).toBe(100);
  });

  it('stamps the native pair and extractProducts carries it through (psk-1796)', async () => {
    mockGetDailyUsdRates.mockResolvedValue(
      new Map([
        ['EUR', new Map([['2023-01-01', 0.8]])],
        ['GBP', new Map([['2024-01-01', 0.5]])],
      ]),
    );
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.1, GBP: 0.1 });

    // Contract 2 (GBP) supersedes contract 1's (EUR) only product, so the
    // effective fee is natively the AMENDMENT's: 200 GBP, not 100 EUR.
    const enriched = await enrichWithAmendments(
      [
        makeAmendmentContract(1, 'EUR', 100, '2023-01-01'),
        makeAmendmentContract(2, 'GBP', 200, '2024-01-01'),
      ],
      [{ parent_contract_id: 1, child_contract_id: 2 }],
      1,
      { baseCurrency: 'USD' },
    );
    const [parent] = enriched;

    expect(parent.products[0].effectiveFee).toBe(200);
    expect(parent.products[0].effectiveFeeCurrency).toBe('GBP');

    // The seam the inventory regression slipped through: extractProducts
    // rebuilds each product with an explicit field list, and every inventory
    // row silently fell back to the base denomination when this copy dropped
    // the pair. Pin the whole path the inventory service actually walks.
    const products = extractProducts(enriched);
    const parentProduct = products.find((p) => p.contract_id === 1)!;
    expect(parentProduct.effectiveFee).toBe(200);
    expect(parentProduct.effectiveFeeCurrency).toBe('GBP');
  });
});
