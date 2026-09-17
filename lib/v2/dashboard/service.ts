import {
  getContractsList,
  getFiscalYearStartMonth,
} from '@/lib/v2/contracts/service';
import { buildReportFromContracts, ReportData } from '@/lib/v2/reports/service';
import { aggregateTopVendors, TopVendor } from '@/lib/v2/vendors/transforms';
import { buildBudgetSummary, BudgetSummary } from '@/lib/v2/core/budget';
import { resolveWindow } from '@/lib/v2/spend';

export type { BudgetSummary } from '@/lib/v2/core/budget';

export interface ReportSummary {
  count: number;
  totalValueInUSD: number;
}

export interface LeaversSummary extends ReportSummary {
  productCount: number;
}

export interface NeedsAttentionData {
  unconfirmed: ReportSummary;
  contractOmissions: ReportSummary;
  dora: ReportSummary;
  unexecuted: ReportSummary;
  leavers: LeaversSummary;
  /**
   * Absent for an org without Cost Allocation: the item cannot be acted on.
   * Populated by the dashboard's NeedsAttentionSection only — getDashboardData
   * leaves it out because its consumer reads none of needsAttention, and the
   * membership pass costs an allocation-context load.
   */
  unallocated?: ReportSummary;
}

export interface DashboardData {
  // Budget data
  budgetSummary: BudgetSummary;
  topVendors: TopVendor[];

  // Needs attention summaries
  needsAttention: NeedsAttentionData;

  // Report previews
  autoRenewalsReport: ReportData;
  invoicesReport: ReportData;
  utilizationReport: ReportData;
  ndaReport: ReportData;
  trialReport: ReportData;
}

/**
 * Get all dashboard data in a single call.
 * Fetches contracts once and builds all reports from the same data.
 */
export async function getDashboardData(): Promise<DashboardData> {
  // FETCH ONCE
  const [{ contracts }, fiscalYearStartMonth] = await Promise.all([
    getContractsList(),
    getFiscalYearStartMonth(),
  ]);

  // BUILD BUDGET SUMMARY from contracts
  const budgetSummary = buildBudgetSummary(contracts, {
    staleInvoiceCutoff: resolveWindow('currentFY', new Date(), {
      startMonth: fiscalYearStartMonth,
    }).start,
  });

  // AGGREGATE TOP VENDORS — per-vendor engine stamps, not legacy histories
  const topVendors = aggregateTopVendors(budgetSummary.aggregatableContracts);

  // BUILD ALL REPORTS from same contracts (in parallel for any async enrichments)
  const [
    autoRenewalsReport,
    invoicesReport,
    utilizationReport,
    ndaReport,
    trialReport,
    // Needs attention reports (just need summaries)
    unconfirmedReport,
    contractOmissionsReport,
    doraReport,
    unexecutedReport,
    leaversReport,
  ] = await Promise.all([
    buildReportFromContracts('auto-renewals', contracts),
    buildReportFromContracts('invoices', contracts),
    buildReportFromContracts('utilization', contracts),
    buildReportFromContracts('nda', contracts),
    buildReportFromContracts('trial', contracts),
    buildReportFromContracts('unconfirmed', contracts),
    buildReportFromContracts('contract-omissions', contracts),
    buildReportFromContracts('dora', contracts),
    buildReportFromContracts('unexecuted', contracts),
    buildReportFromContracts('leavers', contracts),
  ]);

  // Extract summaries for needs attention
  const needsAttention: NeedsAttentionData = {
    unconfirmed: {
      count: unconfirmedReport.contracts.length,
      totalValueInUSD: unconfirmedReport.totalValueInUSD,
    },
    contractOmissions: {
      count: contractOmissionsReport.contracts.length,
      totalValueInUSD: contractOmissionsReport.totalValueInUSD,
    },
    dora: {
      count: doraReport.contracts.length,
      totalValueInUSD: doraReport.totalValueInUSD,
    },
    unexecuted: {
      count: unexecutedReport.contracts.length,
      totalValueInUSD: unexecutedReport.totalValueInUSD,
    },
    leavers: {
      count: leaversReport.contracts.length,
      totalValueInUSD: leaversReport.totalValueInUSD,
      productCount:
        (leaversReport.metadata?.productCount as number | undefined) ?? 0,
    },
  };

  return {
    budgetSummary,
    topVendors,
    needsAttention,
    autoRenewalsReport,
    invoicesReport,
    utilizationReport,
    ndaReport,
    trialReport,
  };
}
