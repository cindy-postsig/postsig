/**
 * Report Pipeline Definitions
 *
 * Each report is defined as a pipeline with filter and transform steps.
 * Simple reports can be inline, complex ones import from separate files.
 */

import { ReportPipeline } from '../pipeline/types';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import {
  buildContractTableRow,
  buildContractTableRows,
} from '@/lib/v2/contracts/transforms';

// Import complex report definitions
import { doraReport } from './dora';
import { contractOmissionsReport } from './contract-omissions';
import { invoicesReport } from './invoices';
import { utilizationReport } from './utilization';
import { leaversReport } from './leavers';
import {
  allRenewalsReport,
  autoRenewalsReport,
  manualRenewalsReport,
  recentlyRenewedReport,
} from './renewals';
import { buildNdaReportRow } from '../transforms/nda';
import { isInvoiceType, isUnexecutedExcludedType } from '@/app/lib/constants';

/**
 * Helper to calculate days remaining from a date
 */
function calculateDaysRemaining(
  termEndDate: string | null | undefined,
): number {
  if (!termEndDate) return 0;
  try {
    const parsedDate = new Date(termEndDate);
    if (isNaN(parsedDate.getTime())) return 0;
    const days = Math.ceil(
      (parsedDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
    );
    return days > 0 ? days : 0;
  } catch {
    return 0;
  }
}

/**
 * Unconfirmed Report
 * Shows contracts with status 'unconfirmed', excluding invoices
 */
export const unconfirmedReport: ReportPipeline = {
  filter: (contracts) => ({
    contracts: contracts.filter(
      (c) =>
        c.contract.status === 'unconfirmed' &&
        !isInvoiceType(c.contract.type_id),
    ),
  }),
  transform: (contracts) => buildContractTableRows(contracts),
};

/**
 * Trial Report
 * Shows trial contracts (type_id 7) with days remaining
 */
export const trialReport: ReportPipeline = {
  filter: (contracts) => ({
    contracts: contracts.filter((c) => c.contract.type_id === 7),
  }),
  transform: (contracts) =>
    contracts.map((contract) => {
      const base = buildContractTableRow(contract);
      return {
        ...base,
        daysRemaining: calculateDaysRemaining(base.termEndDate),
      };
    }),
  metadata: {
    defaultSortColumn: 'daysRemaining',
    defaultSortDirection: 'asc',
  },
};

/**
 * NDA Report
 * Shows NDA contracts (type_id 8)
 */
export const ndaReport: ReportPipeline = {
  filter: (contracts) => ({
    contracts: contracts.filter((c) => c.contract.type_id === 8),
  }),
  transform: (contracts) => contracts.map(buildNdaReportRow),
};

/**
 * Unexecuted Report
 * Shows contracts not signed, with a vendor attached. Types with no signature
 * worth chasing -- invoices, fee schedules, a TOS, unclassified uploads -- are
 * excluded via UNEXECUTED_EXCLUDED_TYPE_IDS.
 */
export const unexecutedReport: ReportPipeline = {
  filter: (contracts) => ({
    contracts: contracts.filter(
      (c) =>
        c.contract.all_parties_signed === 'No' &&
        c.contract.vendor_id != null &&
        !isUnexecutedExcludedType(c.contract.type_id),
    ),
  }),
  transform: (contracts) => buildContractTableRows(contracts),
};

/**
 * Registry of all report pipelines
 */
export const reportPipelines: Record<string, ReportPipeline<any, any, any>> = {
  unconfirmed: unconfirmedReport,
  trial: trialReport,
  nda: ndaReport,
  unexecuted: unexecutedReport,
  dora: doraReport,
  'contract-omissions': contractOmissionsReport,
  invoices: invoicesReport,
  utilization: utilizationReport,
  leavers: leaversReport,
  'auto-renewals': autoRenewalsReport,
  'manual-renewals': manualRenewalsReport,
  'recently-renewed': recentlyRenewedReport,
  'all-renewals': allRenewalsReport,
};

export {
  doraReport,
  contractOmissionsReport,
  invoicesReport,
  utilizationReport,
  leaversReport,
  autoRenewalsReport,
  manualRenewalsReport,
  recentlyRenewedReport,
  allRenewalsReport,
};
