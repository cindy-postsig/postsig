'use server';

import ExcelJS from 'exceljs';
import logger from '@/utils/pino';
import { auditLogger, getUserAuditContext } from '@/lib/audit';
import { assertCsvExportAllowed } from '@/lib/csv-export/assert-export';
import {
  getEnrichedContracts,
  getFiscalYearStartMonth,
} from '@/lib/v2/contracts/service';
import { resolveWindow, type CurrencyPolicy } from '@/lib/v2/spend';
import {
  buildBudgetExportValues,
  budgetExportWindows,
  BUDGET_EXPORT_METHODS,
} from '@/lib/v2/reports/budget-export/engine';
import { buildSpendRateProvider } from '@/lib/v2/core/spendRates';
import {
  buildContractRows,
  type ContractRow,
} from '@/lib/v2/reports/budget-export/rows';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import { costMethodLabels } from '@/components/budget/costMethod';
import { getEffectiveBaseCurrency, getEffectiveDateFormat } from '@/data/users';
import { cancelledProductNames } from '@/lib/contracts/productLineageResolution';
import { formatDate } from '@/lib/date-format';
import { getCurrencySymbol } from '@/app/lib/utils';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function monthLabel(monthKey: string): string {
  return MONTH_NAMES[Number(monthKey.slice(5)) - 1];
}

function createMethodSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  kept: ContractWithPricing[],
  monthlyValues: Map<number, Record<string, number>>,
  months: string[],
  dateFormat: string,
  cancelledNamesByContract: Map<number, string>,
  moneyFormat: string,
): void {
  const worksheet = workbook.addWorksheet(sheetName);
  const contractRows = buildContractRows(
    kept,
    monthlyValues,
    cancelledNamesByContract,
  );
  const monthCount = months.length;
  const firstMonthCol = 16;
  const lastMonthCol = firstMonthCol + monthCount - 1;

  const yearLabels = months.map((m) => m.slice(0, 4));
  const yearHeaderRow = worksheet.addRow([
    ...Array(firstMonthCol - 1).fill(''),
    ...yearLabels,
  ]);

  let currentYear = yearLabels[0];
  let startCol = firstMonthCol;
  for (let i = 1; i <= monthCount; i++) {
    if (i === monthCount || yearLabels[i] !== currentYear) {
      if (yearLabels[i - 1] === currentYear) {
        worksheet.mergeCells(1, startCol, 1, firstMonthCol - 1 + i);
      }
      if (i < monthCount) {
        currentYear = yearLabels[i];
        startCol = firstMonthCol + i;
      }
    }
  }

  yearHeaderRow.font = { bold: true };
  yearHeaderRow.alignment = { horizontal: 'center' };

  const headerRow = worksheet.addRow([
    'Document ID',
    'Vendor',
    'Product Name',
    'Term Start Date',
    'Term End Date',
    'Cancel By Date',
    'Renewal Type',
    'Multi-Year Contract',
    'Subscription Term',
    'Billing Frequency',
    'Currency',
    'Annual Increase',
    'Business Sponsor',
    'Business Group',
    'Tags',
    ...months.map(monthLabel),
    // Appended after the month block so the month column ranges (merges,
    // currency formats, SUM formulas) stay untouched.
    'Cancelled Products',
  ]);
  headerRow.font = { bold: true };

  const contractsByVendor = new Map<string, ContractRow[]>();
  contractRows.forEach((row) => {
    if (!contractsByVendor.has(row.vendor)) {
      contractsByVendor.set(row.vendor, []);
    }
    contractsByVendor.get(row.vendor)!.push(row);
  });

  contractsByVendor.forEach((vendorContracts, vendorName) => {
    const vendorHeaderRowNum = worksheet.rowCount + 1;

    const vendorRow = worksheet.addRow([
      '',
      vendorName,
      ...Array(13).fill(''),
      ...months.map(() => ''),
    ]);
    vendorRow.font = { bold: true };
    vendorRow.outlineLevel = 0;

    const vendorStartRow = worksheet.rowCount + 1;

    vendorContracts.forEach((contract) => {
      const monthValues = months.map(
        (month) => contract.monthlyValues[month] || 0,
      );

      const row = worksheet.addRow([
        contract.id,
        '', // Vendor name is in group header
        contract.product,
        contract.termStartDate
          ? formatDate(contract.termStartDate, dateFormat, '')
          : '',
        contract.termEndDate
          ? formatDate(contract.termEndDate, dateFormat, '')
          : '',
        contract.cancelByDate
          ? formatDate(contract.cancelByDate, dateFormat, '')
          : '',
        contract.renewalType,
        contract.multiYearContract,
        contract.subscriptionTerm,
        contract.billingFrequency,
        contract.currency,
        contract.annualIncrease,
        contract.businessSponsor,
        contract.businessGroup,
        contract.tags,
        ...monthValues,
        contract.cancelledProducts,
      ]);

      row.outlineLevel = 1;

      for (let i = firstMonthCol; i <= lastMonthCol; i++) {
        const cell = row.getCell(i);
        if (typeof cell.value === 'number') {
          cell.numFmt = moneyFormat;
        }
      }
    });

    const vendorEndRow = worksheet.rowCount;
    const vendorHeaderRow = worksheet.getRow(vendorHeaderRowNum);

    for (let colNum = firstMonthCol; colNum <= lastMonthCol; colNum++) {
      let colLetter = '';
      let temp = colNum;
      while (temp > 0) {
        const remainder = (temp - 1) % 26;
        colLetter = String.fromCharCode(65 + remainder) + colLetter;
        temp = Math.floor((temp - 1) / 26);
      }

      const cell = vendorHeaderRow.getCell(colNum);
      cell.value = {
        formula: `SUM(${colLetter}${vendorStartRow}:${colLetter}${vendorEndRow})`,
      };
      cell.numFmt = moneyFormat;
    }
  });

  worksheet.columns = [
    { width: 10 }, // ID
    { width: 30 }, // Vendor
    { width: 30 }, // Product Name
    { width: 15 }, // Term Start Date
    { width: 15 }, // Term End Date
    { width: 15 }, // Cancel By Date
    { width: 15 }, // Renewal Type
    { width: 18 }, // Multi-Year Contract
    { width: 18 }, // Subscription Term
    { width: 18 }, // Billing Frequency
    { width: 12 }, // Currency
    { width: 15 }, // Annual Increase
    { width: 20 }, // Business Sponsor
    { width: 20 }, // Business Group
    { width: 25 }, // Tags
    ...months.map(() => ({ width: 12 })),
    { width: 30 }, // Cancelled Products
  ];

  worksheet.properties.outlineLevelCol = 0;
  worksheet.properties.outlineLevelRow = 1;
  worksheet.properties.outlineProperties = {
    summaryBelow: false,
    summaryRight: false,
  };

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 2 && row.outlineLevel && row.outlineLevel > 0) {
      row.hidden = true;
    }
  });
}

