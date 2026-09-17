import { differenceInDays, differenceInMonths, parseISO } from 'date-fns';

/**
 * Constants used throughout the contract calculations
 */
const CONSTANTS = {
  MONTHS_PER_YEAR: 12,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
};

/**
 * Type definitions for Contract-related data
 */
interface Product {
  year: string | number;
  fees: string | number;
  one_time_only?: boolean;
}

export interface Contract {
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
  vendor_products_details: Product[];
  annual_increase?: number;
  currency?: string;
  renewal_type?: 'Auto' | 'Manual' | 'One-Time';
  will_not_renew?: boolean;
  status?: 'active' | 'inactive' | 'unconfirmed';
  multi_year?: boolean;
  subscription_term?: number;
  renewal_period?: number;
}

interface ContractClassification {
  isMultiYearContract: boolean;
  hasOneYearRenewal: boolean;
  hasMultipleYears: boolean;
  maxProductYear: number;
}

interface ContractValues {
  initialValue: number;
  renewalValue: number;
}

interface ContractDates {
  originalStartDate: Date;
  latestEndDate: Date;
  firstEndDate?: Date;
}

interface TermDetails {
  initialTermLengthYears: number;
  numberOfRenewals: number;
}

/**
 * Safely parse a number from various inputs
 */
function safeParseNumber(value: string | number | undefined): number {
  if (value === undefined) return 0;

  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  return isNaN(num) ? 0 : num;
}

/**
 * Safely parse a date string into a Date object
 */
