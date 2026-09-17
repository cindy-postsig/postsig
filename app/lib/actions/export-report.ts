import { stringifyCsv } from '@/lib/csv-export/stringify';
import { getEffectiveDateFormat } from '@/data/users';
import { formatDate as formatDateForUser } from '@/lib/date-format';
import logger from '@/utils/pino';
import { fetchContractsById } from '@/app/lib/contracts/actions';
import { getReportData } from '@/lib/v2/reports/service';
import { reportConfigs } from '@/app/(app)/(cpm)/reports/reportConfigs';
import { formatCurrency } from '@/app/lib/utils';
import { getInvoiceStatusLabel } from '@/constants/invoiceStatus';
import {
  generatePriceHistory,
  extractBudgetFromPriceHistory,
  getProductYearLabel,
} from '@/app/lib/budget';
import {
  billedInvoiceAmount,
  invoiceGapCents,
} from '@/app/lib/budget/invoiceUtils';
import {
  contractOwners,
  ownerGroupNames,
  ownerSponsorNames,
} from '@/lib/v2/owners/embed';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import { escapeSpreadsheetCell } from '@/lib/csv-export/escape';
import { format as formatDate, parseISO, isValid } from 'date-fns';

/**
 * Maps column keys to human-readable headers for CSV export
 */
const columnHeaderMap: Record<string, string> = {
  id: 'Contract ID',
  vendor: 'Vendor',
  orderNumber: 'Contract No.',
  product: 'Product',
  type: 'Contract Type',
  renewalType: 'Renewal Type',
  term: 'Term',
  termStartDate: 'Start Date',
  termEndDate: 'End Date',
  cancelByDate: 'Cancel By Date',
  totalContractValue: 'Total Contract Value',
  currentBudget: 'Current Spend',
  projectedBudget: 'Projected Spend',
  annualDifference: 'Annual Difference',
  discount: 'Discount',
  potentialOverage: 'Potential Overage',
  seatUsage: 'Seat Usage',
  seatUsageDisplay: 'Seat Usage',
  utilization: 'Utilization %',
  utilizationPercentage: 'Utilization %',
  doraScore: 'DORA Score',
  doraScoreValue: 'DORA Score',
  missingClauses: 'Missing Clauses',
  missingClausesCount: 'Missing Clauses Count',
  missingDoraCategories: 'Missing DORA Categories',
  invoiceStatus: 'Status',
  expectedInvoiceAmount: 'Expected Invoice Amount',
  invoiceAmount: 'Invoice Amount',
  invoiceBillingFrequency: 'Invoice Billing Frequency',
  parentBillingFrequency: 'Parent Contract Billing Frequency',
  frequencyMismatch: 'Billing Frequency Mismatch',
  discrepancy: 'Discrepancy',
  difference: 'Difference %',
  pricePerSeat: 'Price Per Seat',
  tags: 'Tags',
  ndaRiskLevel: 'NDA Risk Level',
  identifiedRisks: 'Identified Risks',
  extendedTermEndDate: 'Extended Confidentiality Term',
  daysRemaining: 'Days Remaining',
  businessSponsor: 'Business Sponsor',
  businessGroup: 'Business Group',
};

/**
 * Invoice reports label the term dates as billing period dates, matching the
 * invoice views in the app.
 */
const invoiceColumnHeaderOverrides: Record<string, string> = {
  orderNumber: 'Invoice No.',
  termStartDate: 'Billing Period Start Date',
  termEndDate: 'Billing Period End Date',
};

// NDA risk flags
const ndaRiskFlagLabels: Record<string, string> = {
  broad_confidentiality_definition: 'Broad Confidentiality Definition',
  no_time_limit: 'No Time Limit on Confidentiality',
  excessive_scope: 'Excessive Scope of Confidential Information',
  inadequate_return_destruction: 'Inadequate Return/Destruction Clause',
  unilateral_obligations: 'Unilateral Obligations',
  broad_injunctive_relief: 'Broad Injunctive Relief',
  unlimited_liability: 'Unlimited Liability Exposure',
  perpetual_nda: 'Perpetual NDA',
  unilateral_nda: 'Unilateral NDA',
  non_solicitation: 'Non-Solicitation',
  'non-solicitation': 'Non-Solicitation',
  uncapped_liability: 'Uncapped Liability',
  foreign_jurisdiction: 'Foreign Jurisdiction',
  no_carve_out_provisions: 'No Carve-Out Provisions',
  post_end_of_term_obligations: 'Post-Term Obligations',
};

