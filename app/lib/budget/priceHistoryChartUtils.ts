import {
  format,
  parseISO,
  addMonths,
  addYears,
  differenceInMonths,
  differenceInYears,
  startOfMonth,
  isAfter,
  isBefore,
} from 'date-fns';
import { PriceHistory } from '@/app/lib/budget/types';
import { getTermLength } from '@/app/lib/budget/priceHistoryCalculator';
import logger from '@/utils/pino';

export type ChartType = 'tcv' | 'current' | 'projected';
export type ViewMode = 'renewals' | 'actualCost' | 'amortized';

/**
 * A chart amount in both denominations.
 *
 * `base` is the org base currency — what a bar sums and what its popover header
 * reports, since an aggregate across differently denominated contracts is only
 * meaningful in one currency. `native` is the same amount in the contract's own
 * currency, for the per-contract rows inside the popover: a single contract is
 * never converted (PSK-1796).
 *
 * Both are carried from the fee they derive from rather than one being divided
 * back out of the other, because the base figure is cents-rounded and dividing
 * by the rate would not land back on the native amount exactly.
 */
export interface ChartAmount {
  base: number;
  native: number;
}

export interface ChartDataPoint {
  key: string;
  label: string;
  value: number;
  contracts: Array<
    PriceHistory & { calculatedValue: number; calculatedValueNative: number }
  >;
}

export interface ChartData {
  data: ChartDataPoint[];
  isMonthly: boolean;
}

interface FiscalYearInfo {
  currentFiscalYear: number;
  currentFiscalYearStart: Date;
  nextFiscalYearStart: Date;
}

// Main entry point function to extract chart data based on view mode and chart type
export function extractChartData(
  contracts: PriceHistory[],
  viewMode: ViewMode,
  chartType: ChartType,
  fiscalYearInfo: FiscalYearInfo,
  asOf: Date = new Date(),
): ChartData {
  // Superseded filtering is done upstream in buildBudgetSummary
  if (chartType === 'tcv') {
    return extractTCVData(contracts, asOf);
  }

  switch (viewMode) {
    case 'renewals':
      return extractRenewalsData(contracts, chartType, fiscalYearInfo, asOf);
    case 'actualCost':
      return extractActualCostData(contracts, chartType, fiscalYearInfo);
    case 'amortized':
    default:
      return extractAmortizedData(contracts, chartType, fiscalYearInfo);
  }
}

// Helper function to initialize fiscal year data structure
function initializeFiscalYearData(
  fiscalYearStart: Date,
  isMonthly = true,
): {
  periods: string[];
  data: Record<string, ChartDataPoint>;
  fiscalYearEnd: Date;
} {
  const fiscalYearEnd = addYears(fiscalYearStart, 1);
  const periods = generateFiscalYearPeriods(fiscalYearStart, isMonthly);
  const data: Record<string, ChartDataPoint> = {};

  // Initialize periods
  periods.forEach((period) => {
    data[period] = {
      key: period,
      label: formatPeriodLabel(period, isMonthly),
      value: 0,
      contracts: [],
    };
  });

  return { periods, data, fiscalYearEnd };
}

// Helper function to round to 2 decimal places
function toCents(value: number): number {
  return Math.round((value ?? 0) * 100) / 100;
}

function isDateInFiscalYear(
  date: Date,
  fiscalYearStart: Date,
  fiscalYearEnd: Date,
): boolean {
  return date >= fiscalYearStart && date < fiscalYearEnd;
}

// Helper function to get contract value, in both denominations
function getContractValue(
  contract: PriceHistory,
  valueType: 'annual' | 'total' = 'annual',
): ChartAmount {
  if (valueType === 'annual') {
    return {
      base: contract.annualContractValueUSD || contract.annualContractValue,
      native: contract.annualContractValue,
    };
  }
  // 'total': use the effective values if available (handles superseding
  // products).
  if (contract.effectiveTotalContractValueUSD !== undefined) {
    return {
      base: contract.effectiveTotalContractValueUSD,
      native:
        contract.effectiveTotalContractValue ?? contract.totalContractValue,
    };
  }
  return {
    base: contract.totalContractValueUSD || contract.totalContractValue,
    native: contract.totalContractValue,
  };
}

/**
 * A period's fee in both denominations. `feesUSD` carries the base-converted
 * stamp and falls back to the native fee when nothing stamped it.
 */
