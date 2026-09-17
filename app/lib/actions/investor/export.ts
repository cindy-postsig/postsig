'use server';

import ExcelJS from 'exceljs';
import { stringifyCsv } from '@/lib/csv-export/stringify';
import { csvField } from '@/lib/csv-export/escape';
import archiver from 'archiver';
import logger from '@/utils/pino';
import { createClient } from '@/utils/supabase/server';
import { auditLogger, getUserAuditContext } from '@/lib/audit';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';
import type {
  PortfolioCompany,
  SecurityRow,
  LegalTerms,
  LiqPrefData,
  CapTableSnapshot,
  CapTableData,
} from '@/app/(app)/(investor)/investor/types';
import {
  buildPreferredStageRows,
  normalizeOurPreferredPct,
  percentOfTotal,
  snapshotsFromRestatementBoundary,
  type CapTableRow,
} from '@/app/(app)/(investor)/investor/cap-table-utils';
import { formatParticipationCap, formatCurrencyFull } from '@/app/lib/utils';
import { getEffectiveDateFormat, getUserMetadata } from '@/data/users';
import { formatDate } from '@/lib/date-format';
import { canExportCsv } from '@/lib/csv-export/can-export';
import { invDataCoverageLabel } from '@/lib/v2/inv/data-coverage';

// =============================================================================
// Shared Helpers
// =============================================================================

