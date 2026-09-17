'use client';

import { useState, useMemo, useEffect } from 'react';
import { format, parseISO, addYears, addMonths, startOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency } from '@/app/lib/utils';
import Link from 'next/link';
import VendorIcon from '../vendors/VendorIcon';
import { ProcessedContract } from '@/app/lib/definitions';
import { getFiscalYearInfo } from '@/app/lib/budget';
import { sumRecurringProductFees } from '@/lib/contracts/recurringFees';
import { InfoCircledIcon } from '@radix-ui/react-icons';

// --------------------
// Type Definitions
// --------------------

interface Contract extends ProcessedContract {
  amortizedValue?: number;
  subscriptionTerm?: number | string;
  vendor_products_details?: Array<{
    fees: number | string;
    year: number;
    one_time_only?: boolean;
  }>;
}

type ChartType = 'tcv' | 'current' | 'projectedBudget';
type ViewMode = 'renewals' | 'amortized' | 'actual';

interface TimeData {
  label: string;
  key: string;
  value: number;
  contracts: Contract[];
}

interface RenewalsByMonthChartProps {
  contracts:
    | Contract[]
    | Record<string, Contract>
    | { rows: Contract[] }
    | { data: Contract[] };
}

function abbreviateCurrency(value: number): string {
  if (!value) return '$0';

  const absValue = Math.abs(value);

  if (absValue >= 1000000) {
    return '$' + (value / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (absValue >= 1000) {
    return '$' + (value / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return '$' + value.toFixed(2);
}

function parseDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;

  try {
    // Handle JSON array/object with date inside
    if (
      typeof dateString === 'string' &&
      (dateString.startsWith('[') || dateString.startsWith('{'))
    ) {
      try {
        const parsed = JSON.parse(dateString);

        // If it's an array and has items with a date property
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].date) {
          const dateFromArray = parseISO(parsed[0].date);
          if (!isNaN(dateFromArray.getTime())) {
            return dateFromArray;
          }
        }
      } catch (jsonError) {
        // Silently continue if JSON parsing fails
      }
    }

    // Try parsing as ISO date string
    const date = parseISO(dateString);
    if (!isNaN(date.getTime())) return date;

    // Last resort: standard JS Date parsing
    const fallbackDate = new Date(dateString);
    if (!isNaN(fallbackDate.getTime())) return fallbackDate;
  } catch (error) {
    console.error(`Error parsing date: ${dateString}`, error);
  }

  return null;
}

/**
 * Creates a valid end date for a contract even when termEndDate is missing
 * @param contract Contract with at least a start date
 * @returns Object with startDate and endDate, or null if start date can't be determined
 */
function getContractDates(
  contract: Contract,
): { startDate: Date; endDate: Date } | null {
  // Get start date
  const startDate = parseDate(contract.termStartDate);

  // If we don't have a valid start date, we can't calculate anything
  if (!startDate) {
    return null;
  }

  // Try to get the actual end date
  let endDate = parseDate(contract.termEndDate);

  // If no end date exists, calculate one based on subscription term
  if (!endDate) {
    const termValue = contract.subscriptionTerm;
    let subscriptionTermMonths = 12; // Default to 1 year

    if (termValue) {
      // Handle both number and string values
      const parsedTerm = parseInt(String(termValue));
      if (!isNaN(parsedTerm) && parsedTerm > 0) {
        subscriptionTermMonths = parsedTerm;
      }
    }

    // Create end date based on start date + subscription term using date-fns
    endDate = addMonths(startDate, subscriptionTermMonths);
  }

  return { startDate, endDate };
}

/**
 * Calculates monthly amortized values for a contract
 * Spreads contract value evenly across months from start date to end date
 */
function calculateAmortizedValues(contract: Contract): Map<string, number> {
  const monthlyValues = new Map<string, number>();

  // Get contract dates using the utility function
  const dates = getContractDates(contract);
  if (!dates) {
    return monthlyValues;
  }

  const { startDate, endDate } = dates;

  // Get contract value based on type
  let totalValue = 0;
  let isAnnualBudget = false;

  // Check which value we're using
  if (contract.convertedCurrentBudget) {
    totalValue = contract.convertedCurrentBudget;
    isAnnualBudget = true;
  } else if (contract.convertedProjectedBudget) {
    totalValue = contract.convertedProjectedBudget;
    isAnnualBudget = true;
  } else if (contract.convertedTotalContractValue) {
    totalValue = contract.convertedTotalContractValue;
  } else if (
    contract.vendor_products_details &&
    contract.vendor_products_details.length > 0
  ) {
    totalValue = sumRecurringProductFees(contract.vendor_products_details);
  }

  if (totalValue <= 0) {
    return monthlyValues;
  }

  let monthlyValue;

  if (isAnnualBudget) {
    // For annual budget values (current and projected budgets),
    // always divide by 12 to get the monthly value
    monthlyValue = totalValue / 12;
  } else {
    // For total contract value that spans the entire contract term,
    // distribute across the actual number of months in the contract
    const months = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        endDate.getMonth() -
        startDate.getMonth() +
        1,
    );
    monthlyValue = totalValue / months;
  }

  // Populate the monthly values map using date-fns for proper month handling
  let monthCount = 0;
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const yearMonth = format(currentDate, 'yyyy-MM');
    monthlyValues.set(yearMonth, monthlyValue);
    // Use date-fns addMonths for proper handling of month boundaries and leap years
    currentDate = addMonths(startDate, ++monthCount);
  }

  return monthlyValues;
}