function periodFeeAmount(period: { feesUSD?: number; fees: number }): {
  base: number;
  native: number;
} {
  return { base: period.feesUSD || period.fees, native: period.fees };
}

/**
 * Applies the same arithmetic to both denominations. Taking one expression
 * rather than a scale factor keeps the base figure bit-for-bit what it was
 * before the native figure was threaded alongside it.
 */
function mapAmount(
  amount: ChartAmount,
  f: (value: number) => number,
): ChartAmount {
  return { base: f(amount.base), native: f(amount.native) };
}

// Helper function to get next year's fees for renewals (incoming year's fees)
function getNextYearFees(
  contract: PriceHistory,
  renewalDate: Date,
): ChartAmount {
  // Find the period that starts at or after the renewal date
  // This will have the appropriate annual increases applied
  const nextPeriod = contract.periods.find((period) => {
    if (!period.startDate) return false;
    const periodStartDate = parseISO(period.startDate);
    return periodStartDate >= renewalDate;
  });

  if (nextPeriod) {
    return periodFeeAmount(nextPeriod);
  }

  // Fallback: if no future period found, find the current term period with the highest fees
  // (which should have the most recent annual increases applied)
  const currentTermPeriods = contract.periods.filter((p) => p.isCurrentTerm);
  if (currentTermPeriods.length > 0) {
    // Sort by yearWithinTerm descending to get the latest year's fees
    const latestYearPeriod = currentTermPeriods.sort(
      (a, b) => b.yearWithinTerm - a.yearWithinTerm,
    )[0];
    return periodFeeAmount(latestYearPeriod);
  }

  // Final fallback to current annual contract value
  return {
    base: contract.annualContractValueUSD || contract.annualContractValue,
    native: contract.annualContractValue,
  };
}

// Helper function to update chart data point and add contract
function updateChartDataPoint(
  data: Record<string, ChartDataPoint>,
  monthKey: string,
  contract: PriceHistory,
  amount: ChartAmount,
): void {
  if (data[monthKey]) {
    // The bar sums the base figure: only one denomination is groupable across
    // contracts. The native figure rides along per contract for the popover.
    data[monthKey].value = toCents(data[monthKey].value + amount.base);

    // Add contract if not already included for this month
    if (!data[monthKey].contracts.find((c) => c.id === contract.id)) {
      data[monthKey].contracts.push({
        ...contract,
        calculatedValue: amount.base,
        calculatedValueNative: amount.native,
      });
    }
  }
}

// Helper function to generate fiscal year periods
function generateFiscalYearPeriods(
  fiscalYearStart: Date,
  isMonthly: boolean = true,
): string[] {
  const periods: string[] = [];

  if (isMonthly) {
    for (let i = 0; i < 12; i++) {
      const date = addMonths(fiscalYearStart, i);
      periods.push(format(date, 'yyyy-MM'));
    }
  } else {
    // Quarterly
    for (let i = 0; i < 4; i++) {
      const date = addMonths(fiscalYearStart, i * 3);
      const quarter = Math.floor(i) + 1;
      const year = date.getFullYear();
      periods.push(`${year}-Q${quarter}`);
    }
  }

  return periods;
}

// Helper to format period labels
function formatPeriodLabel(key: string, isMonthly: boolean): string {
  if (isMonthly) {
    const date = parseISO(key + '-01');
    return format(date, "MMM ''yy");
  } else {
    const [year, quarter] = key.split('-Q');
    return `FQ${quarter} '${year.slice(-2)}`;
  }
}

// Helper to calculate contract months more accurately
function getContractMonths(startDate: Date, endDate: Date): number {
  // Check if it's exactly N years
  const yearsDiff = differenceInYears(endDate, startDate);
  if (yearsDiff > 0) {
    // Check if adding years to start date equals end date
    const expectedEndDate = addYears(startDate, yearsDiff);
    if (expectedEndDate.getTime() === endDate.getTime()) {
      return yearsDiff * 12; // Exactly N years = N*12 months
    }
  }

  // Check if it's exactly N months
  const monthsDiff = differenceInMonths(endDate, startDate);
  const expectedEndDate = addMonths(startDate, monthsDiff);
  if (expectedEndDate.getTime() === endDate.getTime()) {
    return monthsDiff; // Exactly N months
  }

  // Fallback to original logic if not exact
  return differenceInMonths(endDate, startDate) + 1;
}

