/**
 * Pipeline Runner
 *
 * Executes report pipelines and handles common operations.
 */

import { getContractsList, EnrichedContract } from '@/lib/v2/contracts/service';
import { getUserMetadata } from '@/data/users';
import { getOrganizationMissingClauseSettings } from '@/app/lib/contracts/actions';
import {
  filterActiveContracts,
  filterExcludeInvoices,
} from '@/lib/v2/core/filters';
import { sumValuesInUSD, getUSDValue } from '@/lib/v2/core/budget';
import { reportPipelines } from '../definitions';
import { reportConfigs } from '@/app/(app)/(cpm)/reports/reportConfigs';
import { ReportData, ReportSummary, PipelineOptions } from './types';

export interface ReportOptions extends PipelineOptions {
  /** Which value field to sum for total */
  valueField?: string;
  /**
   * Narrow the report to these contracts (the CSV export of a selection).
   * Applied after the base filters and before the report's own filter, so an
   * export can only ever be a subset of the on-screen report.
   */
  contractIds?: number[];
}

/**
 * Build report data from pre-fetched contracts.
 * Use this when you already have enriched contracts and want to avoid re-fetching.
 */
export async function buildReportFromContracts(
  reportType: string,
  contracts: EnrichedContract[],
  options: ReportOptions = {},
): Promise<ReportData> {
  const pipeline = reportPipelines[reportType];
  if (!pipeline) {
    throw new Error(`Unknown report type: ${reportType}`);
  }

  // 1. BASE FILTER - Active contracts only
  // Use core filter for consistency, then exclude invoices
  let baseFiltered = filterActiveContracts(contracts);

  // Exclude all invoices (type_id 6) unless the pipeline explicitly includes
  // them. Invoices should only surface in the Invoices report.
  const includeInvoices = pipeline.metadata?.includeInvoices === true;
  if (!includeInvoices) {
    baseFiltered = filterExcludeInvoices(baseFiltered);
  }

  // Store all published contracts for metadata (used by DORA tabs)
  const allFilteredContracts = baseFiltered;

  // 1b. NARROW TO A REQUESTED SELECTION (CSV export). Deliberately a separate
  // variable: `allContracts` below must keep the unnarrowed set, because
  // invoice segment-fee lineage reads amendments that sit outside the
  // selection.
  const selectedContracts = options.contractIds
    ? narrowToContractIds(baseFiltered, options.contractIds)
    : baseFiltered;

  // 2. FETCH ORG SETTINGS for reports that need them
  let pipelineOptions = { ...options };
  // The full input set, BEFORE filters: an invoice's parent's amendments are
  // not invoices and may not even be active, but lineage needs them.
  pipelineOptions.allContracts = contracts;
  if (
    pipeline.metadata?.requiresSettings ||
    reportType === 'contract-omissions'
  ) {
    const userMetadata = await getUserMetadata();
    if (userMetadata?.organizationId) {
      const { settings, isConfirmed } =
        await getOrganizationMissingClauseSettings(userMetadata.organizationId);
      if (isConfirmed) {
        pipelineOptions.missingClauseSettings = settings;
      }
    }
  }

  // 3. APPLY REPORT-SPECIFIC FILTER
  const filterResult = await Promise.resolve(
    pipeline.filter(selectedContracts, pipelineOptions),
  );
  const filtered = filterResult.contracts;

  // 4. OPTIONAL ENRICHMENT (e.g., invoice data)
  let context = filterResult.context;
  if (pipeline.enrich) {
    context = await pipeline.enrich(filtered, pipelineOptions);
  }

  // 5. TRANSFORM - Build report rows
  const rows = pipeline.transform(filtered, context);

  // 6. CALCULATE TOTALS
  const valueField = options.valueField || 'totalContractValue';
  let totalValueInUSD = 0;

  if (pipeline.calculateTotal) {
    totalValueInUSD = pipeline.calculateTotal(rows, valueField);
  } else {
    // Default calculation from contract data
    totalValueInUSD = calculateDefaultTotal(filtered, valueField);
  }

  // 7. BUILD METADATA
  const metadata: Record<string, unknown> = {
    ...filterResult.metadata,
  };

  if (reportType === 'dora') {
    metadata.allContracts = allFilteredContracts;
  }

  return {
    contracts: filtered,
    rows,
    totalValueInUSD,
    metadata,
  };
}

/**
 * Contract ids reach the export as row ids, which are strings
 * (ContractTableRow.id), so both sides are matched in their string form.
 */
function narrowToContractIds(
  contracts: EnrichedContract[],
  contractIds: number[],
): EnrichedContract[] {
  const requested = new Set(contractIds.map((id) => String(id)));
  return contracts.filter((c) => requested.has(String(c.id)));
}

/**
 * Get report data using the pipeline architecture.
 * Fetches contracts and runs the pipeline.
 */
export async function getReportData(
  reportType: string,
  options: ReportOptions = {},
): Promise<ReportData> {
  // Fetch enriched contracts, keeping the lineage inputs the fetch already
  // resolved (relationships + PSK-1830 cutoffs) so pipelines reuse them.
  const { contracts, relationships, cutoffsByContract } =
    await getContractsList();

  // Build report from contracts
  return buildReportFromContracts(reportType, contracts, {
    relationships,
    cutoffsByContract,
    ...options,
  });
}

/**
 * Default total calculation from contract data
 */
function calculateDefaultTotal(
  contracts: EnrichedContract[],
  valueField: string,
): number {
  return sumValuesInUSD(contracts, (c: EnrichedContract) =>
    getUSDValue(c, valueField),
  );
}

/**
 * Get lightweight report summary (count and total value only).
 */
export async function getReportSummary(
  reportType: string,
  options: ReportOptions = {},
): Promise<ReportSummary> {
  const config = reportConfigs[reportType as keyof typeof reportConfigs];
  const valueField = config?.valueField || 'totalContractValue';

  const data = await getReportData(reportType, { ...options, valueField });
  return {
    count: data.rows.length,
    totalValueInUSD: data.totalValueInUSD,
  };
}

/**
 * Get summaries for multiple report types in one call.
 */
export async function getMultipleReportSummaries(
  reportTypes: string[],
  options: ReportOptions = {},
): Promise<Record<string, ReportSummary>> {
  const summaries: Record<string, ReportSummary> = {};

  const results = await Promise.all(
    reportTypes.map((type) => getReportSummary(type, options)),
  );

  reportTypes.forEach((type, index) => {
    summaries[type] = results[index];
  });

  return summaries;
}
