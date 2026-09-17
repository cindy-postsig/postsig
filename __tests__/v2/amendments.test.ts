import {
  shouldExcludeFromAggregations,
  getContributingProducts,
  getEffectiveFee,
  getEffectiveTCV,
} from '@/lib/v2/core/budget';
import { ContractWithPricing, ProductWithPricing } from '@/lib/v2/core/types';

describe('Amendment Utilities', () => {
  describe('shouldExcludeFromAggregations', () => {
    it('returns true when all products are superseded', () => {
      const contract = {
        id: 1,
        products: [
          { product_id: 1, isSuperseded: true },
          { product_id: 2, isSuperseded: true },
        ],
      } as ContractWithPricing;

      expect(shouldExcludeFromAggregations(contract)).toBe(true);
    });

    it('returns false when some products are not superseded', () => {
      const contract = {
        id: 1,
        products: [
          { product_id: 1, isSuperseded: true },
          { product_id: 2, isSuperseded: false },
        ],
      } as ContractWithPricing;

      expect(shouldExcludeFromAggregations(contract)).toBe(false);
    });

    it('returns false when no products are superseded', () => {
      const contract = {
        id: 1,
        products: [
          { product_id: 1, isSuperseded: false },
          { product_id: 2, isSuperseded: false },
        ],
      } as ContractWithPricing;

      expect(shouldExcludeFromAggregations(contract)).toBe(false);
    });

    it('returns false when products array is empty', () => {
      const contract = {
        id: 1,
        products: [],
      } as unknown as ContractWithPricing;

      expect(shouldExcludeFromAggregations(contract)).toBe(false);
    });
  });

  describe('getContributingProducts', () => {
    it('filters out superseding products', () => {
      const products = [
        { product_id: 1, isSuperseding: false, currentFeeUSD: 100 },
        { product_id: 2, isSuperseding: true, currentFeeUSD: 200 },
        { product_id: 3, isSuperseding: false, currentFeeUSD: 300 },
      ] as ProductWithPricing[];

      const result = getContributingProducts(products);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.product_id)).toEqual([1, 3]);
    });

    it('returns all products when none are superseding', () => {
      const products = [
        { product_id: 1, isSuperseding: false },
        { product_id: 2, isSuperseding: false },
      ] as ProductWithPricing[];

      const result = getContributingProducts(products);

      expect(result).toHaveLength(2);
    });

    it('returns empty array when all products are superseding', () => {
      const products = [
        { product_id: 1, isSuperseding: true },
        { product_id: 2, isSuperseding: true },
      ] as ProductWithPricing[];

      const result = getContributingProducts(products);

      expect(result).toHaveLength(0);
    });

    it('handles empty array', () => {
      const result = getContributingProducts([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('getEffectiveFee', () => {
    it('returns effectiveFeeUSD when available', () => {
      const product = {
        effectiveFeeUSD: 1500,
        currentFeeUSD: 1000,
      } as ProductWithPricing;

      expect(getEffectiveFee(product)).toBe(1500);
    });

    it('falls back to currentFeeUSD when effectiveFeeUSD is undefined', () => {
      const product = {
        effectiveFeeUSD: undefined,
        currentFeeUSD: 1000,
      } as unknown as ProductWithPricing;

      expect(getEffectiveFee(product)).toBe(1000);
    });

    it('returns 0 when both are undefined', () => {
      const product = {
        effectiveFeeUSD: undefined,
        currentFeeUSD: undefined,
      } as unknown as ProductWithPricing;

      expect(getEffectiveFee(product)).toBe(0);
    });

    it('returns 0 when effectiveFeeUSD is 0', () => {
      const product = {
        effectiveFeeUSD: 0,
        currentFeeUSD: 1000,
      } as ProductWithPricing;

      expect(getEffectiveFee(product)).toBe(0);
    });
  });

  describe('getEffectiveTCV', () => {
    it('returns effectiveTcvUSD from budget extraction when periods have effectiveFeesUSD', () => {
      const contract = {
        priceHistory: {
          totalContractValueUSD: 10000,
          totalContractValue: 8000,
          vendorProductDetails: [],
          periods: [
            {
              isCurrentTerm: true,
              isActivePeriod: true,
              feesUSD: 10000,
              effectiveFeesUSD: 12000,
              productFees: [],
            },
          ],
        },
      } as ContractWithPricing;

      expect(getEffectiveTCV(contract)).toBe(12000);
    });

    it('falls back to totalContractValueUSD', () => {
      const contract = {
        priceHistory: {
          effectiveTotalContractValueUSD: undefined,
          totalContractValueUSD: 10000,
          totalContractValue: 8000,
        },
      } as ContractWithPricing;

      expect(getEffectiveTCV(contract)).toBe(10000);
    });

    it('falls back to totalContractValue', () => {
      const contract = {
        priceHistory: {
          effectiveTotalContractValueUSD: undefined,
          totalContractValueUSD: undefined,
          totalContractValue: 8000,
        },
      } as ContractWithPricing;

      expect(getEffectiveTCV(contract)).toBe(8000);
    });

    it('returns 0 when priceHistory is missing', () => {
      const contract = {
        priceHistory: null,
      } as ContractWithPricing;

      expect(getEffectiveTCV(contract)).toBe(0);
    });

    it('returns 0 when all values are undefined', () => {
      const contract = {
        priceHistory: {},
      } as ContractWithPricing;

      expect(getEffectiveTCV(contract)).toBe(0);
    });
  });
});

describe('Partial Amendment Scenarios', () => {
  it('correctly identifies partial amendment (mixed superseding)', () => {
    const contract = {
      id: 110,
      products: [
        { product_id: 1, isSuperseding: true, currentFeeUSD: 1500 },
        { product_id: 2, isSuperseding: false, currentFeeUSD: 500 },
      ],
    } as ContractWithPricing;

    // Not excluded because products are not superseded (this is the amendment)
    expect(shouldExcludeFromAggregations(contract)).toBe(false);

    const contributing = getContributingProducts(contract.products);
    expect(contributing).toHaveLength(1);
    expect(contributing[0].product_id).toBe(2);

    const totalContribution = contributing.reduce(
      (sum, p) => sum + getEffectiveFee(p),
      0,
    );
    expect(totalContribution).toBe(500);
  });

  it('correctly identifies fully superseded parent contract', () => {
    // Parent contract where all products have been replaced by an amendment
    const contract = {
      id: 646,
      products: [
        {
          product_id: 1,
          isSuperseded: true,
          effectiveFeeUSD: 1500,
          currentFeeUSD: 1000,
        },
      ],
      priceHistory: {
        totalContractValueUSD: 0,
      },
    } as ContractWithPricing;

    // Excluded because all products are superseded (fees are in the amendment)
    expect(shouldExcludeFromAggregations(contract)).toBe(true);
    expect(getEffectiveTCV(contract)).toBe(0);
  });

  it('correctly handles parent with partial superseding', () => {
    // Parent contract where only some products were superseded
    const contract = {
      id: 100,
      products: [
        {
          product_id: 1,
          isSuperseded: true,
          isSuperseding: false,
          effectiveFeeUSD: 1500,
          currentFeeUSD: 1000,
        },
        {
          product_id: 2,
          isSuperseded: false,
          isSuperseding: false,
          effectiveFeeUSD: 800,
          currentFeeUSD: 800,
        },
      ],
    } as ContractWithPricing;

    // Not excluded because not all products are superseded
    expect(shouldExcludeFromAggregations(contract)).toBe(false);

    // Both products contribute (superseded uses effectiveFeeUSD)
    const contributing = getContributingProducts(contract.products);
    expect(contributing).toHaveLength(2);
  });
});