// Helper to safely parse period dates
function getValidPeriodDates(period: any): {
  startDate: Date | null;
  endDate: Date | null;
} {
  let startDate = null;
  let endDate = null;

  try {
    if (period.startDate) {
      startDate = parseISO(period.startDate);
    }
    if (period.endDate) {
      endDate = parseISO(period.endDate);
    }
  } catch (e) {
    logger.warn({ period }, 'Invalid date format in price history period');
  }

  return { startDate, endDate };
}

// Shared utility to filter periods that overlap with fiscal year
function filterPeriodsOverlappingFiscalYear(
  contract: PriceHistory,
  fiscalYearStart: Date,
  fiscalYearEnd: Date,
  includeAllOverlapping: boolean = true,
): {
  periods: PriceHistory['periods'];
  shouldInclude: boolean;
} {
  // Default to all periods that overlap with fiscal year
  let periods = contract.periods;
  let shouldInclude = false;

  // For continuous view modes (actualCost, amortized),
  // we include ALL periods that overlap with the fiscal year
  if (includeAllOverlapping) {
    // Filter to periods that overlap with fiscal year
    periods = periods.filter((period) => {
      if (!period.startDate || !period.endDate) return false;

      const periodStartDate = parseISO(period.startDate);
      const periodEndDate = parseISO(period.endDate);

      // Period overlaps with fiscal year if:
      // - It ends after fiscal year starts AND
      // - It starts before fiscal year ends
      return (
        periodEndDate >= fiscalYearStart && periodStartDate <= fiscalYearEnd
      );
    });

    // Only include contract if at least one period overlaps with fiscal year
    shouldInclude = periods.length > 0;
  } else {
    // For non-continuous views, only include current term periods
    periods = periods.filter((p) => p.isCurrentTerm);

    // Check if current term overlaps with fiscal year
    if (contract.currentTermStartDate && contract.currentTermEndDate) {
      const currentTermStartDate = parseISO(contract.currentTermStartDate);
      const currentTermEndDate = parseISO(contract.currentTermEndDate);

      shouldInclude =
        currentTermEndDate >= fiscalYearStart &&
        currentTermStartDate <= fiscalYearEnd;
    }
  }

  return { periods, shouldInclude };
}

// Helper function to check if a contract should be included
function shouldIncludeContract(
  contract: PriceHistory,
  fiscalYearStart: Date,
  fiscalYearEnd: Date,
  viewType: 'renewals' | 'tcv',
): boolean {
  // Skip One-Time contracts for renewals view
  if (viewType === 'renewals' && contract.renewalType === 'One-Time') {
    return false;
  }

  // Skip willNotRenew contracts for TCV
  if (viewType === 'tcv' && contract.willNotRenew) {
    return false;
  }

  // Handle willNotRenew logic for renewals
  if (
    viewType === 'renewals' &&
    contract.willNotRenew &&
    contract.currentTermEndDate
  ) {
    const currentTermEndDate = parseISO(contract.currentTermEndDate);
    // If the term end date is before the fiscal year start, skip this contract
    if (currentTermEndDate < fiscalYearEnd) {
      return false;
    }
  }

  return true;
}

// Calculate first billing date in fiscal year
function getFirstBillingDateInFiscalYear(
  periodStartDate: Date,
  fiscalYearStart: Date,
  billingMonths: number,
): Date {
  let billingDate = periodStartDate;

  if (billingDate < fiscalYearStart) {
    const monthsDiff = differenceInMonths(fiscalYearStart, periodStartDate);
    const billingsToSkip = Math.floor(monthsDiff / billingMonths);
    billingDate = addMonths(periodStartDate, billingsToSkip * billingMonths);

    // If still before fiscal year, advance one more billing period
    if (billingDate < fiscalYearStart) {
      billingDate = addMonths(billingDate, billingMonths);
    }
  }

  return billingDate;
}

// Trim empty periods from the beginning and end of the data array
function trimEmptyPeriods(dataArray: ChartDataPoint[]): ChartDataPoint[] {
  const nonZeroIndices = dataArray
    .map((period, index) => ({ index, hasValue: period.value > 0 }))
    .filter((item) => item.hasValue)
    .map((item) => item.index);

  if (nonZeroIndices.length === 0) return dataArray;

  const firstNonZeroIndex = Math.min(...nonZeroIndices);
  const lastNonZeroIndex = Math.max(...nonZeroIndices);

  return dataArray.slice(firstNonZeroIndex, lastNonZeroIndex + 1);
}

