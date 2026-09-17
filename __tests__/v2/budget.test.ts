import { calculateBudgetTotals } from '@/lib/v2/core/budget';
import { ContractWithPricing } from '@/lib/v2/core/types';
import { getTermLength } from '@/app/lib/budget/priceHistoryCalculator';

describe('calculateBudgetTotals', () => {
  it('calculates totals for contracts without superseding', () => {
    const contracts = [
      {
        id: 1,
        products: [
          { product_id: 1, isSuperseded: false },
          { product_id: 2, isSuperseded: false },
        ],
        priceHistory: {
          totalContractValueUSD: 36000,
          vendorProductDetails: [],
          periods: [
            {
              isCurrentTerm: true,
              isActivePeriod: true,
              termIndex: 0,
              yearWithinTerm: 0,
              feesUSD: 3000,
              productFees: [],
            },
            {
              isCurrentTerm: true,
              termIndex: 0,
              yearWithinTerm: 1,
              feesUSD: 3500,
              productFees: [],
            },
          ],
        },
      },
    ] as ContractWithPricing[];

    const result = calculateBudgetTotals(contracts);

    expect(result.currentTotal).toBe(3000);
    expect(result.projectedTotal).toBe(3500);
    expect(result.totalContractValue).toBe(36000);
  });

  it('excludes fully superseded contracts', () => {
    const contracts = [
      {
        id: 1,
        products: [{ product_id: 1, isSuperseded: false }],
        priceHistory: {
          totalContractValueUSD: 12000,
          vendorProductDetails: [],
          periods: [
            {
              isCurrentTerm: true,
              isActivePeriod: true,
              feesUSD: 1000,
              productFees: [],
            },
          ],
        },
      },
      {
        id: 2,
        products: [{ product_id: 1, isSuperseded: true }],
        priceHistory: {
          totalContractValueUSD: 0,
          vendorProductDetails: [],
          periods: [
            {
              isCurrentTerm: true,
              isActivePeriod: true,
              feesUSD: 1500,
              productFees: [],
            },
          ],
        },
      },
    ] as ContractWithPricing[];

    const result = calculateBudgetTotals(contracts);

    // Contract 2 is excluded because all products are superseded
    expect(result.currentTotal).toBe(1000);
    expect(result.totalContractValue).toBe(12000);
  });

  it('includes contracts with mixed superseding products', () => {
    // Amendment with some superseding products - not excluded because not all products are superseded
    const contracts = [
      {
        id: 1,
        products: [
          { product_id: 1, isSuperseded: false },
          { product_id: 2, isSuperseded: false },
        ],
        priceHistory: {
          totalContractValueUSD: 6000,
          vendorProductDetails: [],
          periods: [
            {
              isCurrentTerm: true,
              isActivePeriod: true,
              termIndex: 0,
              yearWithinTerm: 0,
              feesUSD: 500,
              productFees: [],
            },
            {
              isCurrentTerm: true,
              termIndex: 0,
              yearWithinTerm: 1,
              feesUSD: 600,
              productFees: [],
            },
          ],
        },
      },
    ] as ContractWithPricing[];

    const result = calculateBudgetTotals(contracts);

    expect(result.currentTotal).toBe(500);
    expect(result.projectedTotal).toBe(600);
    expect(result.totalContractValue).toBe(6000);
  });

  it('excludes contracts where all products are superseded', () => {
    // Parent contract where the product has been superseded by an amendment
    const contracts = [
      {
        id: 646,
        products: [
          {
            product_id: 1,
            isSuperseded: true,
          },
        ],
        priceHistory: {
          totalContractValueUSD: 18000,
          vendorProductDetails: [],
          periods: [
            {
              isCurrentTerm: true,
              isActivePeriod: true,
              feesUSD: 1500,
              productFees: [],
            },
          ],
        },
      },
    ] as ContractWithPricing[];

    const result = calculateBudgetTotals(contracts);

    // Excluded because all products are superseded (fees are in the amendment)
    expect(result.currentTotal).toBe(0);
    expect(result.totalContractValue).toBe(0);
  });

  it('handles contracts with no priceHistory', () => {
    const contracts = [
      {
        id: 1,
        vendor_id: 1,
        vendor_name: 'Test',
        contract: {},
        products: [],
        priceHistory: null,
        isLinkedChildInvoice: false,
      },
    ] as ContractWithPricing[];

    const result = calculateBudgetTotals(contracts);

    expect(result.currentTotal).toBe(0);
    expect(result.projectedTotal).toBe(0);
    expect(result.totalContractValue).toBe(0);
  });

  it('includes contracts with no periods (zero budget)', () => {
    const contracts = [
      {
        id: 1,
        products: [{ product_id: 1, isSuperseded: false }],
        priceHistory: {
          totalContractValueUSD: 12000,
          vendorProductDetails: [],
          periods: [],
        },
      },
    ] as ContractWithPricing[];

    const result = calculateBudgetTotals(contracts);

    expect(result.currentTotal).toBe(0);
    expect(result.projectedTotal).toBe(0);
    expect(result.totalContractValue).toBe(12000);
  });

  it('returns 0 for projected when no next period exists', () => {
    const contracts = [
      {
        id: 1,
        products: [{ product_id: 1, isSuperseded: false }],
        priceHistory: {
          totalContractValueUSD: 12000,
          vendorProductDetails: [],
          periods: [
            {
              isCurrentTerm: true,
              isActivePeriod: true,
              termIndex: 0,
              yearWithinTerm: 0,
              feesUSD: 1000,
              productFees: [],
            },
          ],
        },
      },
    ] as ContractWithPricing[];

    const result = calculateBudgetTotals(contracts);

    expect(result.currentTotal).toBe(1000);
    // No next period, so projected is 0
    expect(result.projectedTotal).toBe(0);
  });

  it('aggregates multiple contracts correctly', () => {
    const contracts = [
      {
        id: 1,
        products: [{ product_id: 1, isSuperseded: false }],
        priceHistory: {
          totalContractValueUSD: 12000,
          vendorProductDetails: [],
          periods: [
            {
              isCurrentTerm: true,
              isActivePeriod: true,
              termIndex: 0,
              yearWithinTerm: 0,
              feesUSD: 1000,
              productFees: [],
            },
            {
              isCurrentTerm: true,
              termIndex: 0,
              yearWithinTerm: 1,
              feesUSD: 1100,
              productFees: [],
            },
          ],
        },
      },
      {
        id: 2,
        products: [{ product_id: 2, isSuperseded: false }],
        priceHistory: {
          totalContractValueUSD: 24000,
          vendorProductDetails: [],
          periods: [
            {
              isCurrentTerm: true,
              isActivePeriod: true,
              termIndex: 0,
              yearWithinTerm: 0,
              feesUSD: 2000,
              productFees: [],
            },
            {
              isCurrentTerm: true,
              termIndex: 0,
              yearWithinTerm: 1,
              feesUSD: 2200,
              productFees: [],
            },
          ],
        },
      },
    ] as ContractWithPricing[];

    const result = calculateBudgetTotals(contracts);

    expect(result.currentTotal).toBe(3000);
    expect(result.projectedTotal).toBe(3300);
    expect(result.totalContractValue).toBe(36000);
  });

  it('handles empty contracts array', () => {
    const result = calculateBudgetTotals([]);

    expect(result.currentTotal).toBe(0);
    expect(result.projectedTotal).toBe(0);
    expect(result.totalContractValue).toBe(0);
  });
});