/**
 * Product names for a contract row, in the order the table shows them.
 */
function productNames(contract: any): string[] {
  const products = contract.currentYearProducts?.length
    ? contract.currentYearProducts
    : contract.product?.length
      ? contract.product
      : contract.currentProducts;

  if (!Array.isArray(products)) return [];

  const names = products
    .map((p: any) => p?.vendor_products?.name || p?.name || '')
    .filter(Boolean);

  return Array.from(new Set<string>(names));
}

type ExportRow = Record<string, any>;

function isProductSubRow(subRow: ExportRow): boolean {
  return Boolean(
    subRow?.isProductRow ||
    subRow?.isProductUsageRow ||
    subRow?.isInvoiceProductRow,
  );
}

function subRowProducts(subRow: ExportRow): ExportRow[] {
  if (Array.isArray(subRow.product)) return subRow.product;
  if (subRow.vendor_products) {
    return [{ vendor_products: subRow.vendor_products }];
  }
  return [];
}

function productExportRows(row: ExportRow): ExportRow[] {
  const subRows: ExportRow[] = Array.isArray(row.subRows)
    ? row.subRows.filter(isProductSubRow)
    : [];

  if (subRows.length === 0) return [row];

  return subRows.map((subRow) => ({
    ...row,
    ...subRow,
    product: subRowProducts(subRow),
    currentProducts: undefined,
    currentYearProducts: undefined,
    id: row.id,
    currency: subRow.currency || row.currency,
    subRows: undefined,
  }));
}

/**
 * Helper function to get a column's value for CSV export
 */
