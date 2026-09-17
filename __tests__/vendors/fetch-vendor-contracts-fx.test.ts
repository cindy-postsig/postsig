import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { BaseCurrencyRates } from '@/lib/v2/core/baseRates';

const getUserMetadata = jest.fn<() => Promise<unknown>>();
jest.mock('@/data/users', () => ({
  getUserMetadata: () => getUserMetadata(),
}));

const fetchVendorContractsByUserRoles = jest.fn<() => Promise<unknown[]>>();
jest.mock('@/data/superuser/vendors', () => ({
  fetchVendorContractsByUserRoles: () => fetchVendorContractsByUserRoles(),
  findVendorsByUserRoles: jest.fn(),
  fetchSingleVendorByUserRoles: jest.fn(),
  fetchRelatedContractsByUserRoles: jest.fn(),
  fetchVendorNamesByUserRoles: jest.fn(),
  fetchVendorAndContractUsage: jest.fn(),
}));

const rates: BaseCurrencyRates = {
  target: 'EUR',
  quote: () => 1,
  multiplier: () => 1,
};
const buildBaseCurrencyRates =
  jest.fn<(...args: unknown[]) => Promise<BaseCurrencyRates>>();
jest.mock('@/lib/v2/core/baseRates', () => ({
  buildBaseCurrencyRates: (...args: unknown[]) =>
    buildBaseCurrencyRates(...args),
}));

const convertAllProductsToUSD =
  jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
jest.mock('@/lib/v2', () => ({
  convertAllProductsToUSD: (...args: unknown[]) =>
    convertAllProductsToUSD(...args),
}));

import { fetchVendorContracts } from '@/app/lib/vendors/actions';

describe('fetchVendorContracts FX prefetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserMetadata.mockResolvedValue({
      organizationId: 'org-1',
      userId: 'u-1',
      userRole: 11,
      baseCurrency: 'EUR',
    });
    buildBaseCurrencyRates.mockResolvedValue(rates);
    convertAllProductsToUSD.mockResolvedValue([]);
  });

  it('maps each contract currency and start date into one prefetch', async () => {
    fetchVendorContractsByUserRoles.mockResolvedValue([
      {
        id: 1,
        currency: 'USD',
        term_start_date: [{ date: '2023-06-15' }, { date: '2022-01-01' }],
        vendor_products_details: [],
      },
      {
        id: 2,
        currency: 'gbp',
        term_start_date: [{ date: '2024-03-01' }],
        vendor_products_details: [],
      },
    ]);

    await fetchVendorContracts({ id: 7 });

    expect(buildBaseCurrencyRates).toHaveBeenCalledTimes(1);
    expect(buildBaseCurrencyRates).toHaveBeenCalledWith(
      [
        { currency: 'USD', startDate: '2023-06-15' },
        { currency: 'gbp', startDate: '2024-03-01' },
      ],
      'EUR',
    );
  });

  it('passes missing currency and dates through as null-ish entries', async () => {
    fetchVendorContractsByUserRoles.mockResolvedValue([
      { id: 3, vendor_products_details: [] },
      {
        id: 4,
        currency: 'USD',
        term_start_date: [],
        vendor_products_details: [],
      },
    ]);

    await fetchVendorContracts({ id: 7 });

    expect(buildBaseCurrencyRates).toHaveBeenCalledWith(
      [
        { currency: undefined, startDate: null },
        { currency: 'USD', startDate: null },
      ],
      'EUR',
    );
  });

  it('hands every conversion the same prefetched table', async () => {
    fetchVendorContractsByUserRoles.mockResolvedValue([
      { id: 5, currency: 'USD', vendor_products_details: [] },
      { id: 6, currency: 'CHF', vendor_products_details: [] },
    ]);

    await fetchVendorContracts({ id: 7 });

    expect(convertAllProductsToUSD).toHaveBeenCalledTimes(2);
    for (const call of convertAllProductsToUSD.mock.calls) {
      expect(call[1]).toBe('EUR');
      expect(call[2]).toBe(rates);
    }
  });
});
