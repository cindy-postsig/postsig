import { writeFileSync } from 'fs';
import { stringify } from 'csv-stringify/sync';
import logger from '../utils/pino';
import {
  generatePriceHistories,
  getTermLength,
} from '../app/lib/budget/priceHistoryCalculator';
import { PriceHistory } from '../app/lib/budget/types';
import {
  parseISO,
  addMonths,
  format,
  differenceInMonths,
  startOfMonth,
  addYears,
} from 'date-fns';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../database.types';
import dotenv from 'dotenv';
import { FiscalYearInfo, getFiscalYearInfo } from '../app/lib/budget/dateUtils';
import _ from 'lodash';

dotenv.config();

const START_MONTH = '2024-01';
const END_MONTH = '2026-12';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing Supabase URL or Service Role Key in environment variables',
  );
}
const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

type ContractRow = Database['public']['Tables']['contracts']['Row'] & {
  vendors: Database['public']['Tables']['vendors']['Row'] | null;
  contract_types: Database['public']['Tables']['contract_types']['Row'] | null;
  vendor_products_details: Array<
    Database['public']['Tables']['vendor_products_details']['Row'] & {
      vendor_products:
        | Database['public']['Tables']['vendor_products']['Row']
        | null;
    }
  >;
  users?: {
    organizations?: {
      fiscal_year_start_month?: number | null;
    } | null;
  } | null;
};

function getMonthRange(start: string, end: string): string[] {
  const result: string[] = [];
  let current = parseISO(`${start}-01`);
  const endDate = parseISO(`${end}-01`);
  while (current <= endDate) {
    result.push(format(current, 'yyyy-MM'));
    current = addMonths(current, 1);
  }
  return result;
}

type ChartType = 'tcv' | 'current' | 'projected';
interface ChartDataPoint {
  key: string;
  label: string;
  value: number;
  contracts: Array<PriceHistory & { calculatedValue: number }>;
}

// This script keeps its own copy of the chart extraction (and its own fiscal
// window), and exports base-currency figures only — so it states its own shape
// rather than borrowing the app's, which also carries a per-contract native
// amount for the popover.
interface ChartData {
  data: ChartDataPoint[];
  isMonthly: boolean;
}