function getColumnValue(
  contract: any,
  column: string,
  dateFormat: string,
): string {
  switch (column) {
    case 'termStartDate':
    case 'termEndDate':
    case 'cancelByDate':
      return contract[column]
        ? formatDateForUser(contract[column], dateFormat, '')
        : '';

    case 'id':
      // Return the contract ID - use either contract_id if it exists (for subrows) or id
      return (contract.contract_id || contract.id || '').toString();

    case 'vendor':
      return contract.vendor || '';

    case 'product':
      return productNames(contract).join(', ');

    case 'doraScore':
    case 'doraScoreValue':
      return contract.doraScore?.score?.toString() || 'N/A';

    case 'missingClauses':
      return Array.isArray(contract.missingClauses)
        ? contract.missingClauses.join(', ')
        : '';

    case 'missingClausesCount':
      return (
        contract.missingClausesCount?.toString() ||
        (Array.isArray(contract.missingClauses)
          ? contract.missingClauses.length.toString()
          : '0')
      );

    case 'missingDoraCategories':
      return Array.isArray(contract.missingDoraCategories)
        ? contract.missingDoraCategories.join(', ')
        : '';

    case 'projectedBudget':
    case 'annualDifference':
      // Null means "no projection exists" (invoice rows) — blank, matching
      // the table, not a $0 that reads like a price.
      if (contract[column] === null) return '';
      return (
        formatCurrency(contract[column] || 0, contract.currency, true) || '0'
      );

    case 'totalContractValue':
    case 'potentialOverage':
    case 'currentBudget':
      return (
        formatCurrency(contract[column] || 0, contract.currency, true) || '0'
      );

    case 'discount':
      if (contract.discount != null && contract.discount !== 0) {
        return `${contract.discount}%`;
      }
      return '';

    case 'pricePerSeat':
      let pricePerSeat = 0;
      // Access the valuePerSeat from productUsage.totalSeats
      if (contract.productUsage?.totalSeats?.valuePerSeat) {
        pricePerSeat = contract.productUsage.totalSeats.valuePerSeat;
      }
      return formatCurrency(pricePerSeat, contract.currency, true) || '0';

    case 'tags':
      // Handle tags array - convert to comma-separated string of tag names
      if (contract.tags && Array.isArray(contract.tags)) {
        return contract.tags
          .map((tag: any) => tag.name)
          .filter(Boolean)
          .join(', ');
      }
      return '';

    case 'seatUsage':
    case 'seatUsageDisplay':
      if (contract.seatUsage) {
        return `${contract.seatUsage.assigned || 0} / ${contract.seatUsage.licensed || 0}`;
      }
      return '';

    case 'utilization':
    case 'utilizationPercentage':
      if (contract.seatUsage && contract.seatUsage.licensed > 0) {
        const utilization = Math.round(
          (contract.seatUsage.assigned / contract.seatUsage.licensed) * 100,
        );
        return `${utilization}%`;
      }
      return '0%';

    case 'orderNumber':
      return escapeSpreadsheetCell(contract.orderNumber?.toString() || '');

    case 'invoiceStatus':
      return getInvoiceStatusLabel(contract.invoiceStatus);

    case 'expectedInvoiceAmount':
      // Invoice-vs-contract comparisons stay in the invoice's source
      // currency; only the report total converts to base (PSK-1796).
      return (
        formatCurrency(
          contract[column] || 0,
          contract.currency || 'USD',
          true,
        ) || '0'
      );

    case 'invoiceAmount':
      // The same billed amount the discrepancy below is measured against, so
      // the two exported columns cannot disagree about what was billed.
      return (
        formatCurrency(
          billedInvoiceAmount(contract),
          contract.currency || 'USD',
          true,
        ) || '0'
      );

    case 'discrepancy':
      // Export the gap between the two exported amounts, not the unrounded
      // one, so a spreadsheet's own subtraction agrees with this column the
      // way the table's does (PSK-1929).
      return (
        formatCurrency(
          invoiceGapCents(contract) / 100,
          contract.currency || 'USD',
          true,
        ) || '0'
      );

    case 'difference':
      if (typeof contract.difference === 'number') {
        return `${contract.difference.toFixed(2)}%`;
      }
      return '0%';

    case 'invoiceBillingFrequency':
      // Return the invoice billing frequency
      if (contract.invoiceBillingFrequency) {
        return contract.invoiceBillingFrequency;
      } else if (contract.billing_frequency) {
        // Fallback to contract billing frequency if this is the invoice contract
        return contract.billing_frequency;
      }
      return 'Unknown';

    case 'parentBillingFrequency':
      // Return the parent billing frequency
      if (contract.parentBillingFrequency) {
        return contract.parentBillingFrequency;
      } else if (contract.parentContract?.billing_frequency) {
        return contract.parentContract.billing_frequency;
      }
      return 'Unknown';

    case 'frequencyMismatch':
      // Return Yes/No based on whether frequencies are aligned
      if (contract.frequencyAligned !== undefined) {
        return contract.frequencyAligned ? 'No' : 'Yes';
      } else if (
        contract.parentBillingFrequency &&
        contract.invoiceBillingFrequency &&
        contract.parentBillingFrequency.toLowerCase() ===
          contract.invoiceBillingFrequency.toLowerCase()
      ) {
        return 'No';
      } else if (
        contract.parentBillingFrequency &&
        contract.invoiceBillingFrequency
      ) {
        return 'Yes';
      }
      return 'Unknown';

    case 'daysRemaining':
      // Calculate days remaining until term end date
      if (contract.termEndDate) {
        const parsedDate =
          contract.termEndDate instanceof Date
            ? contract.termEndDate
            : new Date(contract.termEndDate);
        if (!isNaN(parsedDate.getTime())) {
          const daysRemaining = Math.ceil(
            (parsedDate.getTime() - new Date().getTime()) /
              (1000 * 60 * 60 * 24),
          );
          return daysRemaining.toString();
        }
      }
      return '';

    case 'businessSponsor':
      // Handle businessSponsor - it's an array that should be joined
      if (
        contract.businessSponsor &&
        Array.isArray(contract.businessSponsor) &&
        contract.businessSponsor.length > 0
      ) {
        return contract.businessSponsor.join(', ');
      }
      return '';

    case 'businessGroup':
      // Return the business group value
      return contract.businessGroup?.toString() || '';

    case 'identifiedRisks':
      // Build a comma-separated list of identified NDA risks from ndaInsights flags
      if (contract.ndaInsights && typeof contract.ndaInsights === 'object') {
        const risks = Object.entries(contract.ndaInsights)
          .filter(([_, value]) => value === true)
          .map(([key]) => ndaRiskFlagLabels[key] || key)
          .filter(Boolean);
        return risks.join(', ');
      }
      return '';

    default:
      // Return the raw value for other columns
      return contract[column]?.toString() || '';
  }
}