/**
 * Export the budget overview's spend data to Excel — one sheet per psk-1844
 * cost method (Amortized | Actual Cost | Contract Term), engine-computed with
 * the chart's exact queries and inclusion, so the workbook matches whatever
 * method the chart is showing. A historical `fiscalYear` selection exports
 * that year + the next over the historical row set (archived included).
 */
export async function exportBudgetChartData(
  fiscalYear?: number,
): Promise<number[]> {
  await assertCsvExportAllowed('cpm');
  const dateFormat = await getEffectiveDateFormat();
  try {
    const asOf = new Date();
    const fiscalConfig = { startMonth: await getFiscalYearStartMonth() };

    // Only a genuinely historical year changes the export; anything else
    // (current, future, junk input) falls back to the default windows.
    const currentFY = resolveWindow('currentFY', asOf, fiscalConfig).fyNum;
    const historicalFY =
      typeof fiscalYear === 'number' &&
      Number.isInteger(fiscalYear) &&
      fiscalYear < currentFY
        ? fiscalYear
        : undefined;

    const {
      contracts: enriched,
      relationships,
      cutoffsByContract: eventCutoffs,
    } = await getEnrichedContracts(
      'active',
      false,
      historicalFY !== undefined,
      0,
      false,
    );

    // Confirmed cancellation cutoffs (PSK-1830), resolved during the shared
    // enrichment. The names feed the workbook's Cancelled Products column so
    // struck products stay visible in the record rather than silently zeroed.
    const cancelledNamesByContract = cancelledProductNames(
      enriched.map((ec) => ec.contract),
      eventCutoffs,
    );

    // Amortized and Actual Cost recognise money per calendar month, so their
    // rates are the monthly averages across both exported fiscal years.
    const windows = budgetExportWindows(historicalFY);
    const target = await getEffectiveBaseCurrency();
    const currency: CurrencyPolicy = {
      mode: 'base',
      target,
      rates: await buildSpendRateProvider({
        contracts: enriched.map((ec) => ec.contract),
        target,
        asOf,
        span: {
          start: resolveWindow(windows[0], asOf, fiscalConfig).start,
          end: resolveWindow(windows[1], asOf, fiscalConfig).end,
        },
      }),
    };

    const { kept, months, values } = buildBudgetExportValues(
      enriched,
      relationships,
      fiscalConfig,
      asOf,
      currency,
      historicalFY,
      eventCutoffs,
    );

    const workbook = new ExcelJS.Workbook();
    for (const method of BUDGET_EXPORT_METHODS) {
      createMethodSheet(
        workbook,
        costMethodLabels[method],
        kept,
        values[method],
        months,
        dateFormat,
        cancelledNamesByContract,
        `${getCurrencySymbol(target)}#,##0.00`,
      );
    }

    const buffer = await workbook.xlsx.writeBuffer();

    logger.info(
      { contractCount: kept.length },
      'Generated budget chart data Excel with 3 sheets',
    );

    await auditLogger.logExportEvent(
      'budget-chart-xlsx',
      await getUserAuditContext(),
      {
        format: 'xlsx',
        rowCount: kept.length,
        resourceIds: kept.map((ec) => ec.id),
        filename: 'budget-chart.xlsx',
      },
    );

    return Array.from(new Uint8Array(buffer));
  } catch (error) {
    logger.error({ error }, 'Failed to generate budget chart data Excel');
    throw new Error('Failed to generate budget chart data Excel');
  }
}
