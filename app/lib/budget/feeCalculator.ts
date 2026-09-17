import { Contract, Product } from './contractStatusUtils';
import {
  calculateRenewalCount,
  isContractRenewed,
} from './contractStatusUtils';

/**
 * Interface for compounded fee calculation result
 */
export interface CompoundedFeeResult {
  compoundedFee: number;
  renewalCount: number;
  hasIncrease: boolean;
}

/**
 * Calculate compounded fees with annual increase
 * @param baseFee Base fee amount
 * @param annualIncrease Annual increase percentage
 * @param renewalCount Number of renewals to compound
 * @returns Compounded fee amount
 */
export function calculateCompoundedFee(
  baseFee: number,
  annualIncrease: number | undefined,
  renewalCount: number,
): number {
  if (!annualIncrease || renewalCount <= 0) {
    return baseFee;
  }

  // Calculate the increase factor
  const increase =
    annualIncrease < 100 ? 1 + annualIncrease / 100 : annualIncrease / 100;

  // Apply compounded increase
  return baseFee * Math.pow(increase, renewalCount);
}

/**
 * Calculate fees for a single product considering options
 * @param product Product to calculate fees for
 * @param contract Parent contract with annual increase and renewal info
 * @param options Calculation options:
 *   - isProjected: If true, calculates for the next period (adds 1 to renewal count)
 *   - useExactFees: If true, uses exact fees from product without applying annual increases
 *   - isMultiYearRenewal: If true, adjusts renewal count for multi-year renewal periods
 *   - productYear: The product year to consider for multi-year contracts
 * @returns Calculated fee amount with all applicable increases applied
 */
export function calculateProductFees(
  product: Product,
  contract: Contract,
  options: {
    isProjected?: boolean;
    useExactFees?: boolean;
    isMultiYearRenewal?: boolean;
    productYear?: number;
  } = {},
): number {
  const { isProjected, useExactFees, isMultiYearRenewal, productYear } =
    options;
  const baseFee = Number(product.fees) || 0;

  // If using exact fees (for multi-year contracts), skip annual increase
  if (useExactFees) {
    return baseFee;
  }

  // Get the correct renewal count - this already accounts for the time elapsed
  // and should be 2 for our example case (3 years with annual renewal)
  let renewalCount = calculateRenewalCount(contract);

  // For projected budget, we simulate the next renewal period
  if (isProjected) {
    // For consistency with how calculateCompoundedProductFee is used in ProductsLicensed.tsx,
    // we'll add 1 to show what the price will be at the next renewal
    renewalCount += 1;
  }

  // Adjust renewal count for multi-year renewals based on product year
  // This handles cases where a multi-year contract has different fees for different years
  if (isMultiYearRenewal && productYear && productYear > 1) {
    if (!isProjected) {
      // For current budget with future years (year 2+), adjust down
      // since we don't want to double-count the increases
      renewalCount = Math.max(0, renewalCount - 1);
    }
    // Note: For projected budget, we already added 1 above, so no need for special handling
  }

  return calculateCompoundedFee(
    baseFee,
    contract.annual_increase,
    renewalCount,
  );
}

/**
 * Calculate the compounded fee for a single product with renewal information
 * @param product Product to calculate for
 * @param contract Parent contract with annual increase and renewal info
 * @returns Object with compounded fee and renewal details
 */
export function calculateCompoundedProductFee(
  product: Product,
  contract: Contract,
): CompoundedFeeResult {
  // Get the renewal count
  const renewalCount = calculateRenewalCount(contract);

  // Calculate the compounded fee
  const originalFee = Number(product.fees) || 0;
  let compoundedFee = originalFee;

  if (
    contract.annual_increase &&
    contract.renewal_type !== 'One-Time' &&
    renewalCount > 0
  ) {
    // Calculate the increase factor
    const increase =
      contract.annual_increase < 100
        ? 1 + contract.annual_increase / 100
        : contract.annual_increase / 100;

    // Apply compounded increase
    compoundedFee = originalFee * Math.pow(increase, renewalCount);
  }

  return {
    compoundedFee,
    renewalCount,
    hasIncrease: compoundedFee > originalFee,
  };
}
