/**
 * Pipeline Types
 *
 * Type definitions for the functional pipeline architecture.
 */

import { EnrichedContract } from '@/lib/v2/contracts/service';
import type { RelationshipEdge } from '@/lib/v2/spend';
import { ContractTableRow } from '@/lib/v2/core/types';

/**
 * Result from a filter step, including filtered contracts and optional context
 */
export interface FilterResult<TContext = unknown> {
  contracts: EnrichedContract[];
  context?: TContext;
  // Metadata that should be passed through to the final result
  metadata?: Record<string, unknown>;
}

/**
 * Report row type - base type for all report rows
 * Uses V2 ContractTableRow which includes all optional report-specific fields
 */
export type ReportRow = ContractTableRow;

/**
 * Options passed to pipeline steps
 */
export interface PipelineOptions {
  activeTab?: string;
  valueField?: string;
  /**
   * The full pre-filter contract set and its lineage inputs, threaded by the
   * runner so enrich steps can build REAL spend lineage (amendments live
   * outside a report's filtered subset). relationships/cutoffsByContract ride
   * along when the caller's ContractsResult already resolved them (PSK-1830);
   * an enrich step falls back to fetching them itself when absent.
   */
  allContracts?: EnrichedContract[];
  relationships?: RelationshipEdge[];
  cutoffsByContract?: Map<number, Map<number, Date>>;
  [key: string]: unknown;
}

/**
 * Main pipeline interface - defines the steps for processing a report
 */
export interface ReportPipeline<
  TOptions = PipelineOptions,
  TContext = unknown,
  TRow = ReportRow,
> {
  /**
   * Filter contracts for this report type
   * Returns filtered contracts and optional context data
   */
  filter: (
    contracts: EnrichedContract[],
    options?: TOptions,
  ) => FilterResult<TContext> | Promise<FilterResult<TContext>>;

  /**
   * Transform filtered contracts into report rows
   * Receives context from filter step
   */
  transform: (contracts: EnrichedContract[], context?: TContext) => TRow[];

  /**
   * Optional async enrichment step (e.g., fetching invoice data)
   * Returns context to be passed to transform
   */
  enrich?: (
    contracts: EnrichedContract[],
    options?: TOptions,
  ) => Promise<TContext>;

  /**
   * Optional custom total calculation
   * If not provided, uses default calculation
   */
  calculateTotal?: (rows: TRow[], valueField: string) => number;

  /**
   * Pipeline metadata and configuration
   */
  metadata?: {
    /** Whether this report requires org settings */
    requiresSettings?: boolean;
    /** Default column to sort by */
    defaultSortColumn?: string;
    /** Default sort direction */
    defaultSortDirection?: 'asc' | 'desc';
    /**
     * Whether to include invoices (type_id 6) in base filtering.
     * By default, all invoices are excluded so they only surface in the
     * Dora and Invoices (Invoice Discrepancy) reports.
     * Set to true for reports that specifically need invoices.
     */
    includeInvoices?: boolean;
  };
}

/**
 * Report data returned from pipeline execution
 */
export interface ReportData<TRow extends ReportRow = ReportRow> {
  /** Filtered contracts */
  contracts: EnrichedContract[];
  /** Transformed rows for table */
  rows: TRow[];
  /** Total value in USD */
  totalValueInUSD: number;
  /** Report-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Lightweight report summary
 */
export interface ReportSummary {
  count: number;
  totalValueInUSD: number;
}