async function assertInvestorExportAllowed(): Promise<void> {
  const meta = await getUserMetadata();
  if (!canExportCsv(meta, 'investor')) {
    throw new Error('CSV export is not enabled for this organization');
  }
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value}`;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || value === 0) return '--';
  return `${value.toFixed(2)}%`;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || value === 0) return '--';
  return value.toLocaleString();
}

const PORTFOLIO_IMPORT_TYPE = 'portfolio_import';

function buildCapTableSecuritiesFromCapTableData(
  capTable: CapTableData,
): { securities: SecurityRow[]; snapshot: CapTableSnapshot } | null {
  const filteredSnapshots = capTable.snapshots.filter(
    (s) => s.snapshotTypeCode !== PORTFOLIO_IMPORT_TYPE,
  );
  if (filteredSnapshots.length === 0) return null;

  const currentSnapshot = filteredSnapshots[0];

  const result: CapTableRow[] = [];
  const makeLeafRow = (
    id: string,
    name: string,
    units: number,
    fdPercent: number,
    myUnits?: number,
    myFdPercent?: number,
  ): CapTableRow => ({
    id,
    isCategory: false,
    name,
    units,
    fdPercent,
    myUnits,
    myFdPercent,
  });

  const sumOptional = (
    securities: SecurityRow[],
    field: 'myUnits' | 'myFdPercent',
  ): number | undefined => {
    const hasData = securities.some((s) => s[field] != null);
    if (!hasData) return undefined;
    return securities.reduce((sum, s) => sum + (s[field] ?? 0), 0);
  };

  const txForDate = (capTable.transactions ?? []).filter(
    (t) => t.transactionDate <= currentSnapshot.asOfDate,
  );

  // ── Common Stock ──
  if (currentSnapshot.commonOutstanding != null) {
    const commonUnits = currentSnapshot.commonOutstanding;
    const commonFdPercent = percentOfTotal(
      commonUnits,
      currentSnapshot.fullyDilutedTotal,
    );

    const commonTx = txForDate.filter((t) => t.securityType === 'common');
    const commonMyUnits =
      commonTx.length > 0
        ? commonTx.reduce((sum, t) => sum + t.signedUnits, 0)
        : (currentSnapshot.ourCommonShares ?? undefined);
    const commonMyFdPercent =
      commonMyUnits != null
        ? percentOfTotal(commonMyUnits, currentSnapshot.fullyDilutedTotal)
        : undefined;

    result.push({
      id: 'common',
      isCategory: true,
      name: 'Common Stock',
      units: commonUnits,
      fdPercent: commonFdPercent,
      myUnits: commonMyUnits,
      myFdPercent: commonMyFdPercent,
      subRows: [
        makeLeafRow(
          'common-sub',
          'Common',
          commonUnits,
          commonFdPercent,
          commonMyUnits,
          commonMyFdPercent,
        ),
      ],
    });
  }

  // ── Preferred Stock ──
  const preferredByName = new Map<string, SecurityRow>();
  const pctBySecurityName = new Map<string, number | null>();
  // Same restatement boundary as the capitalization tab, so the export can't
  // contradict what the UI shows.
  const snapshotsUpToDate = snapshotsFromRestatementBoundary(
    filteredSnapshots,
    currentSnapshot.asOfDate,
  );
  for (const snap of snapshotsUpToDate) {
    for (const sec of snap.securities.filter(
      (s) => s.securityType === 'preferred',
    )) {
      preferredByName.set(sec.name, sec);
      pctBySecurityName.set(sec.name, snap.ourPreferredPct);
    }
  }
  const preferredSecurities = Array.from(preferredByName.values()).reverse();

  if (
    currentSnapshot.preferredOutstanding != null ||
    preferredSecurities.length > 0
  ) {
    const preferredUnits = currentSnapshot.preferredOutstanding ?? 0;
    const preferredFdPercent = percentOfTotal(
      preferredUnits,
      currentSnapshot.fullyDilutedTotal,
    );

    let subRows: CapTableRow[];

    if (preferredSecurities.length > 0) {
      subRows = preferredSecurities.map((s) => {
        const snapPct = normalizeOurPreferredPct(pctBySecurityName.get(s.name));
        const myUnits =
          snapPct != null ? Math.round(s.units * snapPct) : undefined;
        const myFdPercent =
          myUnits != null
            ? percentOfTotal(myUnits, currentSnapshot.fullyDilutedTotal)
            : undefined;
        return makeLeafRow(
          `preferred-${s.id}`,
          s.name,
          s.units,
          s.fdPercent,
          myUnits,
          myFdPercent,
        );
      });
    } else {
      subRows = buildPreferredStageRows(
        snapshotsUpToDate,
        currentSnapshot.fullyDilutedTotal,
      );

      if (subRows.length === 0) {
        const fallbackPct = normalizeOurPreferredPct(
          currentSnapshot.ourPreferredPct,
        );
        const fallbackMyUnits =
          fallbackPct != null
            ? Math.round(preferredUnits * fallbackPct)
            : undefined;
        subRows = [
          makeLeafRow(
            'preferred-sub',
            currentSnapshot.stageName || 'Preferred Stock',
            preferredUnits,
            preferredFdPercent,
            fallbackMyUnits,
            fallbackMyUnits != null
              ? percentOfTotal(
                  fallbackMyUnits,
                  currentSnapshot.fullyDilutedTotal,
                )
              : undefined,
          ),
        ];
      }
    }

    const hasSubRowMyData = subRows.some((r) => r.myUnits != null);
    const preferredMyUnits = hasSubRowMyData
      ? subRows.reduce(
          (sum, r) => (r.myUnits != null ? sum + r.myUnits : sum),
          0,
        )
      : undefined;
    const preferredMyFdPercent =
      preferredMyUnits != null
        ? percentOfTotal(preferredMyUnits, currentSnapshot.fullyDilutedTotal)
        : undefined;

    result.push({
      id: 'preferred',
      isCategory: true,
      name: 'Preferred Stock',
      units: preferredUnits,
      fdPercent: preferredFdPercent,
      myUnits: preferredMyUnits,
      myFdPercent: preferredMyFdPercent,
      subRows,
    });
  }

  // ── Options & Warrants ──
  const relevantPlanSnapshot = (capTable.equityPlanSnapshots ?? [])
    .filter((s) => s.effectiveDate <= currentSnapshot.asOfDate)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];

  const OPTION_WARRANT_TYPES = ['option', 'warrant'];
  const optionSecurities = currentSnapshot.securities.filter(
    (s) =>
      s.securityType != null && OPTION_WARRANT_TYPES.includes(s.securityType),
  );

  if (
    relevantPlanSnapshot ||
    optionSecurities.length > 0 ||
    currentSnapshot.optionPoolOutstanding != null
  ) {
    let optionUnits: number;
    let optionFdPercent: number;

    if (relevantPlanSnapshot) {
      optionUnits = relevantPlanSnapshot.issuedShares ?? 0;
      optionFdPercent = percentOfTotal(
        optionUnits,
        currentSnapshot.fullyDilutedTotal,
      );
    } else if (optionSecurities.length > 0) {
      optionUnits = optionSecurities.reduce((sum, s) => sum + s.units, 0);
      optionFdPercent = percentOfTotal(
        optionUnits,
        currentSnapshot.fullyDilutedTotal,
      );
    } else {
      optionUnits = currentSnapshot.optionPoolAuthorized ?? 0;
      optionFdPercent =
        currentSnapshot.optionPoolFdPercent ??
        percentOfTotal(optionUnits, currentSnapshot.fullyDilutedTotal);
    }

    const optionMyUnits = relevantPlanSnapshot
      ? 0
      : sumOptional(optionSecurities, 'myUnits');
    const optionMyFdPercent = relevantPlanSnapshot
      ? 0
      : sumOptional(optionSecurities, 'myFdPercent');

    result.push({
      id: 'options-warrants',
      isCategory: true,
      name: 'Options & Warrants',
      units: optionUnits,
      fdPercent: optionFdPercent,
      myUnits: optionMyUnits,
      myFdPercent: optionMyFdPercent,
      subRows: [
        makeLeafRow(
          'employee-options',
          'Employee Options',
          optionUnits,
          optionFdPercent,
          optionMyUnits,
          optionMyFdPercent,
        ),
      ],
    });
  }

  const securities: SecurityRow[] = [];
  for (const row of result) {
    securities.push({
      id: row.id,
      name: row.name,
      units: row.units,
      fdPercent: row.fdPercent,
      myUnits: row.myUnits,
      myFdPercent: row.myFdPercent,
    });
    if (row.subRows) {
      for (const sub of row.subRows) {
        securities.push({
          id: sub.id,
          name: sub.name,
          parentId: row.id,
          units: sub.units,
          fdPercent: sub.fdPercent,
          myUnits: sub.myUnits,
          myFdPercent: sub.myFdPercent,
        });
      }
    }
  }

  return { securities, snapshot: currentSnapshot };
}

// =============================================================================
// Company Export (Excel & CSV)
// =============================================================================

/**
 * Export company data to Excel
 * Returns array of bytes that can be converted to Blob on client
 */
export async function exportCompanyExcel(
  company: PortfolioCompany,
): Promise<number[]> {
  await assertInvestorExportAllowed();
  try {
    const dateFormat = await getEffectiveDateFormat();
    const workbook = new ExcelJS.Workbook();

    // Overview Sheet
    const overviewSheet = workbook.addWorksheet('Overview');
    addCompanyOverviewSheet(overviewSheet, company, dateFormat);

    // Cap Table Sheet (if available)
    if (company.capTable && company.capTable.snapshots.length > 0) {
      const capTableSheet = workbook.addWorksheet('Cap Table');
      addCompanyCapTableSheet(capTableSheet, company, dateFormat);
    }

    if (company.liqPrefData && company.liqPrefData.rows.length > 0) {
      const liqPrefSheet = workbook.addWorksheet('Liq Pref');
      addLiqPrefSheet(liqPrefSheet, company.liqPrefData, company.name);
    }

    if (company.legalTerms) {
      const legalTermsSheet = workbook.addWorksheet('Legal Terms');
      addLegalTermsSheet(legalTermsSheet, company.legalTerms);
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    logger.info(
      { companyName: company.name, companyId: company.id },
      'Generated company Excel export',
    );

    await auditLogger.logExportEvent(
      'investor-company-xlsx',
      await getUserAuditContext(),
      {
        format: 'xlsx',
        companyName: company.name,
        resourceIds: company.id ? [company.id] : undefined,
        filename: `${company.name}_Export.xlsx`,
      },
    );

    return Array.from(new Uint8Array(buffer));
  } catch (error) {
    logger.error({ error }, 'Failed to generate company Excel');
    throw new Error('Failed to generate company Excel');
  }
}

function addCompanyOverviewSheet(
  worksheet: ExcelJS.Worksheet,
  company: PortfolioCompany,
  dateFormat: string,
): void {
  // Title
  const titleRow = worksheet.addRow([company.name]);
  titleRow.font = { bold: true, size: 16 };
  worksheet.mergeCells(1, 1, 1, 2);

  worksheet.addRow([]);

  // Company Details Section
  const detailsHeader = worksheet.addRow(['Company Details']);
  detailsHeader.font = { bold: true, size: 12 };

  const details = [
    ['Stage', company.stage],
    ['Fund', company.fund],
    ['Industry', company.industry],
    ['Headquarters', company.headquarters],
    ['Entity Type', company.entityType],
    ['Jurisdiction', company.corporateJurisdiction],
    ['Founded', company.foundedYear],
    ['Website', company.companyUrl],
  ];

  details.forEach(([label, value]) => {
    worksheet.addRow([label, value]);
  });

  worksheet.addRow([]);

  // Valuation Section
  const valuationHeader = worksheet.addRow(['Valuation']);
  valuationHeader.font = { bold: true, size: 12 };

  const valuationData = [
    ['Post Money Valuation', formatCurrency(company.postMoneyValuation)],
    ['Total Equity Financing', formatCurrency(company.totalEquityFinancing)],
    ['Current Price Per Unit', `$${company.currentPricePerUnit.toFixed(4)}`],
    [
      'Last Transaction Date',
      formatDate(company.lastTransactionDate, dateFormat, ''),
    ],
  ];

  valuationData.forEach(([label, value]) => {
    worksheet.addRow([label, value]);
  });

  worksheet.addRow([]);

  // My Investment Section
  const investmentHeader = worksheet.addRow(['My Investment']);
  investmentHeader.font = { bold: true, size: 12 };

  const investmentData = [
    ['My Total FMV', formatCurrency(company.myTotalFMV)],
    ['My Aggregate Cost', formatCurrency(company.myAggregateCost)],
    ['Implied Value', formatCurrency(company.impliedValue)],
    ['MOIC', company.multiple ? `${company.multiple.toFixed(2)}x` : '--'],
    [
      'My Fully Diluted %',
      company.myFullyDilutedPercent
        ? `${company.myFullyDilutedPercent.toFixed(2)}%`
        : '--',
    ],
    ['Entry Date', formatDate(company.myEntryDate, dateFormat, '')],
    ['Stage at Entry', company.stageAtEntry],
    ['My Entry Cost', formatCurrency(Math.abs(company.myEntryCost))],
  ];

  investmentData.forEach(([label, value]) => {
    worksheet.addRow([label, value]);
  });

  // Set column widths
  worksheet.columns = [{ width: 25 }, { width: 30 }];
}

function addCompanyCapTableSheet(
  worksheet: ExcelJS.Worksheet,
  company: PortfolioCompany,
  dateFormat: string,
): void {
  const capTableResult = buildCapTableSecuritiesFromCapTableData(
    company.capTable!,
  );
  if (!capTableResult) return;
  const { securities: effectiveSecurities, snapshot } = capTableResult;

  // Title
  const titleRow = worksheet.addRow([`${company.name} - Cap Table`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(1, 1, 1, 5);

  const dateRow = worksheet.addRow([
    `As of: ${formatDate(snapshot.asOfDate, dateFormat)}`,
  ]);
  dateRow.font = { italic: true };

  worksheet.addRow([]);

  // Header
  const headerRow = worksheet.addRow([
    'Security',
    'Units',
    'FD%',
    'My Units',
    'My FD%',
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
  });

  // Securities
  const parentSecurities = effectiveSecurities.filter((s) => !s.parentId);

  parentSecurities.forEach((parent) => {
    const parentRow = worksheet.addRow([
      parent.name,
      parent.units,
      parent.fdPercent,
      parent.myUnits ?? '',
      parent.myFdPercent ?? '',
    ]);
    parentRow.font = { bold: true };

    const children = effectiveSecurities.filter(
      (s) => s.parentId === parent.id,
    );
    children.forEach((child) => {
      worksheet.addRow([
        `  ${child.name}`,
        child.units,
        child.fdPercent,
        child.myUnits ?? '',
        child.myFdPercent ?? '',
      ]);
    });
  });

  const totalUnits = parentSecurities.reduce((sum, s) => sum + s.units, 0);
  const totalFdPercent = parentSecurities.reduce(
    (sum, s) => sum + s.fdPercent,
    0,
  );
  const totalMyUnits = parentSecurities.reduce(
    (sum, s) => sum + (s.myUnits ?? 0),
    0,
  );
  const totalMyFdPercent = parentSecurities.reduce(
    (sum, s) => sum + (s.myFdPercent ?? 0),
    0,
  );

  worksheet.addRow([]);
  const totalRow = worksheet.addRow([
    'Total',
    totalUnits,
    totalFdPercent,
    totalMyUnits || '',
    totalMyFdPercent || '',
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: 'double' } };
  });

  worksheet.columns = [
    { width: 25 },
    { width: 15 },
    { width: 10 },
    { width: 15 },
    { width: 12 },
  ];
}

function addLegalTermsSheet(
  worksheet: ExcelJS.Worksheet,
  legalTerms: LegalTerms,
): void {
  const formatBoolean = (value: boolean | null): string => {
    if (value === null) return '--';
    return value ? 'Yes' : 'No';
  };

  // Title
  const titleRow = worksheet.addRow(['Legal Terms']);
  titleRow.font = { bold: true, size: 16 };
  worksheet.mergeCells(1, 1, 1, 2);

  worksheet.addRow([]);

  // Status Section
  const statusHeader = worksheet.addRow(['Status']);
  statusHeader.font = { bold: true, size: 12 };
  worksheet.addRow([
    'Major Investor Status',
    formatBoolean(legalTerms.headerStatus.majorInvestorStatus),
  ]);
  worksheet.addRow([
    'Information Rights',
    formatBoolean(legalTerms.headerStatus.informationRights),
  ]);

  worksheet.addRow([]);

  // Major Investor Thresholds
  const majorHeader = worksheet.addRow(['Major Investor Thresholds']);
  majorHeader.font = { bold: true, size: 12 };
  worksheet.addRow([
    'Threshold Amount',
    legalTerms.majorInvestor.thresholdAmount
      ? `$${legalTerms.majorInvestor.thresholdAmount.toLocaleString()}`
      : '--',
  ]);
  worksheet.addRow([
    'Threshold Ownership %',
    legalTerms.majorInvestor.thresholdOwnershipPercent
      ? `${legalTerms.majorInvestor.thresholdOwnershipPercent}%`
      : '--',
  ]);
  worksheet.addRow([
    'Threshold Shares',
    legalTerms.majorInvestor.thresholdShares
      ? legalTerms.majorInvestor.thresholdShares.toLocaleString()
      : '--',
  ]);
  if (legalTerms.majorInvestor.namedMajorInvestor.length > 0) {
    worksheet.addRow([
      'Named Major Investors',
      legalTerms.majorInvestor.namedMajorInvestor.join(', '),
    ]);
  }

  worksheet.addRow([]);

  // Economic Rights
  const economicHeader = worksheet.addRow(['Economic Rights']);
  economicHeader.font = { bold: true, size: 12 };
  worksheet.addRow([
    'Anti-Dilution Rights',
    legalTerms.economicRights.antiDilutionRights || '--',
  ]);
  worksheet.addRow([
    'Milestone Closings',
    formatBoolean(legalTerms.economicRights.milestoneClosings),
  ]);
  if (legalTerms.economicRights.liquidationPreferenceSeniority.length > 0) {
    worksheet.addRow([
      'Liquidation Preference Seniority',
      legalTerms.economicRights.liquidationPreferenceSeniority.join(', '),
    ]);
  }

  worksheet.addRow([]);

  // QSBS
  const qsbsHeader = worksheet.addRow(['QSBS']);
  qsbsHeader.font = { bold: true, size: 12 };
  worksheet.addRow([
    'QSBS Covenant Given',
    formatBoolean(legalTerms.qsbs.qualifiedSmallBusinessStockCovenantGiven),
  ]);
  worksheet.addRow([
    'QSBS Rep Made',
    formatBoolean(legalTerms.qsbs.qualifiedSmallBusinessRepMade),
  ]);

  worksheet.addRow([]);

  // Dividends
  const dividendsHeader = worksheet.addRow(['Dividends']);
  dividendsHeader.font = { bold: true, size: 12 };
  worksheet.addRow([
    'Accruing Dividends',
    formatBoolean(legalTerms.dividends.accruingDividends),
  ]);
  worksheet.addRow([
    'Cumulative Dividends',
    formatBoolean(legalTerms.dividends.cumulativeDividends),
  ]);
  worksheet.addRow([
    'Dividend Rate',
    legalTerms.dividends.dividendRate
      ? `${legalTerms.dividends.dividendRate}%`
      : '--',
  ]);
  worksheet.addRow([
    'Dividend Seniority',
    legalTerms.dividends.dividendSeniority || '--',
  ]);

  worksheet.addRow([]);

  // Other Legal Terms
  const otherHeader = worksheet.addRow(['Other Legal Terms']);
  otherHeader.font = { bold: true, size: 12 };
  worksheet.addRow([
    'Pro Rata Rights (All)',
    formatBoolean(legalTerms.otherLegalTerms.proRataRightsForAll),
  ]);
  worksheet.addRow([
    'Pro Rata Rights (Major Investors)',
    formatBoolean(legalTerms.otherLegalTerms.proRataRightsForMajorInvestors),
  ]);
  worksheet.addRow([
    'Standard Pro Rata Formulation',
    formatBoolean(legalTerms.otherLegalTerms.standardProRataFormulation),
  ]);
  worksheet.addRow([
    'Drag Along',
    formatBoolean(legalTerms.otherLegalTerms.dragAlong),
  ]);
  worksheet.addRow([
    'Pay to Play',
    formatBoolean(legalTerms.otherLegalTerms.payToPlay),
  ]);
  worksheet.addRow([
    'D&O Insurance',
    formatBoolean(legalTerms.otherLegalTerms.dAndOInsurance),
  ]);
  worksheet.addRow([
    'ROFR & Co-Sale Agreement',
    formatBoolean(legalTerms.otherLegalTerms.rofrAndCosaleAgreement),
  ]);
  worksheet.addRow([
    'Investors Subject to ROFR',
    formatBoolean(legalTerms.otherLegalTerms.investorsSubjectToROFR),
  ]);
  worksheet.addRow([
    'Investor Counsel Fee Cap',
    legalTerms.otherLegalTerms.investorCounselFeeCap
      ? `$${legalTerms.otherLegalTerms.investorCounselFeeCap.toLocaleString()}`
      : '--',
  ]);
  worksheet.addRow([
    'Issuer Pays Investor Counsel Fees',
    formatBoolean(legalTerms.otherLegalTerms.issuerPaysInvestorCounselFees),
  ]);
  worksheet.addRow([
    'Employee Vesting Protocol',
    formatBoolean(legalTerms.otherLegalTerms.employeeVestingProtocol),
  ]);
  worksheet.addRow([
    'Founder Vesting Protocol',
    formatBoolean(legalTerms.otherLegalTerms.founderVestingProtocol),
  ]);
  worksheet.addRow([
    'Required Closing Payments',
    formatBoolean(legalTerms.otherLegalTerms.requiredClosingPayments),
  ]);
  worksheet.addRow([
    'Subsequent Closing Window',
    legalTerms.otherLegalTerms.subsequentClosingWindowDays
      ? `${legalTerms.otherLegalTerms.subsequentClosingWindowDays} days`
      : '--',
  ]);
  worksheet.addRow([
    'Registration Rights (Preferred)',
    formatBoolean(
      legalTerms.otherLegalTerms.registrationRightsForPreferredInvestors,
    ),
  ]);

  // Set column widths
  worksheet.columns = [{ width: 35 }, { width: 30 }];
}

function getParticipationLabel(type: string | null): string {
  switch (type) {
    case 'none':
      return 'Non-Part.';
    case 'full':
      return 'Full';
    case 'capped':
      return 'Capped';
    default:
      return '-';
  }
}

function addLiqPrefSheet(
  worksheet: ExcelJS.Worksheet,
  liqPrefData: LiqPrefData,
  companyName: string,
): void {
  const titleRow = worksheet.addRow([`${companyName} - Capital Stack`]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(1, 1, 1, 4);

  worksheet.addRow([]);

  worksheet.addRow([
    'My Total Liq Pref',
    formatCurrencyFull(liqPrefData.myTotalLiqPref),
  ]);
  worksheet.addRow([
    'Total Liq Pref',
    formatCurrencyFull(liqPrefData.totalLiqPref),
  ]);

  worksheet.addRow([]);

  const headerRow = worksheet.addRow([
    'Equity Class',
    'Preference',
    'Price/Unit',
    'Multiplier',
    'Participation',
    'Cap',
    'My Shares',
    'My Cost',
    'My Liq Pref',
    'Total Liq Pref',
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
  });

  liqPrefData.rows.forEach((row) => {
    worksheet.addRow([
      row.equityClass,
      row.preference ?? '--',
      row.pricePerUnit != null ? `$${row.pricePerUnit.toFixed(4)}` : '--',
      row.multiplier != null ? `${row.multiplier}x` : '--',
      getParticipationLabel(row.participationType),
      formatParticipationCap(row.participationCap),
      row.myShares,
      row.myCost,
      row.myLiqPref,
      row.totalLiqPref ?? '--',
    ]);
  });

  worksheet.columns = [
    { width: 18 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 8 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
  ];
}

export async function exportLiqPrefCSV(
  liqPrefData: LiqPrefData,
  companyName: string,
): Promise<string> {
  await assertInvestorExportAllowed();
  return [
    csvField(`${companyName} - Capital Stack`),
    ...formatLiqPrefCSV(liqPrefData),
  ].join('\n');
}

function formatLiqPrefCSV(liqPrefData: LiqPrefData): string[] {
  const lines: string[] = [];

  lines.push('');
  lines.push('"Capital Stack"');
  lines.push(
    `"My Total Liq Pref",${csvField(formatCurrencyFull(liqPrefData.myTotalLiqPref))}`,
  );
  lines.push(
    `"Total Liq Pref",${csvField(formatCurrencyFull(liqPrefData.totalLiqPref))}`,
  );
  lines.push('');
  lines.push(
    '"Equity Class","Preference","Price/Unit","Multiplier","Participation","Cap","My Shares","My Cost","My Liq Pref","Total Liq Pref"',
  );

  liqPrefData.rows.forEach((row) => {
    lines.push(
      [
        csvField(row.equityClass),
        csvField(row.preference ?? '--'),
        csvField(
          row.pricePerUnit != null ? '$' + row.pricePerUnit.toFixed(4) : '--',
        ),
        csvField(row.multiplier != null ? row.multiplier + 'x' : '--'),
        csvField(getParticipationLabel(row.participationType)),
        csvField(formatParticipationCap(row.participationCap)),
        csvField(row.myShares.toLocaleString()),
        csvField(formatCurrencyFull(row.myCost)),
        csvField(formatCurrencyFull(row.myLiqPref)),
        csvField(
          row.totalLiqPref != null
            ? formatCurrencyFull(row.totalLiqPref)
            : '--',
        ),
      ].join(','),
    );
  });

  return lines;
}

/**
 * Export company data to CSV
 */
export async function exportCompanyCSV(
  company: PortfolioCompany,
): Promise<string> {
  await assertInvestorExportAllowed();
  try {
    const dateFormat = await getEffectiveDateFormat();
    const lines: string[] = [];

    lines.push(csvField(company.name));
    lines.push('');

    lines.push('"Company Details"');
    lines.push(`"Stage",${csvField(company.stage)}`);
    lines.push(`"Fund",${csvField(company.fund)}`);
    lines.push(`"Industry",${csvField(company.industry)}`);
    lines.push(`"Headquarters",${csvField(company.headquarters)}`);
    lines.push(`"Entity Type",${csvField(company.entityType)}`);
    lines.push(`"Jurisdiction",${csvField(company.corporateJurisdiction)}`);
    lines.push(`"Founded",${csvField(company.foundedYear)}`);
    lines.push(`"Website",${csvField(company.companyUrl)}`);
    lines.push('');

    lines.push('"Valuation"');
    lines.push(
      `"Post Money Valuation",${csvField(formatCurrency(company.postMoneyValuation))}`,
    );
    lines.push(
      `"Total Equity Financing",${csvField(formatCurrency(company.totalEquityFinancing))}`,
    );
    lines.push(
      `"Current Price Per Unit","$${company.currentPricePerUnit.toFixed(4)}"`,
    );
    lines.push(
      `"Last Transaction Date",${csvField(formatDate(company.lastTransactionDate, dateFormat, ''))}`,
    );
    lines.push('');

    lines.push('"My Investment"');
    lines.push(
      `"My Total FMV",${csvField(formatCurrency(company.myTotalFMV))}`,
    );
    lines.push(
      `"My Aggregate Cost",${csvField(formatCurrency(company.myAggregateCost))}`,
    );
    lines.push(
      `"Implied Value",${csvField(formatCurrency(company.impliedValue))}`,
    );
    lines.push(
      `"MOIC",${csvField(company.multiple ? company.multiple.toFixed(2) + 'x' : '--')}`,
    );
    lines.push(
      `"My Fully Diluted %",${csvField(company.myFullyDilutedPercent ? company.myFullyDilutedPercent.toFixed(2) + '%' : '--')}`,
    );
    lines.push(
      `"Entry Date",${csvField(formatDate(company.myEntryDate, dateFormat, ''))}`,
    );
    lines.push(`"Stage at Entry",${csvField(company.stageAtEntry)}`);
    lines.push(
      `"My Entry Cost",${csvField(formatCurrency(Math.abs(company.myEntryCost)))}`,
    );

    if (company.capTable && company.capTable.snapshots.length > 0) {
      const capTableResult = buildCapTableSecuritiesFromCapTableData(
        company.capTable,
      );
      if (capTableResult) {
        const { securities: effectiveSecurities, snapshot } = capTableResult;
        lines.push('');
        lines.push(
          `"Cap Table - As of ${formatDate(snapshot.asOfDate, dateFormat)}"`,
        );
        lines.push('"Security","Units","FD%","My Units","My FD%"');

        const parentSecurities = effectiveSecurities.filter((s) => !s.parentId);

        parentSecurities.forEach((parent) => {
          lines.push(formatSecurityCSV(parent));

          const children = effectiveSecurities.filter(
            (s) => s.parentId === parent.id,
          );
          children.forEach((child) => {
            lines.push(formatSecurityCSV(child, true));
          });
        });

        const totalUnits = parentSecurities.reduce(
          (sum, s) => sum + s.units,
          0,
        );
        const totalFdPercent = parentSecurities.reduce(
          (sum, s) => sum + s.fdPercent,
          0,
        );
        const totalMyUnits = parentSecurities.reduce(
          (sum, s) => sum + (s.myUnits ?? 0),
          0,
        );
        const totalMyFdPercent = parentSecurities.reduce(
          (sum, s) => sum + (s.myFdPercent ?? 0),
          0,
        );

        lines.push('');
        lines.push(
          `"Total",${csvField(totalUnits.toLocaleString())},${csvField(`${totalFdPercent.toFixed(4)}%`)},${csvField(totalMyUnits ? totalMyUnits.toLocaleString() : '--')},${csvField(totalMyFdPercent ? totalMyFdPercent.toFixed(4) + '%' : '--')}`,
        );
      }
    }

    if (company.liqPrefData && company.liqPrefData.rows.length > 0) {
      lines.push(...formatLiqPrefCSV(company.liqPrefData));
    }

    if (company.legalTerms) {
      lines.push(...formatLegalTermsCSV(company.legalTerms));
    }

    logger.info(
      { companyName: company.name, companyId: company.id },
      'Generated company CSV export',
    );

    await auditLogger.logExportEvent(
      'investor-company-csv',
      await getUserAuditContext(),
      {
        format: 'csv',
        companyName: company.name,
        resourceIds: company.id ? [company.id] : undefined,
        filename: `${company.name}_Export.csv`,
      },
    );

    return lines.join('\n');
  } catch (error) {
    logger.error({ error }, 'Failed to generate company CSV');
    throw new Error('Failed to generate company CSV');
  }
}

function formatSecurityCSV(
  security: {
    name: string;
    units: number;
    fdPercent: number;
    myUnits?: number;
    myFdPercent?: number;
  },
  isChild: boolean = false,
): string {
  const name = isChild ? `  ${security.name}` : security.name;
  const units = security.units.toLocaleString();
  const fdPercent = `${security.fdPercent.toFixed(4)}%`;
  const myUnits =
    security.myUnits && security.myUnits > 0
      ? security.myUnits.toLocaleString()
      : '--';
  const myFdPercent =
    security.myFdPercent && security.myFdPercent > 0
      ? `${security.myFdPercent.toFixed(4)}%`
      : '--';

  return [
    csvField(name),
    csvField(units),
    csvField(fdPercent),
    csvField(myUnits),
    csvField(myFdPercent),
  ].join(',');
}

function formatLegalTermsCSV(legalTerms: LegalTerms): string[] {
  const formatBoolean = (value: boolean | null): string => {
    if (value === null) return '--';
    return value ? 'Yes' : 'No';
  };

  const lines: string[] = [];

  lines.push('');
  lines.push('"Legal Terms"');
  lines.push('');

  lines.push('"Status"');
  lines.push(
    `"Major Investor Status",${csvField(formatBoolean(legalTerms.headerStatus.majorInvestorStatus))}`,
  );
  lines.push(
    `"Information Rights",${csvField(formatBoolean(legalTerms.headerStatus.informationRights))}`,
  );
  lines.push('');

  lines.push('"Major Investor Thresholds"');
  lines.push(
    `"Threshold Amount",${csvField(legalTerms.majorInvestor.thresholdAmount ? '$' + legalTerms.majorInvestor.thresholdAmount.toLocaleString() : '--')}`,
  );
  lines.push(
    `"Threshold Ownership %",${csvField(legalTerms.majorInvestor.thresholdOwnershipPercent ? legalTerms.majorInvestor.thresholdOwnershipPercent + '%' : '--')}`,
  );
  lines.push(
    `"Threshold Shares",${csvField(legalTerms.majorInvestor.thresholdShares ? legalTerms.majorInvestor.thresholdShares.toLocaleString() : '--')}`,
  );
  if (legalTerms.majorInvestor.namedMajorInvestor.length > 0) {
    lines.push(
      `"Named Major Investors",${csvField(legalTerms.majorInvestor.namedMajorInvestor.join(', '))}`,
    );
  }
  lines.push('');

  lines.push('"Economic Rights"');
  lines.push(
    `"Anti-Dilution Rights",${csvField(legalTerms.economicRights.antiDilutionRights || '--')}`,
  );
  lines.push(
    `"Milestone Closings",${csvField(formatBoolean(legalTerms.economicRights.milestoneClosings))}`,
  );
  if (legalTerms.economicRights.liquidationPreferenceSeniority.length > 0) {
    lines.push(
      `"Liquidation Preference Seniority",${csvField(legalTerms.economicRights.liquidationPreferenceSeniority.join(', '))}`,
    );
  }
  lines.push('');

  lines.push('"QSBS"');
  lines.push(
    `"QSBS Covenant Given",${csvField(formatBoolean(legalTerms.qsbs.qualifiedSmallBusinessStockCovenantGiven))}`,
  );
  lines.push(
    `"QSBS Rep Made",${csvField(formatBoolean(legalTerms.qsbs.qualifiedSmallBusinessRepMade))}`,
  );
  lines.push('');

  lines.push('"Dividends"');
  lines.push(
    `"Accruing Dividends",${csvField(formatBoolean(legalTerms.dividends.accruingDividends))}`,
  );
  lines.push(
    `"Cumulative Dividends",${csvField(formatBoolean(legalTerms.dividends.cumulativeDividends))}`,
  );
  lines.push(
    `"Dividend Rate",${csvField(legalTerms.dividends.dividendRate ? legalTerms.dividends.dividendRate + '%' : '--')}`,
  );
  lines.push(
    `"Dividend Seniority",${csvField(legalTerms.dividends.dividendSeniority || '--')}`,
  );
  lines.push('');

  lines.push('"Other Legal Terms"');
  lines.push(
    `"Pro Rata Rights (All)",${csvField(formatBoolean(legalTerms.otherLegalTerms.proRataRightsForAll))}`,
  );
  lines.push(
    `"Pro Rata Rights (Major Investors)",${csvField(formatBoolean(legalTerms.otherLegalTerms.proRataRightsForMajorInvestors))}`,
  );
  lines.push(
    `"Standard Pro Rata Formulation",${csvField(formatBoolean(legalTerms.otherLegalTerms.standardProRataFormulation))}`,
  );
  lines.push(
    `"Drag Along",${csvField(formatBoolean(legalTerms.otherLegalTerms.dragAlong))}`,
  );
  lines.push(
    `"Pay to Play",${csvField(formatBoolean(legalTerms.otherLegalTerms.payToPlay))}`,
  );
  lines.push(
    `"D&O Insurance",${csvField(formatBoolean(legalTerms.otherLegalTerms.dAndOInsurance))}`,
  );
  lines.push(
    `"ROFR & Co-Sale Agreement",${csvField(formatBoolean(legalTerms.otherLegalTerms.rofrAndCosaleAgreement))}`,
  );
  lines.push(
    `"Investors Subject to ROFR",${csvField(formatBoolean(legalTerms.otherLegalTerms.investorsSubjectToROFR))}`,
  );
  lines.push(
    `"Investor Counsel Fee Cap",${csvField(legalTerms.otherLegalTerms.investorCounselFeeCap ? '$' + legalTerms.otherLegalTerms.investorCounselFeeCap.toLocaleString() : '--')}`,
  );
  lines.push(
    `"Issuer Pays Investor Counsel Fees",${csvField(formatBoolean(legalTerms.otherLegalTerms.issuerPaysInvestorCounselFees))}`,
  );
  lines.push(
    `"Employee Vesting Protocol",${csvField(formatBoolean(legalTerms.otherLegalTerms.employeeVestingProtocol))}`,
  );
  lines.push(
    `"Founder Vesting Protocol",${csvField(formatBoolean(legalTerms.otherLegalTerms.founderVestingProtocol))}`,
  );
  lines.push(
    `"Required Closing Payments",${csvField(formatBoolean(legalTerms.otherLegalTerms.requiredClosingPayments))}`,
  );
  lines.push(
    `"Subsequent Closing Window",${csvField(legalTerms.otherLegalTerms.subsequentClosingWindowDays ? legalTerms.otherLegalTerms.subsequentClosingWindowDays + ' days' : '--')}`,
  );
  lines.push(
    `"Registration Rights (Preferred)",${csvField(formatBoolean(legalTerms.otherLegalTerms.registrationRightsForPreferredInvestors))}`,
  );

  return lines;
}

// =============================================================================
// Cap Table Export (Excel & CSV)
// =============================================================================

interface ExportCapTableParams {
  companyName: string;
  asOfDate: string;
  securities: SecurityRow[];
  snapshotTotals?: {
    totalUnits: number | null;
    myUnits: number | null;
    myFdPercent: number | null;
  };
}

/**
 * Export cap table data to Excel
 * Returns array of bytes that can be converted to Blob on client
 */
export async function exportCapTableExcel({
  companyName,
  asOfDate,
  securities,
  snapshotTotals,
}: ExportCapTableParams): Promise<number[]> {
  await assertInvestorExportAllowed();
  try {
    const dateFormat = await getEffectiveDateFormat();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cap Table');

    // Add title row
    const titleRow = worksheet.addRow([`${companyName} - Cap Table`]);
    titleRow.font = { bold: true, size: 14 };
    worksheet.mergeCells(1, 1, 1, 5);

    // Add date row
    const dateRow = worksheet.addRow([
      `As of: ${formatDate(asOfDate, dateFormat)}`,
    ]);
    dateRow.font = { italic: true };
    worksheet.mergeCells(2, 1, 2, 5);

    // Add empty row
    worksheet.addRow([]);

    // Add header row
    const headerRow = worksheet.addRow([
      'Security',
      'Units',
      'FD%',
      'My Units',
      'My FD%',
    ]);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      cell.border = {
        bottom: { style: 'thin' },
      };
    });

    // Get parent securities (no parentId)
    const parentSecurities = securities.filter((s) => !s.parentId);

    // Add data rows
    parentSecurities.forEach((parent) => {
      // Add parent row
      const parentRow = worksheet.addRow([
        parent.name,
        parent.units,
        parent.fdPercent,
        parent.myUnits ?? '',
        parent.myFdPercent ?? '',
      ]);
      parentRow.font = { bold: true };

      // Format cells
      formatCapTableRow(parentRow);

      // Find and add children
      const children = securities.filter((s) => s.parentId === parent.id);
      children.forEach((child) => {
        const childRow = worksheet.addRow([
          `  ${child.name}`, // Indent child
          child.units,
          child.fdPercent,
          child.myUnits ?? '',
          child.myFdPercent ?? '',
        ]);
        formatCapTableRow(childRow);
      });
    });

    // Add totals row
    const totalUnits =
      snapshotTotals?.totalUnits ??
      parentSecurities.reduce((sum, s) => sum + s.units, 0);
    const totalFdPercent = parentSecurities.reduce(
      (sum, s) => sum + s.fdPercent,
      0,
    );
    const totalMyUnits =
      snapshotTotals?.myUnits ??
      parentSecurities.reduce((sum, s) => sum + (s.myUnits ?? 0), 0);
    const totalMyFdPercent =
      snapshotTotals?.myFdPercent ??
      parentSecurities.reduce((sum, s) => sum + (s.myFdPercent ?? 0), 0);

    worksheet.addRow([]); // Empty row before totals
    const totalRow = worksheet.addRow([
      'Total',
      totalUnits,
      totalFdPercent,
      totalMyUnits || '',
      totalMyFdPercent || '',
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'double' },
      };
    });
    formatCapTableRow(totalRow);

    // Set column widths
    worksheet.columns = [
      { width: 25 }, // Security
      { width: 15 }, // Units
      { width: 10 }, // FD%
      { width: 15 }, // My Units
      { width: 12 }, // My FD%
    ];

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    logger.info(
      { companyName, asOfDate, securityCount: securities.length },
      'Generated cap table Excel',
    );

    await auditLogger.logExportEvent(
      'investor-cap-table-xlsx',
      await getUserAuditContext(),
      {
        format: 'xlsx',
        rowCount: securities.length,
        filename: `${companyName}-cap-table.xlsx`,
        companyName,
        asOfDate,
      },
    );

    return Array.from(new Uint8Array(buffer));
  } catch (error) {
    logger.error({ error }, 'Failed to generate cap table Excel');
    throw new Error('Failed to generate cap table Excel');
  }
}

function formatCapTableRow(row: ExcelJS.Row): void {
  // Format Units column (2) with commas
  const unitsCell = row.getCell(2);
  if (typeof unitsCell.value === 'number') {
    unitsCell.numFmt = '#,##0';
  }

  // Format FD% column (3)
  const fdPercentCell = row.getCell(3);
  if (typeof fdPercentCell.value === 'number') {
    fdPercentCell.numFmt = '0.0000"%"';
  }

  // Format My Units column (4)
  const myUnitsCell = row.getCell(4);
  if (typeof myUnitsCell.value === 'number') {
    myUnitsCell.numFmt = '#,##0';
  }

  // Format My FD% column (5)
  const myFdPercentCell = row.getCell(5);
  if (typeof myFdPercentCell.value === 'number') {
    myFdPercentCell.numFmt = '0.0000"%"';
  }
}

/**
 * Export cap table data to CSV format
 * Returns CSV string
 */
export async function exportCapTableCSV({
  companyName,
  asOfDate,
  securities,
  snapshotTotals,
}: ExportCapTableParams): Promise<string> {
  await assertInvestorExportAllowed();
  try {
    const dateFormat = await getEffectiveDateFormat();
    const lines: string[] = [];

    // Add header
    lines.push(csvField(`${companyName} - Cap Table`));
    lines.push(`"As of: ${formatDate(asOfDate, dateFormat)}"`);
    lines.push('');
    lines.push('"Security","Units","FD%","My Units","My FD%"');

    // Get parent securities
    const parentSecurities = securities.filter((s) => !s.parentId);

    // Add data rows
    parentSecurities.forEach((parent) => {
      lines.push(formatCapTableCSVRow(parent));

      // Find and add children
      const children = securities.filter((s) => s.parentId === parent.id);
      children.forEach((child) => {
        lines.push(formatCapTableCSVRow(child, true));
      });
    });

    // Add totals
    const totalUnits =
      snapshotTotals?.totalUnits ??
      parentSecurities.reduce((sum, s) => sum + s.units, 0);
    const totalFdPercent = parentSecurities.reduce(
      (sum, s) => sum + s.fdPercent,
      0,
    );

    lines.push('');
    const totalMyUnits =
      snapshotTotals?.myUnits ??
      parentSecurities.reduce((sum, s) => sum + (s.myUnits ?? 0), 0);
    const totalMyFdPercent =
      snapshotTotals?.myFdPercent ??
      parentSecurities.reduce((sum, s) => sum + (s.myFdPercent ?? 0), 0);
    lines.push(
      `"Total",${csvField(totalUnits.toLocaleString())},${csvField(`${totalFdPercent.toFixed(4)}%`)},${csvField(totalMyUnits ? totalMyUnits.toLocaleString() : '--')},${csvField(totalMyFdPercent ? `${totalMyFdPercent.toFixed(4)}%` : '--')}`,
    );

    logger.info(
      { companyName, asOfDate, securityCount: securities.length },
      'Generated cap table CSV',
    );

    await auditLogger.logExportEvent(
      'investor-cap-table-csv',
      await getUserAuditContext(),
      {
        format: 'csv',
        rowCount: securities.length,
        filename: `${companyName}-cap-table.csv`,
        companyName,
        asOfDate,
      },
    );

    return lines.join('\n');
  } catch (error) {
    logger.error({ error }, 'Failed to generate cap table CSV');
    throw new Error('Failed to generate cap table CSV');
  }
}

function formatCapTableCSVRow(
  security: SecurityRow,
  isChild: boolean = false,
): string {
  const name = isChild ? `  ${security.name}` : security.name;
  const units = security.units.toLocaleString();
  const fdPercent = `${security.fdPercent.toFixed(4)}%`;
  const myUnits =
    security.myUnits && security.myUnits > 0
      ? security.myUnits.toLocaleString()
      : '--';
  const myFdPercent =
    security.myFdPercent && security.myFdPercent > 0
      ? `${security.myFdPercent.toFixed(4)}%`
      : '--';

  return [
    csvField(name),
    csvField(units),
    csvField(fdPercent),
    csvField(myUnits),
    csvField(myFdPercent),
  ].join(',');
}

// =============================================================================
// Portfolio Export (CSV)
// =============================================================================

/**
 * Export portfolio companies to CSV
 * Used by VentureTableClient for exporting the portfolio table
 */
export async function exportPortfolioCSV(
  companies: PortfolioCompany[],
): Promise<string> {
  await assertInvestorExportAllowed();
  try {
    const dateFormat = await getEffectiveDateFormat();
    const headers = [
      'Company',
      'Stage',
      'Stage at Entry',
      'Status',
      'Data Coverage',
      'Fund',
      'My FMV',
      'FMV As-of Date',
      'Post-Money Valuation',
      'My FD%',
      'Tags',
      'Headquarters',
      'Industry',
      'Founded Year',
      'My Aggregate Cost',
      'MOIC',
      'Total Equity Financing',
      'Last Transaction Date',
    ];

    const rows = companies.map((company) => [
      company.name,
      company.stage,
      company.stageAtEntry,
      company.investmentStatus,
      invDataCoverageLabel(company),
      company.fund,
      company.myTotalFMV,
      formatDate(company.fmvAsOfDate, dateFormat, ''),
      company.postMoneyValuation,
      company.myFullyDilutedPercent ? `${company.myFullyDilutedPercent}%` : '',
      company.tags?.map((t) => t.name).join(', ') || '',
      company.headquarters,
      company.industry,
      company.foundedYear,
      company.myAggregateCost,
      company.multiple ? `${company.multiple}x` : '',
      company.totalEquityFinancing,
      formatDate(company.lastTransactionDate, dateFormat, ''),
    ]);

    const csvContent = stringifyCsv([headers, ...rows], {
      header: false,
      quoted: true,
      quoted_empty: true,
      quoted_string: true,
    });

    logger.info(
      { companyCount: companies.length },
      'Generated portfolio CSV export',
    );

    await auditLogger.logExportEvent(
      'investor-portfolio-csv',
      await getUserAuditContext(),
      {
        format: 'csv',
        rowCount: companies.length,
        filename: 'portfolio.csv',
      },
    );

    return csvContent;
  } catch (error) {
    logger.error({ error }, 'Failed to generate portfolio CSV');
    throw new Error('Failed to generate portfolio CSV');
  }
}

// =============================================================================
// Document Download
// =============================================================================

/**
 * Generate a signed URL for downloading a venture document
 * Returns null if the file path is invalid or URL generation fails
 */
export async function getVentureDocumentSignedUrl(
  filePath: string,
): Promise<string | null> {
  try {
    if (!filePath) {
      logger.warn('No file path provided for signed URL generation');
      return null;
    }

    const segments = filePath.split('/').filter(Boolean);
    let safePath: string;
    try {
      safePath = buildSafePath(segments);
    } catch (error) {
      if (error instanceof PathTraversalError) {
        logger.warn({ filePath }, 'Path traversal attempt detected');
        return null;
      }
      throw error;
    }

    const supabase = await createClient();

    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(safePath, 60 * 60); // 1 hour expiry

    if (error) {
      logger.error(
        { error, filePath },
        'Failed to generate signed URL for venture document',
      );
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    logger.error({ error, filePath }, 'Error generating venture document URL');
    return null;
  }
}

interface DocumentFile {
  filePath: string;
  fileName: string;
}

/**
 * Download all venture documents as a zip file
 * Returns array of bytes that can be converted to Blob on client
 */
export async function downloadAllVentureDocuments(
  files: DocumentFile[],
  zipFileName: string,
): Promise<{ data: number[]; fileName: string } | { error: string }> {
  try {
    if (!files || files.length === 0) {
      return { error: 'No files to download' };
    }

    const supabase = await createClient();

    // Create archive
    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks: Buffer[] = [];

    // Set up event listeners BEFORE piping
    const archivePromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err) => reject(err));
      archive.on('warning', (err) => {
        if (err.code !== 'ENOENT') {
          logger.warn({ error: err }, 'Archiver warning');
        }
      });
    });

    // Track which files were added to avoid duplicates
    const addedFileNames = new Set<string>();
    let filesAdded = 0;

    // Download each file and add to archive
    for (const file of files) {
      try {
        const segments = file.filePath.split('/').filter(Boolean);
        let safePath: string;
        try {
          safePath = buildSafePath(segments);
        } catch (pathError) {
          if (pathError instanceof PathTraversalError) {
            logger.warn(
              { filePath: file.filePath },
              'Path traversal attempt detected, skipping file',
            );
            continue;
          }
          throw pathError;
        }

        const { data, error } = await supabase.storage
          .from('documents')
          .download(safePath);

        if (error) {
          logger.warn(
            { error, filePath: file.filePath },
            'Failed to download file for zip',
          );
          continue;
        }

        // Handle duplicate file names by appending a number
        let fileName = file.fileName;
        let counter = 1;
        while (addedFileNames.has(fileName)) {
          const ext = file.fileName.lastIndexOf('.');
          if (ext > 0) {
            fileName = `${file.fileName.slice(0, ext)}_${counter}${file.fileName.slice(ext)}`;
          } else {
            fileName = `${file.fileName}_${counter}`;
          }
          counter++;
        }
        addedFileNames.add(fileName);

        const buffer = Buffer.from(await data.arrayBuffer());
        archive.append(buffer, { name: fileName });
        filesAdded++;
      } catch (err) {
        logger.warn(
          { error: err, filePath: file.filePath },
          'Error processing file for zip',
        );
      }
    }

    if (filesAdded === 0) {
      archive.abort();
      return { error: 'No files could be downloaded' };
    }

    // Finalize the archive
    await archive.finalize();

    // Wait for archive to complete
    const zipBuffer = await archivePromise;

    logger.info(
      { fileCount: filesAdded, zipFileName, sizeBytes: zipBuffer.length },
      'Generated venture documents zip',
    );

    return {
      data: Array.from(new Uint8Array(zipBuffer)),
      fileName: zipFileName,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to generate venture documents zip');
    return { error: 'Failed to generate zip file' };
  }
}
