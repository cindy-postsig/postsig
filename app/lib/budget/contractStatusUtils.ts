import {
  parseISO,
  differenceInYears,
  differenceInMonths,
  addYears,
  isBefore,
} from 'date-fns';

/**
 * Contract types used in budget calculations
 */
export interface Contract {
  id?: number | string;
  term_start_date?: Array<{
    date: string;
    updated_at: string;
    updated_by: string;
  }>;
  term_end_date?: Array<{
    date: string;
    updated_at: string;
    updated_by: string;
  }>;
  cancel_date?: Array<{
    date: string;
    updated_at: string;
    updated_by: string;
  }>;
  vendor_products_details: Product[];
  annual_increase?: number;
  currency?: string;
  renewal_type?: 'Auto' | 'Manual' | 'One-Time';
  will_not_renew?: boolean;
  status?: 'active' | 'inactive' | 'unconfirmed';
  status_id?: number;
  type_id?: number;
  parent_id?: number | null;
  multi_year?: boolean;
  subscription_term?: number;
  renewal_period?: number;
}

/**
 * Product with year and fees information
 */
export interface Product {
  year: number;
  fees: string;
}

/**
 * Determine if a contract has been renewed based on term dates
 * @param contract Contract data with term dates
 * @returns True if the contract has been renewed
 */
export function isContractRenewed(contract: Contract): boolean {
  // We need at least some term dates to analyze
  if (!contract.term_start_date?.length || !contract.term_end_date?.length) {
    return false;
  }

  // If there are multiple term dates, the contract has been renewed
  const hasMultipleTermDates =
    (contract.term_start_date?.length || 0) > 1 ||
    (contract.term_end_date?.length || 0) > 1;

  return hasMultipleTermDates;
}

/**
 * Calculate the number of renewals for a contract
 * @param contract Contract data with term dates and renewal period
 * @returns Number of renewals that have occurred
 */
export function calculateRenewalCount(contract: Contract): number {
  // If contract isn't renewed, return 0
  if (!isContractRenewed(contract)) {
    return 0;
  }

  // If we don't have sufficient date information, return 0
  if (!contract.term_start_date?.length || !contract.term_end_date?.length) {
    return 0;
  }

  // If contract has only one date entry and is renewed, it must be renewed once
  // (since we've already confirmed it's renewed via isContractRenewed() check)
  if (contract.term_start_date.length === 1) {
    return 1;
  }

  // For contracts with multiple date entries, calculate based on date spans
  // Find the earliest start date and latest end date to capture the full contract lifespan
  const lastIndex = contract.term_start_date.length - 1;
  const earliestStartDate = parseISO(contract.term_start_date[lastIndex].date);
  const latestEndDate = parseISO(contract.term_end_date[0].date);

  // Use current date or end date, whichever is earlier, to avoid counting future renewals
  const today = new Date();
  const effectiveEndDate = isBefore(today, latestEndDate)
    ? today
    : latestEndDate;

  // Calculate years between earliest start and effective end date using date-fns
  // This properly accounts for leap years and gives more accurate results
  const fullYears = differenceInYears(effectiveEndDate, earliestStartDate);
  const remainingMonths = differenceInMonths(
    effectiveEndDate,
    addYears(earliestStartDate, fullYears),
  );

  // Combine for total years (as a decimal)
  const yearsBetween = fullYears + remainingMonths / 12;

  // Use renewal_period if available, otherwise default to 1 year
  const renewalPeriodYears = contract.renewal_period
    ? contract.renewal_period / 12
    : 1;

  // Calculate how many renewal periods fit between earliest start and effective end date
  if (renewalPeriodYears > 0) {
    // Calculate renewals counting only completed periods (not future ones)
    return Math.floor(yearsBetween / renewalPeriodYears);
  }

  // Default to no renewal if we couldn't calculate based on time periods
  return 0;
}

/**
 * Check if a contract is considered active based on its status
 * @param contract Contract to check
 * @returns True if the contract is active or unconfirmed
 */
export function isContractActive(contract: Contract): boolean {
  return contract.status === 'active' || contract.status === 'unconfirmed';
}

/**
 * Check if a contract will renew based on its status and settings
 * @param contract Contract to check
 * @returns True if the contract will renew
 */
export function willContractRenew(contract: Contract): boolean {
  return (
    isContractActive(contract) &&
    !contract.will_not_renew &&
    contract.renewal_type !== 'One-Time'
  );
}