/**
 * Calculates accrual-based values for a contract based on billing frequency
 * Recognizes expenses when incurred according to billing frequency
 */
function calculateActualCostValues(contract: Contract): Map<string, number> {
  const costValues = new Map<string, number>();

  // Get contract dates using the utility function
  const dates = getContractDates(contract);
  if (!dates) {
    return costValues;
  }

  const { startDate, endDate } = dates;

  // Get contract value based on type
  let totalValue = 0;
  if (contract.convertedCurrentBudget) {
    totalValue = contract.convertedCurrentBudget;
  } else if (contract.convertedTotalContractValue) {
    totalValue = contract.convertedTotalContractValue;
  } else if (
    contract.vendor_products_details &&
    contract.vendor_products_details.length > 0
  ) {
    totalValue = sumRecurringProductFees(contract.vendor_products_details);
  }

  if (totalValue <= 0) {
    return costValues;
  }

  // Get billing frequency from contract
  let billingFrequency = contract.billingFrequency || 'Annually';

  // Determine billing interval in months
  let billingIntervalMonths = 12; // Default to annual

  switch (billingFrequency) {
    case 'Monthly':
      billingIntervalMonths = 1;
      break;
    case 'Quarterly':
      billingIntervalMonths = 3;
      break;
    case 'Bi-annually':
      billingIntervalMonths = 6;
      break;
    case 'Annually':
    default:
      billingIntervalMonths = 12;
      break;
  }

  // Calculate number of billing periods
  const totalMonths = Math.max(
    1,
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      endDate.getMonth() -
      startDate.getMonth() +
      1,
  );

  const numberOfBillingPeriods = Math.ceil(totalMonths / billingIntervalMonths);

  // For billing frequency calculations, we need to recognize that
  // currentBudget and projectedBudget are always annual values
  let annualValue = totalValue;

  // If we're working with current or projected budget, use the original annual value
  // and calculate the per-period cost based on the number of billing periods in a year
  if (contract.convertedCurrentBudget || contract.convertedProjectedBudget) {
    const periodsPerYear = 12 / billingIntervalMonths;
    const costPerBillingPeriod = annualValue / periodsPerYear;

    // Populate the billing values map using date-fns for proper interval handling
    let billingPeriodCount = 0;

    while (billingPeriodCount < numberOfBillingPeriods) {
      // Calculate the date for this billing period using date-fns
      const currentDate = addMonths(
        startDate,
        billingPeriodCount * billingIntervalMonths,
      );

      // Skip if we've gone past the end date
      if (currentDate > endDate) break;

      const yearMonth = format(currentDate, 'yyyy-MM');
      costValues.set(yearMonth, costPerBillingPeriod);
      billingPeriodCount++;
    }
  } else {
    // For total contract value that spans the entire term, distribute across all billing periods
    const costPerBillingPeriod = totalValue / numberOfBillingPeriods;

    // Populate the billing values map using date-fns for proper interval handling
    let billingPeriodCount = 0;

    while (billingPeriodCount < numberOfBillingPeriods) {
      // Calculate the date for this billing period using date-fns
      const currentDate = addMonths(
        startDate,
        billingPeriodCount * billingIntervalMonths,
      );

      // Skip if we've gone past the end date
      if (currentDate > endDate) break;

      const yearMonth = format(currentDate, 'yyyy-MM');
      costValues.set(yearMonth, costPerBillingPeriod);
      billingPeriodCount++;
    }
  }

  return costValues;
}

