/**
 * Budget calculation module
 *
 * This module provides utilities for calculating budgets, contract renewals,
 * fee compounding, and related financial operations.
 */

// Export types
export type { Contract } from './types';
export type { Product } from './contractStatusUtils';

export type { FiscalYearInfo } from './dateUtils';

export type { CompoundedFeeResult } from './feeCalculator';

// Export price history utilities
export {
  generatePriceHistory,
  generatePriceHistories,
} from './priceHistoryCalculator';
export type { PriceHistoryOptions } from './priceHistoryCalculator';
export { extractBudgetFromPriceHistory } from './priceHistoryProducts';

// Export date utilities
export {
  calculateContractYear,
  getFiscalYearInfo,
  getLatestDate,
  getProductYearLabel,
} from './dateUtils';

// Export contract status utilities
export {
  isContractRenewed,
  isContractActive,
  willContractRenew,
  calculateRenewalCount,
} from './contractStatusUtils';

// Export product selection utilities
export {
  determineProductYear,
  groupProductsByYear,
  shouldUseExactProductFees,
} from './productSelectionStrategy';

// Export fee calculation utilities
export {
  calculateCompoundedFee,
  calculateProductFees,
  calculateCompoundedProductFee,
} from './feeCalculator';

// Export currency utilities
export { calculateTotalFees } from './currencyUtils';

// Export invoice utilities
export {
  normalizeBillingFrequency,
  calculateFrequencyMultiplier,
  calculateInvoiceDiscrepancy,
  getAnnualFactorForFrequency,
} from './invoiceUtils';
export type {
  BillingFrequency,
  InvoiceNormalizationResult,
} from './invoiceUtils';
