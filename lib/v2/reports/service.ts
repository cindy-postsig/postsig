/**
 * V2 Reports Service
 *
 * Main entry point for reports. Uses the functional pipeline architecture.
 */

// Core functions
export {
  getReportData,
  buildReportFromContracts,
  getReportSummary,
  getMultipleReportSummaries,
} from './pipeline/runner';

// Types
export type { ReportOptions } from './pipeline/runner';
export type { ReportData, ReportSummary, ReportRow } from './pipeline/types';

// Transform row types
export type { DoraReportRow } from './transforms/dora';
export type { TrialReportRow } from './transforms/trial';
export type { NdaReportRow } from './transforms/nda';
export type { UtilizationReportRow } from './transforms/utilization';
export type { LeaversReportRow } from './transforms/leavers';
export type { MissingClausesReportRow } from './transforms/missing-clauses';
export type { InvoicesReportRow } from './transforms/invoices';

// Pipeline registry
export { reportPipelines } from './definitions';
