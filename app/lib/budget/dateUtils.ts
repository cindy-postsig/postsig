import {
  parseISO,
  differenceInYears,
  differenceInMonths,
  addYears,
  getYear,
  isAfter,
  isBefore,
  isEqual,
  subDays,
} from 'date-fns';

/**
 * Fiscal year information including current fiscal year, start and end dates
 */
export interface FiscalYearInfo {
  currentFiscalYear: number;
  currentFiscalYearStart: Date;
  nextFiscalYearStart: Date;
}

/**
 * Normalize dates to start of day for consistent comparisons
 * @param dateStr Date string in 'YYYY-MM-DD' format
 * @returns Date normalized to start of day
 */
export function normalizeDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0);
  return date;
}

/**
 * Calculate which contract year we're currently in based on the contract start date
 * Year 1 = First year of contract, Year 2 = Second year, etc.
 * @param startDateStr The contract start date string
 * @returns The current contract year (1-based)
 */
export function calculateContractYear(
  startDateStr: string | undefined,
  asOfDate?: Date,
): number {
  if (!startDateStr) return 1;

  // Parse the dates and normalize to start of day in local time
  const startDate = normalizeDate(startDateStr);
  const currentDate = asOfDate ? new Date(asOfDate) : new Date();
  currentDate.setHours(0, 0, 0, 0);

  // If the contract hasn't started yet, return year 1
  if (currentDate < startDate) {
    return 1;
  }

  // Calculate years elapsed using date-fns differenceInYears
  // This properly handles leap years and date boundaries
  const yearsElapsed = differenceInYears(currentDate, startDate);

  // Calculate contract year (1-based)
  return yearsElapsed + 1;
}

/**
 * Get fiscal year information based on fiscal year start month
 * @param fiscalYearStartMonth The month when fiscal year starts (1-12)
 * @returns Fiscal year information object
 */
export function getFiscalYearInfo(
  fiscalYearStartMonth: number = 1,
  asOf: Date = new Date(),
): FiscalYearInfo {
  const currentDate = asOf;
  let currentFiscalYearStart = new Date(
    currentDate.getFullYear(),
    fiscalYearStartMonth - 1,
    1,
  );

  if (currentDate < currentFiscalYearStart) {
    currentFiscalYearStart = new Date(
      currentDate.getFullYear() - 1,
      fiscalYearStartMonth - 1,
      1,
    );
  }

  const nextFiscalYearStart = addYears(currentFiscalYearStart, 1);
  const currentFiscalYear = getYear(currentFiscalYearStart);

  return {
    currentFiscalYear,
    currentFiscalYearStart,
    nextFiscalYearStart,
  };
}

/**
 * Get the latest date from an array of date objects
 * @param dates Array of date objects or string
 * @returns The latest date or a default date if no valid dates
 */
export function getLatestDate(
  dates?: Array<{ date: string }> | string | null,
): Date {
  if (!dates) return new Date(0);

  if (typeof dates === 'string') {
    return parseISO(dates);
  }

  if (Array.isArray(dates) && dates.length === 0) {
    return new Date(0);
  }

  if (Array.isArray(dates) && dates[0]?.date) {
    return parseISO(dates[0].date);
  }

  return new Date(0);
}

/**
 * Get product year label based on term start date and fiscal year
 * @param year Product year
 * @param termStartDate Term start date string or array of date objects
 * @param fiscalYearStartMonth Fiscal year start month (1-12)
 * @returns Formatted product year label (e.g., "FY23")
 */
export function getProductYearLabel(
  year: number,
  termStartDate: any,
  fiscalYearStartMonth: number,
): string {
  if (!termStartDate) return `Year ${year}`;

  // Parse date from different formats
  let termStartDateObj: Date;

  // Handle array format
  if (Array.isArray(termStartDate)) {
    if (termStartDate.length === 0) return `Year ${year}`;

    const mostRecentEntry = termStartDate[0];
    if (mostRecentEntry && mostRecentEntry.date) {
      termStartDateObj = parseISO(mostRecentEntry.date);
    } else {
      return `Year ${year}`;
    }
  }
  // Handle string format
  else if (typeof termStartDate === 'string') {
    termStartDateObj = parseISO(termStartDate);
  }
  // Fallback
  else {
    return `Year ${year}`;
  }

  // Calculate the fiscal year start for the contract start year
  const contractStartYear = getYear(termStartDateObj);
  const contractFiscalYearStart = new Date(
    contractStartYear,
    fiscalYearStartMonth - 1,
    1,
  );

  // Adjust fiscal year start if contract starts before it
  if (isBefore(termStartDateObj, contractFiscalYearStart)) {
    contractFiscalYearStart.setFullYear(contractStartYear - 1);
  }

  // Handle the case where the contract starts on the last day of the fiscal year
  const lastDayOfFiscalYear = subDays(addYears(contractFiscalYearStart, 1), 1);
  if (isEqual(termStartDateObj, lastDayOfFiscalYear)) {
    contractFiscalYearStart.setFullYear(contractStartYear);
  }

  // Calculate the fiscal year for the given product year
  const fiscalYear = getYear(contractFiscalYearStart) + (year - 1);
  return `FY${String(fiscalYear).slice(-2)}`;
}