function generateFiscalYearPeriods(
  fiscalYearStart: Date,
  isMonthly: boolean = true,
  fiscalYearEnd: Date,
): string[] {
  const periods: string[] = [];

  if (isMonthly) {
    for (
      let i = 0;
      i < differenceInMonths(fiscalYearEnd, fiscalYearStart);
      i++
    ) {
      const date = addMonths(fiscalYearStart, i);
      periods.push(format(date, 'yyyy-MM'));
    }
  } else {
    // Quarterly
    for (
      let i = 0;
      i < differenceInMonths(fiscalYearEnd, fiscalYearStart) / 3;
      i++
    ) {
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

function initializeFiscalYearData(
  fiscalYearStart: Date,
  isMonthly = true,
): {
  periods: string[];
  data: Record<string, ChartDataPoint>;
  fiscalYearEnd: Date;
} {
  const fiscalYearEnd = addYears(fiscalYearStart, 3);
  const periods = generateFiscalYearPeriods(
    fiscalYearStart,
    isMonthly,
    fiscalYearEnd,
  );
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

// Helper function to update chart data point and add contract
function updateChartDataPoint(
  data: Record<string, ChartDataPoint>,
  monthKey: string,
  contract: PriceHistory,
  value: number,
): void {
  if (data[monthKey]) {
    data[monthKey].value += value;

    // Add contract if not already included for this month
    if (!data[monthKey].contracts.find((c) => c.id === contract.id)) {
      data[monthKey].contracts.push({
        ...contract,
        calculatedValue: value,
      });
    }
  }
}

function extractActualCostData(
  contracts: PriceHistory[],
  chartType: ChartType,
  fiscalYearInfo: FiscalYearInfo,
): ChartData {
  const fiscalYearStart = new Date('2024-01-01');

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
          const periodFee = period.feesUSD || period.fees;
          updateChartDataPoint(data, monthKey, contract, periodFee);
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

      // Get fee for this period (use USD value if available)
      const periodFee = period.feesUSD || period.fees;

      if (billingMonths === 0) return;

      const periodMonths = getTermLength(
        format(periodStartDate, 'yyyy-MM-dd'),
        format(periodEndDate, 'yyyy-MM-dd'),
      );

      // Use the period's specific months for billing calculation
      // with a minimum of 1 month to prevent division by zero
      const effectiveMonths = Math.max(periodMonths, 1);

      // Calculate monthly fee based on the period's actual length
      const monthlyFee = periodFee / effectiveMonths;
      // Calculate billing value based on frequency
      const billingValue = monthlyFee * billingMonths;

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

// Helper function to get billing interval months (copied from priceHistoryChartUtils)
function getBillingIntervalMonths(billingFrequency?: string | null): number {
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

// Helper function to get first billing date (exact copy from priceHistoryChartUtils)
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

/// Shared utility to filter periods that overlap with fiscal year
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

async function findTopmostParent(id: number): Promise<number> {
  // Hierarchy edges only, matching findTopmostParent in data/superuser/contracts.ts:
  // a 'billing' edge is an additional invoice parent, not a structural ancestor.
  const { data, error } = await supabase
    .from('contract_relationships')
    .select('parent_contract_id')
    .eq('active', true)
    .eq('child_contract_id', id)
    .is('relationship_type', null)
    .or('disabled.eq.false,disabled.is.null');

  if (error || !data || data.length === 0) {
    return id;
  }

  const parentId = (data[0] as { parent_contract_id: number })
    .parent_contract_id;
  return findTopmostParent(parentId);
}

const contractRelationshipCache = new Map<number, boolean>();

async function filterLinkedChildInvoices(contracts: any[]): Promise<any[]> {
  if (!contracts || !Array.isArray(contracts) || contracts.length === 0) {
    return [];
  }
  const filteredContracts = [];
  for (const contract of contracts) {
    if (!contract || !contract.id) {
      continue;
    }
    const contractTypeId = contract.typeId || contract.type_id;
    if (contractTypeId !== 6) {
      filteredContracts.push(contract);
      continue;
    }
    if (contractRelationshipCache.has(contract.id)) {
      if (!contractRelationshipCache.get(contract.id)) {
        filteredContracts.push(contract);
      }
      continue;
    }
    try {
      const topmostParentId = await findTopmostParent(contract.id);
      const isChild = topmostParentId !== contract.id;
      contractRelationshipCache.set(contract.id, isChild);
      if (!isChild) {
        filteredContracts.push(contract);
      }
    } catch (err) {
      console.error(
        `Error checking if contract ${contract.id} is a child:`,
        err,
      );
      filteredContracts.push(contract);
    }
  }
  return filteredContracts;
}

async function fetchContractsForOrg(orgId: string): Promise<ContractRow[]> {
  const allOrgUsers = await supabase
    .from('users')
    .select('id, organizations(fiscal_year_start_month)')
    .eq('organization_id', orgId);

  if (allOrgUsers.error) throw allOrgUsers.error;
  const allOrgUserIds = allOrgUsers.data?.map((user) => user.id);
  if (!allOrgUserIds || allOrgUserIds.length === 0) {
    console.warn(`No users found for organization ${orgId}`);
    return [];
  }

  let query = supabase
    .from('contracts')
    .select(
      `
      *,
      vendors:vendor_id(*),
      contract_types:type_id(*),
      vendor_products_details(*, vendor_products:product_id(*)),
      users:user_id(organizations(fiscal_year_start_month))
    `,
    )
    .in('user_id', allOrgUserIds);

  const fiscalYearStart = new Date('2024-01-01');
  const fiscalYearEnd = new Date('2026-12-31');

  const fiscalYearStartFormatted = fiscalYearStart.toISOString().split('T')[0];
  const fiscalYearEndFormatted = fiscalYearEnd.toISOString().split('T')[0];

  const activeConditions = ['status.eq.active', 'status.eq.unconfirmed'];
  const publishedContracts = ['status_id.eq.4'];

  const renewalConditions = [
    'renewal_type.is.null',
    'renewal_type.eq.Auto',
    'renewal_type.eq.Manual',
    `and(renewal_type.eq.One-Time,or(term_start_date.is.null,and(term_start_date->0->>date.gte.${fiscalYearStartFormatted},term_start_date->0->>date.lte.${fiscalYearEndFormatted}),and(term_end_date->0->>date.gte.${fiscalYearStartFormatted},term_end_date->0->>date.lte.${fiscalYearEndFormatted})))`,
  ];

  query = query.or(renewalConditions.join(','));
  query = query.or(activeConditions.join(','));
  query = query.or(publishedContracts.join(','));

  query = query.gte(
    'term_end_date->0->>date',
    format(addYears(parseISO(START_MONTH), -2), 'yyyy-MM-dd'),
  );
  query = query.lte(
    'term_start_date->0->>date',
    format(parseISO(END_MONTH), 'yyyy-MM-dd'),
  );

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching contracts:', error);
    throw error;
  }

  const dataArray = Array.isArray(data) ? data : [];
  const contractsWithNonZeroFees = dataArray.filter((contract: any) => {
    if (!contract || typeof contract !== 'object') return false;
    if (!Array.isArray(contract.vendor_products_details)) return false;
    const totalFees = contract.vendor_products_details.reduce(
      (sum: number, detail: any) => sum + (Number(detail?.fees) || 0),
      0,
    );
    return contract.vendor_id && contract.vendors && totalFees > 0;
  });

  const finalContracts = await filterLinkedChildInvoices(
    contractsWithNonZeroFees,
  );
  if (finalContracts.length === 0) {
    console.warn(
      `No suitable contracts found for organization ${orgId} after filtering.`,
    );
  }
  return (finalContracts as ContractRow[]) || [];
}

async function main() {
  const orgId = process.env.ORG_ID || process.argv[2];
  if (!orgId) {
    process.stderr.write(
      'Usage: ORG_ID=... ts-node scripts/exportActualCosts.ts [organizationId]\\n',
    );
    process.exit(1);
  }

  const initialContracts = await fetchContractsForOrg(orgId);
  if (initialContracts.length === 0) {
    logger.info(
      { orgId },
      'No contracts found for organization to process. Exiting.',
    );
    return;
  }

  const months = getMonthRange(START_MONTH, END_MONTH);
  const rangeStart = parseISO(`${START_MONTH}-01`);
  const rangeEnd = addMonths(parseISO(`${END_MONTH}-01`), 1); // End of the last month

  const headers = [
    'Contract ID',
    'Vendor',
    'Contract Type',
    'Product Name',
    'Initial Term Start Date',
    'Initial Term End Date',
    'Current Term Start Date',
    'Current Term End Date',
    ...months,
  ];

  const rows: any[] = [];

  const allPriceHistories = generatePriceHistories(initialContracts as any);

  const nonZeroPriceHistories = allPriceHistories.filter((ph) => {
    const contractValue = ph.annualContractValueUSD || ph.annualContractValue;
    return contractValue > 0;
  });

  const chartData = extractActualCostData(
    nonZeroPriceHistories,
    'current',
    getFiscalYearInfo(1),
  );

  if (chartData.data.length === 0) {
    logger.info('No data to export');
    return;
  }

  const allContractIds = _.uniq(
    chartData.data.flatMap((d) => d.contracts.map((c) => c.id)),
  );
  const products: any = {};
  for (const dataPoint of chartData.data) {
    const period = dataPoint.key;
    for (const contract of dataPoint.contracts) {
      const initialContract = initialContracts.find(
        (c) => c.id === contract.id,
      );
      const productHash = `${contract.id}-${contract.periods[0].productFees[0].productId}`;
      if (!products[productHash]) {
        products[productHash] = {
          contractId: contract.id,
          vendor: initialContract?.vendors?.name,
          contractType: initialContract?.contract_types?.name,
          productName: contract.periods[0].productFees[0].productName,
          initialTermStartDate: contract?.initialTermStartDate,
          initialTermEndDate: contract?.initialTermEndDate,
          currentTermStartDate: contract?.currentTermStartDate,
          currentTermEndDate: contract?.currentTermEndDate,
          [period]: contract.calculatedValue ?? 0,
        };
      } else {
        products[productHash][period] = contract.calculatedValue ?? 0;
      }
    }
  }

  const productsArray = Object.values(products);

  // Convert products to properly formatted rows with all month columns
  const formattedRows = productsArray.map((product: any) => {
    const row = [
      product.contractId,
      product.vendor || '',
      product.contractType || '',
      product.productName || '',
      product.initialTermStartDate
        ? format(parseISO(product.initialTermStartDate), 'yyyy-MM-dd')
        : '',
      product.initialTermEndDate
        ? format(parseISO(product.initialTermEndDate), 'yyyy-MM-dd')
        : '',
      product.currentTermStartDate
        ? format(parseISO(product.currentTermStartDate), 'yyyy-MM-dd')
        : '',
      product.currentTermEndDate
        ? format(parseISO(product.currentTermEndDate), 'yyyy-MM-dd')
        : '',
    ];

    // Add all month columns, filling with empty string if no data
    for (const month of months) {
      row.push(product[month] ? product[month].toFixed(2) : '');
    }

    return row;
  });

  const csv = stringify([headers, ...formattedRows], { quoted: true });

  const outPath = path.join(
    process.cwd(),
    `actual_costs_${orgId}_${START_MONTH}_${END_MONTH}.csv`,
  );
  writeFileSync(outPath, csv);
  logger.info({ outputPath: outPath }, 'CSV exported successfully');
}

main().catch((error) => {
  console.error('Error in main execution:', error);
  process.exit(1);
});