describe('Partial Amendment Integration', () => {
  it('includes partial amendments in totals correctly', () => {
    // Parent contract where product 1 has been superseded
    const parentContract = {
      id: 100,
      products: [
        {
          product_id: 1,
          isSuperseded: true,
        },
      ],
      priceHistory: {
        totalContractValueUSD: 18000,
        vendorProductDetails: [],
        periods: [
          {
            isCurrentTerm: true,
            isActivePeriod: true,
            feesUSD: 1000,
            productFees: [],
          },
        ],
      },
    };

    // Amendment that supersedes product 1 and adds product 2
    const partialAmendment = {
      id: 110,
      products: [
        { product_id: 1, isSuperseded: false },
        { product_id: 2, isSuperseded: false },
      ],
      priceHistory: {
        totalContractValueUSD: 6000,
        vendorProductDetails: [],
        periods: [
          {
            isCurrentTerm: true,
            isActivePeriod: true,
            feesUSD: 2000,
            productFees: [],
          },
        ],
      },
    };

    const contracts = [
      parentContract,
      partialAmendment,
    ] as ContractWithPricing[];
    const result = calculateBudgetTotals(contracts);

    // Parent excluded (all products superseded), amendment included
    expect(result.currentTotal).toBe(2000);
    expect(result.totalContractValue).toBe(6000);
  });

  it('includes both contracts when parent has non-superseded products', () => {
    // Parent with one superseded and one non-superseded product
    const parentContract = {
      id: 100,
      products: [
        { product_id: 1, isSuperseded: true },
        { product_id: 2, isSuperseded: false },
      ],
      priceHistory: {
        totalContractValueUSD: 18000,
        vendorProductDetails: [],
        periods: [
          {
            isCurrentTerm: true,
            isActivePeriod: true,
            feesUSD: 1500,
            productFees: [],
          },
        ],
      },
    };

    // Amendment that adds product 3
    const amendment = {
      id: 110,
      products: [{ product_id: 3, isSuperseded: false }],
      priceHistory: {
        totalContractValueUSD: 6000,
        vendorProductDetails: [],
        periods: [
          {
            isCurrentTerm: true,
            isActivePeriod: true,
            feesUSD: 500,
            productFees: [],
          },
        ],
      },
    };

    const contracts = [parentContract, amendment] as ContractWithPricing[];
    const result = calculateBudgetTotals(contracts);

    // Both included (parent not fully superseded)
    expect(result.currentTotal).toBe(2000);
    expect(result.totalContractValue).toBe(24000);
  });
});