function safeParseDate(dateString: string | undefined): Date | null {
  if (!dateString) return null;

  try {
    const date = parseISO(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
}

/**
 * Check if contract has valid product details
 */
function hasValidProducts(contract: Contract): boolean {
  return Boolean(contract.vendor_products_details?.length);
}

/**
 * Classify the contract based on its properties
 */
function classifyContract(contract: Contract): ContractClassification {
  // Check if this is a multi-year contract
  const isMultiYearContract =
    contract.multi_year === true ||
    (contract.subscription_term !== undefined &&
      contract.subscription_term > CONSTANTS.MONTHS_PER_YEAR);

  // Check if renewal period is 1 year
  const hasOneYearRenewal =
    contract.renewal_period === CONSTANTS.MONTHS_PER_YEAR ||
    contract.renewal_period === 1;

  // Check if we have multiple years of products
  const productYears = contract.vendor_products_details?.map((p) =>
    safeParseNumber(p.year),
  ) || [0];

  const maxProductYear = Math.max(...productYears);
  const hasMultipleYears = maxProductYear > 1;

  return {
    isMultiYearContract,
    hasOneYearRenewal,
    hasMultipleYears,
    maxProductYear,
  };
}

/**
 * Calculate initial and renewal values based on contract classification
 */
function calculateContractValues(
  contract: Contract,
  classification: ContractClassification,
): ContractValues {
  const {
    isMultiYearContract,
    hasOneYearRenewal,
    hasMultipleYears,
    maxProductYear,
  } = classification;
  const products = contract.vendor_products_details || [];

  // Calculate the total value from all products
  const totalValue = products.reduce((total, product) => {
    return total + safeParseNumber(product.fees);
  }, 0);

  // One-time fees count toward the initial value but never recur (psk-1492).
  const recurringProducts = products.filter((p) => !p.one_time_only);
  const recurringValue = recurringProducts.reduce((total, product) => {
    return total + safeParseNumber(product.fees);
  }, 0);

  // Special case: Use only last year's products for renewal value
  if (isMultiYearContract && hasOneYearRenewal && hasMultipleYears) {
    const lastYearValue = recurringProducts
      .filter((product) => safeParseNumber(product.year) === maxProductYear)
      .reduce((total, product) => {
        return total + safeParseNumber(product.fees);
      }, 0);

    return {
      initialValue: totalValue,
      renewalValue: lastYearValue,
    };
  }

  // Standard case: Use the same value for both initial and renewal
  return {
    initialValue: totalValue,
    renewalValue: recurringValue,
  };
}

/**
 * Extract and validate contract dates
 */
function extractContractDates(contract: Contract): ContractDates | null {
  if (!contract.term_start_date?.length || !contract.term_end_date?.length) {
    return null;
  }

  // Parse the dates - assuming arrays are ordered from newest to oldest
  const startDates = contract.term_start_date
    .map((item) => safeParseDate(item.date))
    .filter((date): date is Date => date !== null);

  const endDates = contract.term_end_date
    .map((item) => safeParseDate(item.date))
    .filter((date): date is Date => date !== null);

  if (!startDates.length || !endDates.length) {
    return null;
  }

  return {
    originalStartDate: startDates[startDates.length - 1], // Oldest start date
    latestEndDate: endDates[0], // Most recent end date
    firstEndDate: endDates[endDates.length - 1], // Original end date
  };
}

/**
 * Calculate the length of the initial term and number of renewals
 */
function calculateTermDetails(
  contract: Contract,
  dates: ContractDates,
  classification: ContractClassification,
  fiscalYearStartMonth: number = 1,
): TermDetails {
  const { originalStartDate, latestEndDate, firstEndDate } = dates;
  const { isMultiYearContract } = classification;
  const currentDate = new Date();

  // Determine initial term length in years
  let initialTermLengthYears = 1.0;

  if (isMultiYearContract) {
    // ALWAYS prioritize calculating from actual dates if available
    if (firstEndDate) {
      // Calculate from original start and end dates - prioritize actual data over defaults
      initialTermLengthYears =
        differenceInMonths(firstEndDate, originalStartDate) /
        CONSTANTS.MONTHS_PER_YEAR;

      // Ensure we have a reasonable value (not zero or negative)
      initialTermLengthYears = Math.max(initialTermLengthYears, 1.0);
    } else if (contract.subscription_term) {
      // Fall back to subscription term only if dates aren't available
      initialTermLengthYears =
        contract.subscription_term / CONSTANTS.MONTHS_PER_YEAR;
    }
  }

  // Simply count renewals from oldest end date to newest end date
  let numberOfRenewals = 0;

  if (firstEndDate) {
    // Get renewal period in months:
    // First try renewal_period, then fallback to subscription_term, then default to 12 months/1 year
    let renewalPeriodMonths = CONSTANTS.MONTHS_PER_YEAR; // Default to 1 year

    if (contract.renewal_period) {
      renewalPeriodMonths = contract.renewal_period;
    } else if (contract.subscription_term) {
      renewalPeriodMonths = contract.subscription_term;
    }

    // Always use latestEndDate (newest end date)
    // This ensures we always count to the end of the current term,
    // whether it's in the past or future

    // Add 1 day to firstEndDate to avoid counting the same day twice
    const dayAfterFirstEnd = new Date(firstEndDate);
    dayAfterFirstEnd.setDate(dayAfterFirstEnd.getDate() + 1);

    // Only count if the newest end date is after the oldest end date
    if (latestEndDate > dayAfterFirstEnd) {
      // Calculate how many renewal periods there are between original end and latest end
      numberOfRenewals = Math.ceil(
        differenceInMonths(latestEndDate, dayAfterFirstEnd) /
          renewalPeriodMonths,
      );
    }
  }

  // If latestEndDate <= firstEndDate (unlikely but possible), numberOfRenewals will be 0

  return {
    initialTermLengthYears,
    numberOfRenewals,
  };
}

/**
 * Calculate final lifetime value including renewals and increases
 */
function calculateFinalValue(
  initialValue: number,
  renewalValue: number,
  termDetails: TermDetails,
  contract: Contract,
): number {
  // Use let instead of const since we may need to adjust the number of renewals
  let { numberOfRenewals } = termDetails;

  // Start with initial term value
  let lifetimeValue = initialValue;

  // If no renewals or no initial value, return just the initial value
  if (numberOfRenewals <= 0 || initialValue === 0) {
    return lifetimeValue;
  }

  // Handle renewals with potential annual increases
  if (contract.annual_increase && contract.renewal_type !== 'One-Time') {
    // Calculate the annual increase factor
    const increase =
      contract.annual_increase < 100
        ? 1 + contract.annual_increase / 100
        : contract.annual_increase / 100;

    // If we have no renewals recorded but the dates span multiple years,
    // we need to estimate how many increases have been applied
    if (
      numberOfRenewals === 0 &&
      contract.term_start_date?.length &&
      contract.term_end_date?.length
    ) {
      // Get the oldest start date and newest end date
      const oldestStart = parseISO(
        contract.term_start_date[contract.term_start_date.length - 1].date,
      );
      const newestEnd = parseISO(contract.term_end_date[0].date);

      // Calculate how many renewal periods have likely occurred based on time passed
      const renewalPeriodMonths =
        contract.renewal_period || contract.subscription_term || 12;
      const monthsPassed = differenceInMonths(newestEnd, oldestStart);

      // If time passed exceeds initial term, estimate renewals
      if (monthsPassed > renewalPeriodMonths) {
        // Estimate how many full renewal periods have occurred
        const estimatedRenewals =
          Math.floor(monthsPassed / renewalPeriodMonths) - 1;
        numberOfRenewals = Math.max(estimatedRenewals, 0);
      }
    }

    // Apply compounding increase for each renewal
    let currentRenewalValue = renewalValue;
    for (let i = 0; i < numberOfRenewals; i++) {
      currentRenewalValue *= increase;
      lifetimeValue += currentRenewalValue;
    }
  } else {
    // No annual increase - add flat renewal values
    lifetimeValue += renewalValue * numberOfRenewals;
  }

  return lifetimeValue;
}

/**
 * Main function to calculate the lifetime value of a contract
 *
 * @param contract Contract data with term dates and vendor product details
 * @param fiscalYearStartMonth The month (1-12) that the fiscal year starts, defaults to 1 (January)
 * @returns The total lifetime value of the contract
 */
export const calculateLifetimeContractValue = (
  contract: Contract,
  fiscalYearStartMonth: number = 1,
): number => {
  // Early return if no valid products
  if (!hasValidProducts(contract)) {
    return 0;
  }

  // Classify the contract
  const classification = classifyContract(contract);

  // Calculate initial and renewal values
  const { initialValue, renewalValue } = calculateContractValues(
    contract,
    classification,
  );

  // Early return if no contract value
  if (initialValue === 0) {
    return 0;
  }

  // Special case for contracts with start date but no end date
  if (contract.term_start_date?.length && !contract.term_end_date?.length) {
    const startDate = safeParseDate(
      contract.term_start_date[contract.term_start_date.length - 1].date,
    );
    if (!startDate) {
      return initialValue;
    }

    // Determine term length in months (subscription_term, renewal_period, or default 1 year)
    let termLengthMonths: number;
    if (contract.subscription_term) {
      termLengthMonths = contract.subscription_term;
    } else if (contract.renewal_period) {
      termLengthMonths = contract.renewal_period;
    } else {
      termLengthMonths = CONSTANTS.MONTHS_PER_YEAR; // Default to 1 year
    }

    // Calculate how many full terms have elapsed since start date
    // Include the current active term
    const today = new Date();
    const monthsElapsed = differenceInMonths(today, startDate);
    const termsElapsed = Math.ceil(monthsElapsed / termLengthMonths);

    // First term is the initial term, any additional terms are renewals
    const numberOfRenewals = Math.max(0, termsElapsed - 1);

    // Create term details
    const termDetails = {
      initialTermLengthYears: termLengthMonths / CONSTANTS.MONTHS_PER_YEAR,
      numberOfRenewals,
    };

    // Calculate final lifetime value
    return calculateFinalValue(
      initialValue,
      renewalValue,
      termDetails,
      contract,
    );
  }

  // Handle normal case with both start and end dates
  const dates = extractContractDates(contract);
  if (!dates) {
    return initialValue; // Return initial value if dates can't be determined
  }

  // Calculate term details - length and number of renewals
  const termDetails = calculateTermDetails(
    contract,
    dates,
    classification,
    fiscalYearStartMonth,
  );

  // Calculate final lifetime value
  return calculateFinalValue(initialValue, renewalValue, termDetails, contract);
};