// Extract renewals data
export function extractRenewalsData(
  contracts: PriceHistory[],
  chartType: ChartType,
  fiscalYearInfo: FiscalYearInfo,
  asOf: Date = new Date(),
): ChartData {
  // For TCV view, we need to find the range of all contracts
  if (chartType === 'tcv') {
    return extractTCVData(contracts, asOf);
  }

  // For current/projected views, we show renewals in fiscal year
  const fiscalYearStart =
    chartType === 'current'
      ? fiscalYearInfo.currentFiscalYearStart
      : fiscalYearInfo.nextFiscalYearStart;

  const { data, fiscalYearEnd } = initializeFiscalYearData(
    fiscalYearStart,
    true,
  );

  contracts.forEach((contract) => {
    // Apply contract filtering
    if (
      !shouldIncludeContract(
        contract,
        fiscalYearStart,
        fiscalYearEnd,
        'renewals',
      )
    ) {
      return;
    }

    // Determine renewal date based on contract type
    let renewalDate: Date | null = null;

    // For Auto renewals, prioritize cancelByDate
    if (contract.renewalType === 'Auto' && contract.cancelByDate) {
      const cancelByDate = parseISO(contract.cancelByDate);

      // Make sure the cancel by date is in the current fiscal year
      if (isDateInFiscalYear(cancelByDate, fiscalYearStart, fiscalYearEnd)) {
        renewalDate = cancelByDate;
      }
    }

    // Check for contracts starting in the fiscal year (both past and future starts)
    if (!renewalDate && contract.currentTermStartDate) {
      const startDate = parseISO(contract.currentTermStartDate);

      // Only include term start date if it falls within the fiscal year AND is not in initial term
      // We determine if it's in the initial term by checking if currentTermStartDate matches initialTermStartDate
      const isInitialTerm =
        contract.initialTermStartDate === contract.currentTermStartDate;

      if (
        !isInitialTerm &&
        isDateInFiscalYear(startDate, fiscalYearStart, fiscalYearEnd)
      ) {
        renewalDate = startDate;
      }
    }

    // If no start date match, use end date if it falls in the fiscal year
    if (!renewalDate && contract.currentTermEndDate) {
      const endDate = parseISO(contract.currentTermEndDate);

      if (isDateInFiscalYear(endDate, fiscalYearStart, fiscalYearEnd)) {
        renewalDate = endDate;
      }
    }

    // Add to chart if we have a renewal date
    if (renewalDate) {
      const monthKey = format(renewalDate, 'yyyy-MM');
      // For renewals, use the next year's fees (incoming year with annual increases)
      const contractValue = getNextYearFees(contract, renewalDate);
      updateChartDataPoint(data, monthKey, contract, contractValue);
    }
  });

  return {
    data: Object.values(data),
    isMonthly: true,
  };
}