/**
 * Exports report data to CSV based on report type and columns
 */
export async function exportReportCSV(
  contractIds: number[],
  reportType: string,
): Promise<Blob> {
  try {
    // Get the report configuration - use proper map from report types
    // Handle some common variations
    let reportKey = reportType;

    const reportConfig = reportConfigs[reportKey];
    if (!reportConfig) {
      console.error(`Report type '${reportType}' not found in report configs`);
      throw new Error(`Unknown report type: ${reportType}`);
    }

    const dateFormat = await getEffectiveDateFormat();

    // Same pipeline the on-screen report runs, narrowed to the selection, so
    // the CSV can only ever be the rows the report itself would show.
    const { rows: processedContracts } = await getReportData(reportKey, {
      contractIds,
      valueField: reportConfig.valueField,
      // The selection already encodes the tab the user exported from, so no
      // pipeline may re-apply a tab filter of its own. Only dora reads
      // activeTab, and it defaults to 'ict' — any other value skips its filter.
      activeTab: 'all',
    });

    // Get the columns to include from the report config
    let columns = reportConfig.columns.filter(
      (col) => col !== 'select' && col !== 'expander',
    );

    // Exclude 'addUsers' column from utilization report export
    if (reportKey === 'utilization') {
      columns = columns.filter((col) => col !== 'addUsers');
    }

    // Always include the contract ID as the first column
    let exportColumns = ['id', ...columns];

    // Add tags column to all exports if not already included
    if (!exportColumns.includes('tags')) {
      exportColumns.push('tags');
    }

    // For invoice report, add special columns that only appear in the CSV
    if (reportKey === 'invoices') {
      // Determine where to insert the new columns (after invoiceAmount)
      const invoiceAmountIndex = exportColumns.indexOf('invoiceAmount');
      if (invoiceAmountIndex !== -1) {
        // Add columns after invoiceAmount
        exportColumns.splice(
          invoiceAmountIndex + 1,
          0,
          'invoiceBillingFrequency',
          'parentBillingFrequency',
        );
      }
    }

    // Add special columns for specific reports
    if (reportKey === 'dora') {
      // For DORA reports, add the missingDoraCategories column right after doraScore/doraScoreValue
      if (!exportColumns.includes('missingDoraCategories')) {
        // Find the index of doraScoreValue or doraScore in the exportColumns array
        const doraScoreIndex =
          exportColumns.indexOf('doraScoreValue') !== -1
            ? exportColumns.indexOf('doraScoreValue')
            : exportColumns.indexOf('doraScore');

        // If doraScore is found, insert missingDoraCategories right after it
        if (doraScoreIndex !== -1) {
          exportColumns.splice(doraScoreIndex + 1, 0, 'missingDoraCategories');
        } else {
          // Fallback - just add it to the end if doraScore isn't found
          exportColumns.push('missingDoraCategories');
        }
      }
    }

    // For contract-omissions, add the missingClauses list after missingClausesCount
    if (reportKey === 'contract-omissions') {
      if (!exportColumns.includes('missingClauses')) {
        const missingClausesCountIndex = exportColumns.indexOf(
          'missingClausesCount',
        );
        if (missingClausesCountIndex !== -1) {
          exportColumns.splice(
            missingClausesCountIndex + 1,
            0,
            'missingClauses',
          );
        } else {
          exportColumns.push('missingClauses');
        }
      }
    }

    // Map columns to CSV headers
    const headers = exportColumns.map((column) => {
      if (reportKey === 'invoices' && invoiceColumnHeaderOverrides[column]) {
        return invoiceColumnHeaderOverrides[column];
      }
      return columnHeaderMap[column] || column;
    });

    const rowsToExport: ExportRow[] = (processedContracts as ExportRow[])
      .filter((contract) => !contract.isReportRow)
      .flatMap(productExportRows);

    // Make sure all async processing is complete
    // Some properties may have been generated asynchronously during processing
    // so we need to ensure all contracts are fully processed with all properties

    // Build CSV rows
    const csvRows = rowsToExport.map((contract) => {
      // Map each column to its corresponding value
      return exportColumns.map((column) =>
        getColumnValue(contract, column, dateFormat),
      );
    });

    // Generate the CSV string with headers and rows, ensuring proper handling of newlines and quotes
    const csvContent = stringifyCsv([headers, ...csvRows], {
      header: false,
      quoted: true, // Always quote fields
      quoted_empty: true, // Quote empty fields too
      quoted_string: true, // Force quoting of strings
    });

    // For debugging
    logger.info(
      { csvRowsCount: csvRows.length, reportKey },
      `Generated CSV with ${csvRows.length} data rows for report type ${reportKey}`,
    );

    // Convert to Blob
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  } catch (error) {
    console.error('Failed to generate report CSV:', error);
    throw new Error('Failed to generate report CSV');
  }
}

