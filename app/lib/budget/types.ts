/**
 * Budget calculation related types that are shared across modules
 */

import { FiscalYearInfo } from './dateUtils';
import { Product } from './contractStatusUtils';
import { CompoundedFeeResult } from './feeCalculator';
import { Database } from '@/database.types';

/**
 * Result of a budget calculation
 */
export interface BudgetResult {
  current: number;
  projected: number;
  annualDifference: number;
  currentProducts: Product[];
  currentYearProducts: Product[];
  currency: string;
}

/**
 * Result of calculating budget for a specific period
 */
export interface BudgetPeriodResult {
  fees: number;
  products: Product[];
}

/**
 * Result of calculating contract total value
 */
export interface ContractTotalValueResult {
  totalValue: number;
  convertedTotalValue: number;
}

/**
 * Result of calculating budget totals
 */
export interface BudgetTotalsResult {
  currentTotal: number;
  projectedTotal: number;
  totalTCV: number;
  totalLifetimeValue: number;
}

/**
 * Export shared types from other modules
 */
export type { FiscalYearInfo, Product, CompoundedFeeResult };

export type BillingFrequency =
  | 'Annually'
  | 'Semi-Annually'
  | 'Bi-Annually'
  | 'Quarterly'
  | 'Monthly'
  | null;

export interface ProductFeeItem {
  productId: number;
  productName: string;
  fees: number;
}

export interface PriceHistoryPeriod {
  startDate: string;
  fees: number;
  productFees: ProductFeeItem[];
  isProjected: boolean; // kept for backward compatibility
  status: 'historical' | 'current' | 'projected'; // new field for more detailed status
}

//////

// Type for standardizing fiscal year context throughout the code
export type FiscalContext = {
  today: Date;
  currentFiscalYearStart: Date;
  nextFiscalYearStart: Date;
  fiscalYearStartMonth: number;
};

// Type for product fees calculated with annual increases
export type ProductFee = {
  productId: string | number;
  productName: string;
  fees: number;
  feesUSD: number;
  originalFees: number;
  originalFeesUSD: number;
  increasePercentage: number;
  isSuperseded?: boolean;
  // Amendment tracking
  isAmended?: boolean; // true if fees come from amendment
  feeSourceContractId?: number; // the amendment contract ID
  // Superseding tracking (for products that supersede a parent)
  isSuperseding?: boolean;
};

export type Contract = Database['public']['Tables']['contracts']['Row'] & {
  vendor_products_details: Array<{
    product_id: number;
    year?: number;
    fees?: number;
    convertedFees?: number;
    one_time_only?: boolean;
    vendor_products?: {
      name: string;
      id: number;
      data_delivery_types?: { id: number; name: string };
    };
  }>;
  users?: {
    organizations?: { fiscal_year_start_month?: number };
  };
  vendors?: { name: string; domain?: string };
  term_start_date?: Array<{ date: string }>;
  term_end_date?: Array<{ date: string }>;
  cancel_date?: Array<{ date: string }>;
};

// Define a type for product data for reusability
export interface ProductDetail {
  product_id: number;
  year?: number;
  fees?: number;
  convertedFees?: number;
  one_time_only?: boolean;
  sort_order?: number | null;
  vendor_products?: {
    name: string;
    id: number;
    product_code?: string | null;
    data_delivery_types?: { id: number; name: string };
  };
}

export interface PriceHistory {
  id: number;
  vendor: string;
  vendor_id?: number; // Added vendor_id for consistent reference
  vendorDomain?: string;
  currency: string;
  initialTermStartDate: string | null;
  initialTermEndDate: string | null;
  currentTermStartDate: string | null;
  currentTermEndDate: string | null;
  cancelByDate: string | null;
  annualIncrease: number | null;
  annualIncreaseMonths: number | null;
  renewalPeriod: number | null;
  subscriptionTerm: number | null;
  billingFrequency: string | null;
  renewalType: string | null;
  willNotRenew: boolean;
  contractStatus?: string; // Status from the contracts table (unconfirmed, active, inactive)
  periods: PricePeriod[];
  totalContractValue: number;
  annualContractValue: number;
  totalContractValueUSD?: number; // USD converted value
  annualContractValueUSD?: number; // USD converted value
  effectiveTotalContractValueUSD?: number; // TCV with effective fees (excludes superseding products)
  effectiveTotalContractValue?: number; // Same, in the contract's own currency
  isFullySuperseding?: boolean; // True if all products in this contract supersede another (amendment)
  isFullySuperseded?: boolean; // True if all products are superseded by an amendment (parent to exclude)
  fiscalYearStart?: number;
  // Original product details for easier budget extraction
  vendorProductDetails?: ProductDetail[];
}

export interface PricePeriod {
  startDate: string;
  endDate: string;
  fees: number;
  feesUSD: number;
  effectiveFees?: number;
  effectiveFeesUSD?: number;
  productFees: ProductFee[];
  termType: 'initial' | 'renewal' | 'projected';
  termIndex: number;
  yearWithinTerm: number;
  isCurrentTerm: boolean;
  isCurrentFiscalYear: boolean;
  isNextFiscalYear: boolean;
  status: 'historical' | 'current' | 'projected';
  isRenewalPoint: boolean;
  renewalCount: number;
  isActivePeriod: boolean; // Indicates if this period contains today's date
}