// Extract Total Contract Value data
function extractTCVData(
  contracts: PriceHistory[],
  asOf: Date = new Date(),
): ChartData {
  // First, determine the current month's start date
  const today = asOf;
  const currentMonthStart = startOfMonth(today);

  // Find date range of all contracts
  let earliestDate: Date | null = currentMonthStart; // Start from current month
  let latestDate: Date | null = null;

  contracts.forEach((contract) => {
    if (contract.currentTermEndDate) {
      const endDate = parseISO(contract.currentTermEndDate);
      // Only consider contracts ending on or after the current month
      if (
        endDate >= currentMonthStart &&
        (!latestDate || endDate > latestDate)
      ) {
        latestDate = endDate;
      }
    }
  });

  if (!latestDate) {
    // If no contracts end in the future, look for a reasonable future window (1 year)
    latestDate = addYears(currentMonthStart, 1);
  }

  // Determine if monthly or quarterly view
  const monthsInRange = differenceInMonths(latestDate, earliestDate);
  const isMonthly = monthsInRange <= 15;

  // Generate periods
  const periods: string[] = [];
  let currentDate = startOfMonth(earliestDate);
  const endDate = startOfMonth(latestDate);
  while (currentDate <= endDate) {
    if (isMonthly) {
      periods.push(format(currentDate, 'yyyy-MM'));
      currentDate = addMonths(currentDate, 1);
    } else {
      const currentMonth = parseInt(format(currentDate, 'M')) - 1; // 0-indexed month
      const quarter = Math.floor(currentMonth / 3) + 1;
      const year = parseInt(format(currentDate, 'yyyy'));
      periods.push(`${year}-Q${quarter}`);
      currentDate = addMonths(currentDate, 3);
    }
  }

  // Initialize data
  const data: Record<string, ChartDataPoint> = {};
  periods.forEach((period) => {
    data[period] = {
      key: period,
      label: formatPeriodLabel(period, isMonthly),
      value: 0,
      contracts: [],
    };
  });

  // Add contracts to their end date period
  contracts.forEach((contract) => {
    // Skip contracts that will not renew
    if (
      !shouldIncludeContract(
        contract,
        currentMonthStart,
        endDate as Date,
        'tcv',
      )
    ) {
      return;
    }

    if (!contract.currentTermEndDate) return;

    const contractEndDate = parseISO(contract.currentTermEndDate);

    // Skip contracts that end before the current month
    if (contractEndDate < currentMonthStart) return;

    const periodKey = isMonthly
      ? format(contractEndDate, 'yyyy-MM')
      : `${contractEndDate.getFullYear()}-Q${Math.floor(contractEndDate.getMonth() / 3) + 1}`;

    // Use helpers to update chart data
    const totalValue = getContractValue(contract, 'total');
    updateChartDataPoint(data, periodKey, contract, totalValue);
  });

  // Use helper to trim empty periods
  const trimmedData = trimEmptyPeriods(Object.values(data));

  return {
    data: trimmedData,
    isMonthly,
  };
}

// Extract actual cost data
export function extractActualCostData(
  contracts: PriceHistory[],
  chartType: ChartType,
  fiscalYearInfo: FiscalYearInfo,
): ChartData {
  const fiscalYearStart =
    chartType === 'current'
      ? fiscalYearInfo.currentFiscalYearStart
      : fiscalYearInfo.nextFiscalYearStart;

  const { data, fiscalYearEnd } = initializeFiscalYearData(
    fiscalYearStart,
    true,
  );

  contracts.forEach((contract) => {
    if (!contract.periods.length) return;

    // Use shared utility to get periods that overlap with fiscal year
    const { periods: periodsToProcess, shouldInclude } =
      filterPeriodsOverlappingFiscalYear(
        contract,
        fiscalYearStart,
        fiscalYearEnd,
        true, // Include all periods that overlap with fiscal year
      );

    // Skip if no relevant periods
    if (!shouldInclude) return;

    // Early handling for contracts without billing frequency
    if (!contract.billingFrequency) {
      // For contracts without billing frequency, apply fee on each period's start date
      periodsToProcess.forEach((period) => {
        if (!period.startDate || !period.endDate) return;

        const periodStartDate = parseISO(period.startDate);
        // Only apply if start date falls within fiscal year
        if (
          periodStartDate >= fiscalYearStart &&
          periodStartDate < fiscalYearEnd
        ) {
          const monthKey = format(periodStartDate, 'yyyy-MM');
          updateChartDataPoint(
            data,
            monthKey,
            contract,
            periodFeeAmount(period),
          );
        }
      });
      return; // Skip the regular billing logic
    }

    // Determine billing interval for regular contracts
    const billingMonths = getBillingIntervalMonths(contract.billingFrequency);

    // Process each period separately to account for different fees in different years
    periodsToProcess.forEach((period) => {
      if (!period.startDate || !period.endDate) return;

      const periodStartDate = parseISO(period.startDate);
      const periodEndDate = parseISO(period.endDate);

      // Get fee for this period (excluding superseded products)
      const periodFee = periodFeeAmount(period);

      if (billingMonths === 0) return;

      const expectedTerm =
        period.termType === 'initial'
          ? contract.subscriptionTerm
          : contract.renewalPeriod || contract.subscriptionTerm;
      const maxProductYear =
        contract.vendorProductDetails &&
        contract.vendorProductDetails.length > 0
          ? Math.max(...contract.vendorProductDetails.map((p) => p.year || 1))
          : null;
      const periodStartString = format(periodStartDate, 'yyyy-MM-dd');
      const periodEndString = format(periodEndDate, 'yyyy-MM-dd');
      const periodMonths = getTermLength(
        periodStartString,
        periodEndString,
        expectedTerm,
        maxProductYear,
      );

      // Billing dates are only generated inside the period, so a divisor
      // larger than the period's own date span (e.g. subscription_term=36
      // overriding a 12-month year slice of a 3-year term, psk-1850) would
      // silently drop the un-billed remainder of the fee. Downward overrides
      // are kept: they re-bill a per-cycle fee across a longer dated span.
      const dateSpanMonths = getTermLength(periodStartString, periodEndString);

      // Use the period's specific months for billing calculation
      // with a minimum of 1 month to prevent division by zero
      const effectiveMonths = Math.max(
        Math.min(periodMonths, dateSpanMonths),
        1,
      );

      // Calculate monthly fee based on the period's actual length, then the
      // billing value based on frequency
      const billingValue = mapAmount(
        periodFee,
        (fee) => (fee / effectiveMonths) * billingMonths,
      );

      // Use helper function to get first billing date in fiscal year
      let billingDate = getFirstBillingDateInFiscalYear(
        periodStartDate,
        fiscalYearStart,
        billingMonths,
      );

      // Generate billing dates within the period and fiscal year
      while (billingDate <= periodEndDate && billingDate < fiscalYearEnd) {
        const monthKey = format(billingDate, 'yyyy-MM');
        updateChartDataPoint(data, monthKey, contract, billingValue);
        billingDate = addMonths(billingDate, billingMonths);
      }
    });
  });

  return {
    data: Object.values(data),
    isMonthly: true,
  };
}