function includeInProjected(contract: Contract): boolean {
  // Exclude contracts explicitly marked as will not renew
  if (contract.willNotRenew) {
    return false;
  }

  // Get contract dates using our utility function
  const dates = getContractDates(contract);
  if (!dates) {
    return false; // No valid dates, can't determine
  }

  const { endDate } = dates;

  // Get the fiscal year info
  const fiscalYearStartMonth = contract.fiscalYearStart || 1;
  const fiscalYearInfo = getFiscalYearInfo(fiscalYearStartMonth);

  // Check if contract ends in current fiscal year (2025)
  const endsInCurrentFY =
    endDate >= fiscalYearInfo.currentFiscalYearStart &&
    endDate < fiscalYearInfo.nextFiscalYearStart;

  // Check if contract ends in next fiscal year (2026)
  const endsInNextFY =
    endDate >= fiscalYearInfo.nextFiscalYearStart &&
    endDate < addYears(fiscalYearInfo.nextFiscalYearStart, 1);

  // Check if contract is a multi-year contract that spans beyond next fiscal year
  // but is active during the projection period
  const isMultiYearSpanningNextFY =
    contract.multiYear === true &&
    endDate >= addYears(fiscalYearInfo.nextFiscalYearStart, 1);

  const isRelevantForProjection =
    endsInCurrentFY || endsInNextFY || isMultiYearSpanningNextFY;

  return isRelevantForProjection;
}

// Extract contract array from different input formats
function extractContractsArray(inputContracts: any): Contract[] {
  if (!inputContracts) return [];

  if (Array.isArray(inputContracts)) {
    return inputContracts;
  } else if (typeof inputContracts === 'object') {
    if ('rows' in inputContracts && Array.isArray(inputContracts.rows)) {
      return inputContracts.rows;
    } else if ('data' in inputContracts && Array.isArray(inputContracts.data)) {
      return inputContracts.data;
    } else {
      return Object.values(inputContracts).filter(
        (item): item is Contract =>
          typeof item === 'object' && item !== null && 'id' in item,
      );
    }
  }
  return [];
}

// Get subtitle text based on view mode and fiscal year
function getViewModeSubtitle(viewMode: ViewMode, fiscalYear: number): string {
  switch (viewMode) {
    case 'renewals':
      return `Annual Contract Value of Renewals for FY${fiscalYear}`;
    case 'actual':
      return `Actual Cost Spend for FY${fiscalYear}`;
    case 'amortized':
      return `Amortized Spend for FY${fiscalYear}`;
    default:
      return `Annual Spend for FY${fiscalYear}`;
  }
}

// Get chart title based on type and view
function getChartTitle(
  chartType: ChartType,
  isMonthlyView: boolean,
  viewMode: ViewMode = 'renewals',
): string {
  let prefix = '';
  if (viewMode === 'amortized') {
    prefix = 'Amortized ';
  } else if (viewMode === 'actual') {
    prefix = 'Actual Cost ';
  } else if (viewMode === 'renewals') {
    prefix = 'Renewals ';
  }

  switch (chartType) {
    case 'projectedBudget':
      return `${prefix}Projected Budget (Next Fiscal Year)`;
    case 'current':
      return `${prefix}Current Budget (Current Fiscal Year)`;
    default:
      return isMonthlyView
        ? 'Total Contract Value (Monthly)'
        : 'Total Contract Value (Quarterly)';
  }
}

// Get value from contract based on chart type
function getContractValue(contract: Contract, chartType: ChartType): number {
  // Check if contract has an amortized value (calculated and set during chart data generation)
  if ('amortizedValue' in contract && contract.amortizedValue !== undefined) {
    return contract.amortizedValue;
  }

  switch (chartType) {
    case 'projectedBudget':
      return contract.convertedProjectedBudget || 0;
    case 'current':
      return contract.convertedCurrentBudget || 0;
    default:
      return contract.convertedTotalContractValue || 0;
  }
}