const invoiceFolderColumns: Record<string, string> = {
  id: 'Document ID',
  vendor: 'Vendor',
  order_number: 'Invoice No.',
  product_name: 'Product Name',
  invoice_status: 'Invoice Status',
  business_sponsor: 'Business Sponsor',
  business_group: 'Business Group',
  execution_date: 'Invoice Date',
  product_start_date: 'Billing Period Start Date',
  term_end_date: 'Billing Period End Date',
  product_fee: 'Current Spend',
  fiscal_year: 'Fiscal Year',
  currency: 'Currency',
  billing_frequency: 'Billing Frequency',
  tags: 'Tags',
};

export async function exportInvoiceFolderCSV(
  contractIds: number[],
  fiscalYearStartMonth: number,
): Promise<Blob> {
  const dateFormat = await getEffectiveDateFormat();
  const contracts = await fetchContractsById({ ids: contractIds });
  if (!contracts || contracts.length === 0) {
    return new Blob([''], { type: 'text/csv;charset=utf-8;' });
  }

  const headers = Object.values(invoiceFolderColumns);
  const columnKeys = Object.keys(invoiceFolderColumns);
  const allRows: string[][] = [headers];

  for (const contract of contracts) {
    if (contract.status_id !== 4) continue;

    const vendor = (contract as any).vendors?.name || '';
    const invoiceStatus = getInvoiceStatusLabel(
      (contract as any).invoice_status,
    );
    const owners = contractOwners(contract);
    const businessSponsor = ownerSponsorNames(owners).join(', ');
    const businessGroup = ownerGroupNames(owners).join(', ');
    const currency = contract.currency?.toUpperCase() || '';
    const billingFrequency = contract.billing_frequency || '';
    const termEndDate = safeFormatDate(
      (contract as any).term_end_date?.[0]?.date,
      dateFormat,
    );
    const executionDate = safeFormatDate(contract.execution_date, dateFormat);
    const tags = extractTags(contract);

    let productsByYear: Record<string, any[]> = {};
    try {
      const priceHistory = generatePriceHistory(
        contract,
        fiscalYearStartMonth,
        'minimal',
      );
      const { currentProducts } = extractBudgetFromPriceHistory(priceHistory);

      if (currentProducts && currentProducts.length > 0) {
        const grouped: Record<string, any[]> = {};
        for (const product of currentProducts) {
          if (!product.periodInfo) continue;
          const yearKey = product.periodInfo.yearWithinTerm.toString();
          if (!grouped[yearKey]) grouped[yearKey] = [];

          const exists = grouped[yearKey].some(
            (p: any) =>
              p.product_id === product.product_id &&
              p.periodInfo?.termIndex === product.periodInfo?.termIndex,
          );
          if (!exists) {
            grouped[yearKey].push({
              product_id: product.product_id,
              name: product.vendor_products?.name || 'Unknown Product',
              fees: Number(product.fees) || 0,
              startDate:
                product.startDate ||
                priceHistory.currentTermStartDate ||
                (contract as any).term_start_date?.[0]?.date,
              periodInfo: product.periodInfo,
            });
          }
        }
        productsByYear = grouped;
      }

      if (Object.keys(productsByYear).length === 0) {
        productsByYear = { '1': [{}] };
      }
    } catch (error) {
      logger.error(
        { error, contractId: contract.id },
        'Error processing products for invoice export',
      );
      productsByYear = { '1': [{}] };
    }

    for (const [year, products] of Object.entries(productsByYear)) {
      let fiscalYear = '';
      try {
        const yearInt = parseInt(year);
        if (!isNaN(yearInt)) {
          fiscalYear = getProductYearLabel(
            yearInt,
            (contract as any).term_start_date?.[0]?.date || '',
            fiscalYearStartMonth,
          );
        }
      } catch {}

      for (const product of products) {
        const row = columnKeys.map((key) => {
          switch (key) {
            case 'id':
              return String(contract.id || '');
            case 'vendor':
              return vendor;
            case 'order_number':
              return escapeSpreadsheetCell(
                sanitizeOrderNumber(
                  (contract as any).metadata?.lineage?.order_number,
                ) ?? '',
              );
            case 'product_name':
              return product.name || '';
            case 'invoice_status':
              return invoiceStatus;
            case 'business_sponsor':
              return businessSponsor;
            case 'business_group':
              return businessGroup;
            case 'execution_date':
              return executionDate;
            case 'product_start_date':
              return safeFormatDate(product.startDate, dateFormat);
            case 'term_end_date':
              return termEndDate;
            case 'product_fee': {
              if (product.fees === 0) return '0';
              if (product.fees) {
                const num = Number(product.fees);
                return isNaN(num) ? String(product.fees) : num.toFixed(2);
              }
              return '';
            }
            case 'fiscal_year':
              return fiscalYear;
            case 'currency':
              return currency;
            case 'billing_frequency':
              return billingFrequency;
            case 'tags':
              return tags;
            default:
              return '';
          }
        });
        allRows.push(row);
      }

      const invoiceFields =
        contract.other_attributes &&
        typeof contract.other_attributes === 'object'
          ? (contract.other_attributes as any)?.invoice_fields
          : null;
      const rawSalesTaxDetails = invoiceFields?.sales_tax_details;
      const salesTaxDetails = Array.isArray(rawSalesTaxDetails)
        ? rawSalesTaxDetails
        : [];
      const salesTaxForYear = salesTaxDetails.find(
        (tax: any) => tax.year === parseInt(year),
      );

      if (salesTaxForYear && parseFloat(salesTaxForYear.sales_tax) > 0) {
        const salesTaxAmount = parseFloat(salesTaxForYear.sales_tax);
        const salesTaxRow = columnKeys.map((key) => {
          switch (key) {
            case 'id':
              return String(contract.id || '');
            case 'product_name':
              return 'Sales Tax';
            case 'product_fee':
              return salesTaxAmount.toFixed(2);
            case 'fiscal_year':
              return fiscalYear;
            default:
              return '';
          }
        });
        allRows.push(salesTaxRow);
      }
    }
  }

  const csvContent = stringifyCsv(allRows, {
    header: false,
    quoted: true,
    quoted_empty: true,
    quoted_string: true,
  });

  logger.info(
    { rowCount: allRows.length - 1 },
    'Generated invoice folder CSV export',
  );

  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

function safeFormatDate(
  dateStr: string | null | undefined,
  pattern: string,
): string {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return '';
    return formatDate(d, pattern);
  } catch {
    return '';
  }
}

function extractTags(contract: any): string {
  if (contract.tags && Array.isArray(contract.tags)) {
    return contract.tags
      .map((t: any) => t.name)
      .filter(Boolean)
      .join(', ');
  }
  if (contract.contract_tags && Array.isArray(contract.contract_tags)) {
    return contract.contract_tags
      .filter((t: any) => t.user_tags?.name)
      .map((t: any) => t.user_tags.name)
      .join(', ');
  }
  return '';
}