// Extract amortized data
export function extractAmortizedData(
  contracts: PriceHistory[],
  chartType: ChartType,
  fiscalYearInfo: FiscalYearInfo,
): ChartData {
  const fiscalYearStart =
    chartType === 'current'
      ? fiscalYearInfo.currentFiscalYearStart
      : fiscalYearInfo.nextFiscalYearStart;

  const { data, fiscalYearEnd } = initializeFiscalYearData(
    fiscalYearStart,
    true,
  );

  contracts.forEach((contract) => {
    // Use shared utility to get periods that overlap with fiscal year
    const { periods: relevantPeriods, shouldInclude } =
      filterPeriodsOverlappingFiscalYear(
        contract,
        fiscalYearStart,
        fiscalYearEnd,
        true, // Include all periods that overlap with fiscal year
      );

    // Skip if no relevant periods
    if (!shouldInclude) return;

    // Build a map of monthKey -> period with the most recent period for each month
    // This prevents double-counting when periods overlap (e.g., during renewals)
    const monthToPeriodMap = new Map<
      string,
      { period: any; startDate: Date; endDate: Date }
    >();

    for (const period of relevantPeriods) {
      const { startDate, endDate } = getValidPeriodDates(period);
      if (!startDate || !endDate) continue;

      let currentMonth = new Date(startDate);
      while (currentMonth <= endDate) {
        const monthKey = format(currentMonth, 'yyyy-MM');

        if (isDateInFiscalYear(currentMonth, fiscalYearStart, fiscalYearEnd)) {
          // Check if we already have a period for this month
          const existingPeriod = monthToPeriodMap.get(monthKey);

          // Use the period with the latest start date (most recent period for overlapping months)
          if (!existingPeriod || startDate >= existingPeriod.startDate) {
            monthToPeriodMap.set(monthKey, { period, startDate, endDate });
          }
        }

        currentMonth = addMonths(currentMonth, 1);
      }
    }

    // Now add the monthly values using only the most recent period for each month
    monthToPeriodMap.forEach(({ period, startDate, endDate }, monthKey) => {
      const termMonths = getContractMonths(startDate, endDate);
      const monthlyValue = mapAmount(periodFeeAmount(period), (fee) =>
        toCents(fee / termMonths),
      );

      if (data[monthKey]) {
        updateChartDataPoint(data, monthKey, contract, monthlyValue);
      }
    });
  });

  return {
    data: Object.values(data),
    isMonthly: true,
  };
}

export function getBillingIntervalMonths(
  billingFrequency?: string | null,
): number {
  if (!billingFrequency) {
    return 0;
  }

  switch (billingFrequency.toLowerCase()) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'bi-annually':
    case 'semi-annually':
      return 6;
    case 'annually':
    default:
      return 12;
  }
}