function BarWithPopover({
  x,
  y,
  width,
  height,
  value,
  payload,
  getValue,
  chartType,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  payload: {
    label: string;
    contracts?: Contract[];
  };
  getValue: (contract: Contract) => number;
  chartType: ChartType;
}) {
  const label = payload.label;
  const contractsForPeriod = payload.contracts || [];

  // Extract month/quarter and year
  const parts = label.split(' ');
  const period = parts[0];
  const shortYear = parts[1]?.replace("'", '20');
  const popoverTitle = `${period} ${shortYear}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={2}
            className="fill-[#1F1C41] transition-colors hover:fill-[#1F1C41]/85 dark:fill-primary dark:hover:fill-primary/90"
          />

          <rect
            x={x}
            y={y + height}
            width={width}
            height={30}
            className="cursor-pointer opacity-0"
          />

          {value > 0 && (
            <text
              x={x + width / 2}
              y={y - 8}
              fontSize={12}
              textAnchor="middle"
              fill="currentColor"
              className="pointer-events-none text-foreground"
            >
              {abbreviateCurrency(value)}
            </text>
          )}
        </g>
      </PopoverTrigger>
      <PopoverContent className="max-h-96 w-96 overflow-auto" side="top">
        <div>
          <div className="border-b pb-4">
            <h3 className="font-serif text-lg">{popoverTitle}</h3>
            <p className="font-label text-xs text-muted-foreground">
              {formatCurrency(value)}
            </p>
          </div>

          <div>
            {contractsForPeriod.map((contract: Contract) => (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="flex items-center justify-between gap-2 border-b border-border px-1 py-2 last:border-0 hover:bg-gray-700/5"
              >
                <div className="flex items-center gap-3">
                  <VendorIcon
                    name={contract.vendor}
                    domain={contract.vendorDomain}
                    height={34}
                    width={34}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium line-clamp-1 text-[0.8rem] leading-tight">
                      {contract.vendor}
                    </span>
                    {contract.product && contract.product[0] && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {contract.product[0].vendor_products.name}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-label text-xs">
                  {formatCurrency(getValue(contract))}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --------------------
// Main Component
// --------------------

export default function RenewalsByMonthChart({
  contracts,
}: RenewalsByMonthChartProps) {
  const [chartType, setChartType] = useState<ChartType>('current');
  const [viewMode, setViewMode] = useState<ViewMode>('renewals');

  // Extract contracts array
  const contractsArray = useMemo(() => {
    return extractContractsArray(contracts);
  }, [contracts]);

  // Get fiscal year info for title
  const fiscalYearInfo = useMemo(() => {
    const fiscalYearStartMonth = contractsArray[0]?.fiscalYearStart || 1;
    return getFiscalYearInfo(fiscalYearStartMonth);
  }, [contractsArray]);

  // Handle view mode changes - reset to non-TCV chart type if needed
  useEffect(() => {
    if (viewMode !== 'renewals' && chartType === 'tcv') {
      setChartType('current');
    }
  }, [viewMode, chartType]);

  const chartData = useMemo(() => {
    if (contractsArray.length === 0) {
      return {
        renewalsByPeriod: [],
        isMonthlyView: true,
      };
    }

    // Step 1: Get fiscal year info
    const fiscalYearStartMonth = contractsArray[0]?.fiscalYearStart || 1;
    const jsMonthIndex = fiscalYearStartMonth - 1; // 0-indexed
    const fiscalYearData = getFiscalYearInfo(fiscalYearStartMonth);
    const now = new Date();

    const relevantContracts = contractsArray.filter((contract) => {
      // For projected view, we need additional checks
      if (chartType === 'projectedBudget') {
        // Only include contracts with non-zero value
        const projectedValue = contract.projectedBudget || 0;
        const currentValue = contract.currentBudget || 0;
        const hasValue = projectedValue !== 0 || currentValue !== 0;

        if (!hasValue) {
          return false;
        }

        // Check if meets projection criteria
        const shouldInclude = includeInProjected(contract);
        return shouldInclude;
      }

      // For other views, use the normal filtering
      const value = getContractValue(contract, chartType);
      return value !== 0 && value !== undefined;
    });

    // Step 3: Determine time periods to display
    let periodKeys: string[] = [];
    let isMonthlyView = true;

    if (chartType === 'tcv') {
      // TCV View Logic - determine if we're using monthly or quarterly view
      if (relevantContracts.length === 0) {
        // If no contracts, default to quarters
        isMonthlyView = false;

        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Show 4 default quarters if no contracts
        for (let i = 0; i < 4; i++) {
          const date = new Date(currentYear, currentMonth + i * 3, 1);
          const month = date.getMonth();
          const year = date.getFullYear();
          const adjustedMonth = (month - jsMonthIndex + 12) % 12;
          const fiscalQuarter = Math.floor(adjustedMonth / 3) + 1;

          let fiscalYear = year;
          if (month < jsMonthIndex) fiscalYear--;

          periodKeys.push(`${fiscalYear}-Q${fiscalQuarter}`);
        }
      } else {
        // Calculate current fiscal quarter
        const currentMonth = now.getMonth();
        let currentFiscalYear = now.getFullYear();
        if (currentMonth < jsMonthIndex) currentFiscalYear--;

        const currentAdjustedMonth = (currentMonth - jsMonthIndex + 12) % 12;
        const currentFiscalQuarter = Math.floor(currentAdjustedMonth / 3) + 1;

        // Determine quarter start date
        const quarterStartMonth = jsMonthIndex + (currentFiscalQuarter - 1) * 3;
        const yearToUse =
          quarterStartMonth >= 12 ? currentFiscalYear + 1 : currentFiscalYear;

        // Create date using the correct year and month, using % 12 for month rollover
        const startDate = new Date(yearToUse, quarterStartMonth % 12, 1);

        // Collect relevant contract dates (after start date)
        const contractDates: Date[] = [];
        relevantContracts.forEach((contract) => {
          const renewalDate = parseDate(contract.termEndDate);
          if (renewalDate && renewalDate >= startDate) {
            contractDates.push(renewalDate);
          }
        });

        // Always include current quarter
        const quarters = new Set<string>();
        quarters.add(`${currentFiscalYear}-Q${currentFiscalQuarter}`);

        // Add quarters for contract dates
        contractDates.forEach((date) => {
          const month = date.getMonth();
          const year = date.getFullYear();
          const adjustedMonth = (month - jsMonthIndex + 12) % 12;
          const fiscalQuarter = Math.floor(adjustedMonth / 3) + 1;

          let fiscalYear = year;
          if (month < jsMonthIndex) fiscalYear--;

          quarters.add(`${fiscalYear}-Q${fiscalQuarter}`);
        });

        // Ensure we have at least 4 quarters
        if (quarters.size < 4) {
          for (let i = 0; i < 4; i++) {
            // Use date-fns addMonths to correctly add quarterly (3-month) intervals
            const date = addMonths(startDate, i * 3);

            const month = date.getMonth();
            const year = date.getFullYear();
            const adjustedMonth = (month - jsMonthIndex + 12) % 12;
            const fiscalQuarter = Math.floor(adjustedMonth / 3) + 1;

            let fiscalYear = year;
            if (month < jsMonthIndex) fiscalYear--;

            quarters.add(`${fiscalYear}-Q${fiscalQuarter}`);
          }
        }

        // Convert to array and sort
        periodKeys = Array.from(quarters).sort();

        // Use monthly view if we have 4 or fewer quarters
        isMonthlyView = quarters.size <= 4;

        if (isMonthlyView) {
          // Switch to monthly view instead
          periodKeys = [];

          // Determine date range
          let earliestDate = startDate;
          // Set latest date to 3 months after start date using date-fns
          let latestDate = addMonths(startDate, 3);

          contractDates.forEach((date) => {
            if (date > latestDate) latestDate = new Date(date);
          });

          // Ensure first day of month using date-fns
          earliestDate = startOfMonth(earliestDate);
          latestDate = startOfMonth(latestDate);

          // Calculate months between
          const startYear = earliestDate.getFullYear();
          const startMonth = earliestDate.getMonth();
          const endYear = latestDate.getFullYear();
          const endMonth = latestDate.getMonth();

          const monthsToShow = Math.max(
            4,
            (endYear - startYear) * 12 + endMonth - startMonth + 1,
          );

          // Generate monthly keys using date-fns for consistent date handling
          for (let i = 0; i < monthsToShow; i++) {
            const date = addMonths(earliestDate, i);
            periodKeys.push(format(date, 'yyyy-MM'));
          }
        }
      }
    } else {
      // Current or Projected Budget View (always monthly)
      const fiscalYearStartDate =
        chartType === 'current'
          ? new Date(fiscalYearData.currentFiscalYearStart)
          : new Date(fiscalYearData.nextFiscalYearStart);

      // Generate 12 months for the fiscal year using date-fns
      for (let i = 0; i < 12; i++) {
        const date = addMonths(fiscalYearStartDate, i);
        const key = format(date, 'yyyy-MM');
        periodKeys.push(key);
      }
    }

    // Step 4: Create period data structure with formatted labels
    const periods: Record<string, TimeData> = {};

    periodKeys.forEach((key) => {
      let label = '';

      if (key.includes('-Q')) {
        // Quarterly label
        const [yearStr, quarterStr] = key.split('-Q');
        const year = parseInt(yearStr);
        const quarter = parseInt(quarterStr);
        const shortYear = `'${(year % 100).toString().padStart(2, '0')}`;
        label = `FQ${quarter} ${shortYear}`;
      } else {
        // Monthly label
        const date = new Date(
          parseInt(key.substring(0, 4)),
          parseInt(key.substring(5, 7)) - 1,
          1,
        );
        const year = date.getFullYear();
        const shortYear = `'${(year % 100).toString().padStart(2, '0')}`;
        label = `${format(date, 'MMM')} ${shortYear}`;
      }

      periods[key] = {
        key,
        label,
        value: 0,
        contracts: [],
      };
    });

    // Step 5: Assign contracts to periods
    const processedContractIds = new Set<string>();

    if (
      (viewMode === 'amortized' || viewMode === 'actual') &&
      (chartType === 'current' || chartType === 'projectedBudget')
    ) {
      // For amortized or actual cost view, we need to handle contracts differently
      relevantContracts.forEach((contract) => {
        // Use the utility function to get contract dates
        const dates = getContractDates(contract);
        if (!dates) {
          return;
        }

        const { startDate, endDate } = dates;

        // Create a modified contract with our calculated end date if needed
        const contractToProcess = { ...contract };
        if (!parseDate(contract.termEndDate) && endDate) {
          // Add the calculated end date to the contract before passing to calculation functions
          contractToProcess.termEndDate = endDate.toISOString();
        }

        // Calculate values for this contract based on view mode
        const valuesByMonth =
          viewMode === 'amortized'
            ? calculateAmortizedValues(contractToProcess)
            : calculateActualCostValues(contractToProcess);

        // Only process if we have values
        if (valuesByMonth.size === 0) return;

        // Get fiscal year boundary dates
        const fiscalYearStartMonth = contract.fiscalYearStart || 1;
        const fiscalYear = getFiscalYearInfo(fiscalYearStartMonth);

        // Determine which fiscal period we're showing
        const periodStart =
          chartType === 'current'
            ? fiscalYear.currentFiscalYearStart
            : fiscalYear.nextFiscalYearStart;

        const periodEnd =
          chartType === 'current'
            ? fiscalYear.nextFiscalYearStart
            : addYears(fiscalYear.nextFiscalYearStart, 1);

        // For contracts active during this period, ensure we show values from their start date
        // if it falls within the fiscal year we're viewing
        const contractIsActive =
          startDate < periodEnd && endDate >= periodStart;

        if (!contractIsActive) return;

        // Iterate through all months in the contract
        valuesByMonth.forEach((monthValue, monthKey) => {
          // Only include months that fall within the selected fiscal period
          const monthDate = new Date(
            parseInt(monthKey.substring(0, 4)),
            parseInt(monthKey.substring(5, 7)) - 1,
            1,
          );

          const isInPeriod = monthDate >= periodStart && monthDate < periodEnd;

          if (isInPeriod && periods[monthKey]) {
            // Add contract to this period with its value
            periods[monthKey].value += monthValue;

            // Only add contract to the list if not already there
            if (
              !periods[monthKey].contracts.find((c) => c.id === contract.id)
            ) {
              periods[monthKey].contracts.push({
                ...contract,
                // Store the value for this contract in this month
                amortizedValue: monthValue, // We reuse this field for both amortized and actual cost values
              });
            }
          }
        });

        processedContractIds.add(contract.id);
      });
    } else {
      // Standard view (non-amortized)
      relevantContracts.forEach((contract) => {
        // Ensure we process each contract only once
        if (processedContractIds.has(contract.id)) return;

        // Exclude One-Time contracts from renewals view
        if (viewMode === 'renewals' && contract.renewalType === 'One-Time')
          return;

        // Get dates relevant to this contract
        const renewalDate = parseDate(contract.termEndDate);
        const startDate = parseDate(contract.termStartDate);
        if (!renewalDate) return;

        let periodKey = '';

        // For projected budget view, we need special handling
        if (chartType === 'projectedBudget') {
          // Get fiscal year info for this contract
          const fiscalYearStartMonth = contract.fiscalYearStart || 1;
          const fiscalYearInfo = getFiscalYearInfo(fiscalYearStartMonth);

          let projectedRenewalDate;

          // If contract ends in current fiscal year, project it to next year (renewal)
          if (
            renewalDate >= fiscalYearInfo.currentFiscalYearStart &&
            renewalDate < fiscalYearInfo.nextFiscalYearStart
          ) {
            // Create a date for next year's renewal by adding a year to the current renewal date
            projectedRenewalDate = addYears(renewalDate, 1);
          }
          // If contract already ends in next fiscal year, use actual end date
          else {
            projectedRenewalDate = renewalDate;
          }

          // Format to get the period key (projected view is monthly)
          periodKey = format(projectedRenewalDate, 'yyyy-MM');
        } else if (chartType === 'tcv' && !isMonthlyView) {
          // For quarterly TCV view
          const month = renewalDate.getMonth();
          const year = renewalDate.getFullYear();
          const adjustedMonth = (month - jsMonthIndex + 12) % 12;
          const fiscalQuarter = Math.floor(adjustedMonth / 3) + 1;

          let fiscalYear = year;
          if (month < jsMonthIndex) fiscalYear--;

          periodKey = `${fiscalYear}-Q${fiscalQuarter}`;
        } else if (
          chartType === 'current' &&
          contract.renewed === true &&
          startDate
        ) {
          // For current view with renewed contracts, use the start date if it's in current fiscal year
          const fiscalYearStartMonth = contract.fiscalYearStart || 1;
          const fiscalYearInfo = getFiscalYearInfo(fiscalYearStartMonth);

          // Check if the start date is in the current fiscal year
          if (
            startDate >= fiscalYearInfo.currentFiscalYearStart &&
            startDate < fiscalYearInfo.nextFiscalYearStart
          ) {
            // Use start date for renewed contracts that started in current fiscal year
            periodKey = format(startDate, 'yyyy-MM');
          } else {
            // Otherwise use the renewal date (end date)
            periodKey = format(renewalDate, 'yyyy-MM');
          }
        } else {
          // For other views, use the actual renewal date
          periodKey = format(renewalDate, 'yyyy-MM');
        }

        // Only add if the period exists in our display range
        if (periods[periodKey]) {
          const value = getContractValue(contract, chartType);
          periods[periodKey].value += value;
          periods[periodKey].contracts.push(contract);
          processedContractIds.add(contract.id);
        }
      });
    }

    // Step 6: Convert to array and sort
    const renewalsByPeriod = Object.values(periods).sort((a, b) =>
      a.key.localeCompare(b.key),
    );

    return {
      renewalsByPeriod,
      isMonthlyView,
    };
  }, [contractsArray, chartType, viewMode]);

  // Chart configuration
  const chartConfig = {
    value: {
      label: getChartTitle(chartType, chartData.isMonthlyView, viewMode),
      valueFormatter: (value: number) => formatCurrency(value),
    },
  };

  // Get value function for contract
  const getValue = (contract: Contract) =>
    getContractValue(contract, chartType);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-normal mb-2 text-base">
          {viewMode === 'amortized' ? (
            <div className="flex items-center">
              <span>Amortized</span>
              <TooltipProvider>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <InfoCircledIcon className="ml-1 h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Amortized View displays the cost of the contract broken out
                    in even amounts for each month during the term of a
                    contract.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : viewMode === 'actual' ? (
            <div className="flex items-center">
              <span>Actual Cost</span>
              <TooltipProvider>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <InfoCircledIcon className="ml-1 h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Actual Cost View displays the costs of the contract when
                    they are due per the billing terms of each contract.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            'Renewals'
          )}
          <p className="font-normal text-xs text-muted-foreground">
            {chartType === 'tcv'
              ? 'All Renewals by Total Contract Value'
              : chartType === 'current'
                ? getViewModeSubtitle(
                    viewMode,
                    getFiscalYearInfo(contractsArray[0]?.fiscalYearStart || 1)
                      .currentFiscalYear % 100,
                  )
                : getViewModeSubtitle(
                    viewMode,
                    (getFiscalYearInfo(contractsArray[0]?.fiscalYearStart || 1)
                      .currentFiscalYear +
                      1) %
                      100,
                  )}
          </p>
        </h3>
        <div className="flex items-center gap-4">
          {/* View mode selector - always visible but some options disabled for TCV */}
          <div className="flex items-center gap-2 border-r pr-4">
            <Button
              size="xs"
              variant={viewMode === 'renewals' ? 'secondary' : 'outline'}
              onClick={() => setViewMode('renewals')}
            >
              Renewals
            </Button>
            <Button
              size="xs"
              variant={viewMode === 'actual' ? 'secondary' : 'outline'}
              onClick={() => chartType !== 'tcv' && setViewMode('actual')}
              disabled={chartType === 'tcv'}
              className={
                chartType === 'tcv' ? 'cursor-not-allowed opacity-50' : ''
              }
            >
              Actual Cost
            </Button>
            <Button
              size="xs"
              variant={viewMode === 'amortized' ? 'secondary' : 'outline'}
              onClick={() => chartType !== 'tcv' && setViewMode('amortized')}
              disabled={chartType === 'tcv'}
              className={
                chartType === 'tcv' ? 'cursor-not-allowed opacity-50' : ''
              }
            >
              Amortized
            </Button>
          </div>

          {/* Chart type selector */}
          <div className="flex space-x-2">
            <Button
              size="xs"
              variant={chartType === 'tcv' ? 'secondary' : 'outline'}
              onClick={() => viewMode === 'renewals' && setChartType('tcv')}
              disabled={viewMode !== 'renewals'}
              className={
                viewMode !== 'renewals' ? 'cursor-not-allowed opacity-50' : ''
              }
            >
              TCV
            </Button>
            <Button
              size="xs"
              variant={chartType === 'current' ? 'secondary' : 'outline'}
              onClick={() => setChartType('current')}
            >
              Current
            </Button>
            <Button
              size="xs"
              variant={
                chartType === 'projectedBudget' ? 'secondary' : 'outline'
              }
              onClick={() => setChartType('projectedBudget')}
            >
              Projected
            </Button>
          </div>
        </div>
      </div>
      <div className="h-64">
        {chartData.renewalsByPeriod.length > 0 ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-full">
            <BarChart
              layout="horizontal"
              data={chartData.renewalsByPeriod}
              margin={{
                top: 20,
                right: 20,
                left: 20,
                bottom: 20,
              }}
              barGap={0}
            >
              <XAxis
                dataKey="label"
                type="category"
                height={30}
                tick={(props) => {
                  const { x, y, payload } = props;
                  return (
                    <text
                      x={x}
                      y={y + 8}
                      fontSize={11}
                      textAnchor="middle"
                      fill="currentColor"
                      className="text-foreground"
                    >
                      {payload.value}
                    </text>
                  );
                }}
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                interval={0}
              />
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <Bar
                dataKey="value"
                radius={2}
                barSize={
                  chartType === 'tcv' && !chartData.isMonthlyView
                    ? Math.max(20, 600 / chartData.renewalsByPeriod.length)
                    : Math.max(10, 600 / chartData.renewalsByPeriod.length)
                }
                className="fill-[#1F1C41] dark:fill-primary"
                shape={(props: any) => {
                  const { x, y, width, height, value, payload } = props;
                  return (
                    <BarWithPopover
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      value={value}
                      payload={payload}
                      getValue={getValue}
                      chartType={chartType}
                    />
                  );
                }}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No renewal data available for the selected period
          </div>
        )}
      </div>
    </div>
  );
}
