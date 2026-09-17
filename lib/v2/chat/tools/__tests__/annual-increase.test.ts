import { describe, expect, it } from '@jest/globals';

import { runAnnualIncreaseQuery } from '@/lib/v2/chat/tools/annual-increase';
import type { AnnualIncreaseResult } from '@/lib/v2/chat/types';

type ContractsListItem = Parameters<typeof runAnnualIncreaseQuery>[0][number];

const DEFAULT_PRICE_HISTORY = {
  annualContractValueUSD: 10000,
  annualContractValue: 10000,
  periods: [],
  vendorProductDetails: [],
};

function makeContract(
  overrides: Partial<Record<string, unknown>> = {},
  priceHistory: unknown = DEFAULT_PRICE_HISTORY,
): ContractsListItem {
  return {
    contract: {
      id: 1,
      type_id: 1,
      status_id: 4,
      vendor_id: 1,
      vendors: { name: 'Test Vendor' },
      annual_increase: null,
      currency: 'USD',
      ...overrides,
    },
    products: [],
    priceHistory,
  } as unknown as ContractsListItem;
}

describe('runAnnualIncreaseQuery', () => {
  it('returns AnnualIncreaseResult type', () => {
    const result = runAnnualIncreaseQuery([]);

    expect(result.type).toBe('annual_increase');
    expect(result.contracts).toEqual([]);
  });

  it('returns contracts with annual increase fields', () => {
    const contracts = [
      makeContract({
        id: 10,
        vendors: { name: 'Acme Corp' },
        annual_increase: 3.5,
      }),
    ];

    const result: AnnualIncreaseResult = runAnnualIncreaseQuery(contracts);

    expect(result.type).toBe('annual_increase');
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0].id).toBe(10);
    expect(result.contracts[0].vendor).toBe('Acme Corp');
    expect(result.contracts[0].annualIncrease).toBe(3.5);
  });

  it('sorts by annualDifference descending', () => {
    const lowImpactHistory = {
      annualContractValueUSD: 10000,
      annualContractValue: 10000,
      periods: [
        {
          isCurrentTerm: true,
          isActivePeriod: true,
          termIndex: 0,
          yearWithinTerm: 0,
          fees: 5000,
          feesUSD: 5000,
          productFees: [],
        },
        {
          isCurrentTerm: true,
          isActivePeriod: false,
          termIndex: 0,
          yearWithinTerm: 1,
          fees: 5500,
          feesUSD: 5500,
          productFees: [],
        },
      ],
      vendorProductDetails: [],
    };
    const highImpactHistory = {
      annualContractValueUSD: 10000,
      annualContractValue: 10000,
      periods: [
        {
          isCurrentTerm: true,
          isActivePeriod: true,
          termIndex: 0,
          yearWithinTerm: 0,
          fees: 5000,
          feesUSD: 5000,
          productFees: [],
        },
        {
          isCurrentTerm: true,
          isActivePeriod: false,
          termIndex: 0,
          yearWithinTerm: 1,
          fees: 8000,
          feesUSD: 8000,
          productFees: [],
        },
      ],
      vendorProductDetails: [],
    };

    const contracts = [
      makeContract(
        { id: 1, vendors: { name: 'Low Impact' } },
        lowImpactHistory,
      ),
      makeContract(
        { id: 2, vendors: { name: 'High Impact' } },
        highImpactHistory,
      ),
    ];

    const result = runAnnualIncreaseQuery(contracts);

    expect(result.contracts).toHaveLength(2);
    expect(result.contracts[0].annualDifference).toBeGreaterThan(
      result.contracts[1].annualDifference,
    );
  });

  it('handles contracts with null annualIncrease', () => {
    const contracts = [
      makeContract({
        id: 5,
        annual_increase: null,
      }),
    ];

    const result = runAnnualIncreaseQuery(contracts);

    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0].annualIncrease).toBeNull();
  });

  it('handles missing priceHistory gracefully', () => {
    const contracts = [
      makeContract({ id: 7, vendor_products_details: [{ fees: 100 }] }, null),
    ];

    const result = runAnnualIncreaseQuery(contracts);

    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0].annualDifference).toBe(0);
  });
});