describe('getTermLength', () => {
  describe('no end date fallback', () => {
    it('returns 12 months when no endDate and no expectedTermLength', () => {
      expect(getTermLength('2024-01-01', null)).toBe(12);
      expect(getTermLength('2024-01-01', undefined)).toBe(12);
    });

    it('returns expectedTermLength when no endDate', () => {
      expect(getTermLength('2024-01-01', null, 24)).toBe(24);
      expect(getTermLength('2024-01-01', null, 36)).toBe(36);
    });
  });

  describe('exact month boundaries', () => {
    it('calculates Jan 1 - Dec 31 as 12 months', () => {
      expect(getTermLength('2024-01-01', '2024-12-31')).toBe(12);
    });

    it('calculates 3-year contract correctly', () => {
      expect(getTermLength('2024-01-01', '2026-12-31')).toBe(36);
    });

    it('calculates 2-year contract correctly', () => {
      expect(getTermLength('2024-01-01', '2025-12-31')).toBe(24);
    });
  });

  describe('15-day rounding threshold', () => {
    it('does not round up when only 5 remaining days', () => {
      // Jan 1 - Jan 5: 0 full months + 5 days ≤ 15 → returns minimum 1
      expect(getTermLength('2024-01-01', '2024-01-05')).toBe(1);
    });

    it('does not round up when exactly 15 remaining days', () => {
      // Jan 1 - Jan 15: 0 full months + 15 days = 15 → no round up
      expect(getTermLength('2024-01-01', '2024-01-15')).toBe(1);
    });

    it('rounds up when 16 remaining days', () => {
      // Jan 1 - Jan 16: 0 full months + 16 days > 15 → 1 month
      expect(getTermLength('2024-01-01', '2024-01-16')).toBe(1);
    });

    it('rounds up Jan 15 - Feb 10 to 1 month', () => {
      // Jan 15 - Feb 10: 0 full months + 26 days > 15 → 1 month
      expect(getTermLength('2024-01-15', '2024-02-10')).toBe(1);
    });
  });

  describe('product year tie-breaker', () => {
    it('trusts dates when product years match calculated years', () => {
      // 3-year contract, subscription_term=12, maxProductYear=3 → trust dates (36)
      expect(getTermLength('2024-01-01', '2026-12-31', 12, 3)).toBe(36);
    });

    it('trusts expectedTermLength when product years match expected years', () => {
      // Dates suggest 36 months, subscription_term=12, maxProductYear=1 → trust subscription_term
      expect(getTermLength('2024-01-01', '2026-12-31', 12, 1)).toBe(12);
    });

    it('trusts expectedTermLength when product years align with it', () => {
      // Dates suggest 12 months, subscription_term=36, maxProductYear=3 → trust subscription_term
      expect(getTermLength('2024-01-01', '2024-12-31', 36, 3)).toBe(36);
    });

    it('does not use tie-breaker when maxProductYear is missing', () => {
      // Without product year tie-breaker, use ±1 tolerance logic
      expect(getTermLength('2024-01-01', '2026-12-31', 12, null)).toBe(36);
      expect(getTermLength('2024-01-01', '2026-12-31', 12, undefined)).toBe(36);
    });
  });

  describe('±1 month tolerance', () => {
    it('uses expectedTermLength when it is calculated + 1', () => {
      // Calculated = 11 months, expected = 12 → returns 12
      expect(getTermLength('2024-01-01', '2024-11-30', 12)).toBe(12);
    });

    it('uses expectedTermLength when it is calculated - 1', () => {
      // Calculated = 12 months, expected = 11 → returns 11
      expect(getTermLength('2024-01-01', '2024-12-31', 11)).toBe(11);
    });

    it('does not use expectedTermLength when difference > 1', () => {
      // Calculated = 24 months, expected = 12 → returns calculated (24)
      expect(getTermLength('2024-01-01', '2025-12-31', 12)).toBe(24);
    });

    it('does not use expectedTermLength when difference < -1', () => {
      // Calculated = 12 months, expected = 10 → returns calculated (12)
      expect(getTermLength('2024-01-01', '2024-12-31', 10)).toBe(12);
    });
  });

  describe('month-to-year conversion boundaries', () => {
    it('17 months rounds to 1 year - trusts dates when maxProductYear=1', () => {
      // 17-month contract: Math.round(17/12) = 1 year
      // maxProductYear=1 matches calcYears=1 → trusts dates (17 months)
      expect(getTermLength('2024-01-01', '2025-05-31', 12, 1)).toBe(17);
    });

    it('18 months rounds to 2 years - trusts dates when maxProductYear=2', () => {
      // 18-month contract: Math.round(18/12) = 2 years
      // maxProductYear=2 matches calcYears=2 → trusts dates (18 months)
      expect(getTermLength('2024-01-01', '2025-06-30', 24, 2)).toBe(18);
    });

    it('17 months with maxProductYear=2 trusts expectedTermLength', () => {
      // 17-month contract: Math.round(17/12) = 1 year
      // expectedTermLength=24: Math.round(24/12) = 2 years
      // maxProductYear=2 matches expectedYears=2 → trusts expectedTermLength
      expect(getTermLength('2024-01-01', '2025-05-31', 24, 2)).toBe(24);
    });
  });

  describe('minimum return value', () => {
    it('returns at least 1 month for very short contracts', () => {
      expect(getTermLength('2024-01-01', '2024-01-01')).toBe(1);
    });
  });

  describe('real contract scenarios from production data', () => {
    it('handles contract 252: Oct 23 2023 - Oct 22 2026 (3-year deal)', () => {
      // subscription_term=12, but dates show 36 months
      expect(getTermLength('2023-10-23', '2026-10-22', 12, 3)).toBe(36);
    });

    it('handles contract 403: Jul 1 2007 - Jun 30 2010 (3-year deal)', () => {
      // subscription_term=12, renewal_period=12, dates show 36 months
      expect(getTermLength('2007-07-01', '2010-06-30', 12, 3)).toBe(36);
    });

    it('handles contract 1097: Sep 1 2023 - Aug 31 2026 (3-year deal)', () => {
      // subscription_term=24, dates show 36 months
      expect(getTermLength('2023-09-01', '2026-08-31', 24, 3)).toBe(36);
    });
  });
});
