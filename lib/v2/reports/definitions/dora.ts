/**
 * DORA Report Pipeline Definition
 *
 * All DORA logic in one place for easy debugging.
 */

import { ReportPipeline, FilterResult } from '../pipeline/types';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import { buildDoraReportRow, DoraReportRow } from '../transforms/dora';

interface DoraOptions {
  activeTab?: 'ict' | 'other' | string;
}

interface DoraContext {
  hasIctProviders: boolean;
  allVendorsIctProviderNull: boolean;
}

export interface DoraReportMetadata extends DoraContext {
  allContracts?: EnrichedContract[];
}

export const doraReport: ReportPipeline<
  DoraOptions,
  DoraContext,
  DoraReportRow
> = {
  filter: (contracts, options): FilterResult<DoraContext> => {
    const activeTab = options?.activeTab || 'ict';

    // Check ICT provider status
    const hasIctProviders = contracts.some(
      (c) => c.contract.vendors?.ict_provider === true,
    );

    const allVendorsIctProviderNull =
      contracts.length > 0 &&
      contracts.every(
        (c) =>
          c.contract.vendors?.ict_provider === null ||
          c.contract.vendors?.ict_provider === false,
      );

    // Filter by tab
    let filtered = contracts;
    if (hasIctProviders) {
      if (activeTab === 'ict') {
        filtered = contracts.filter(
          (c) => c.contract.vendors?.ict_provider === true,
        );
      } else if (activeTab === 'other') {
        filtered = contracts.filter(
          (c) =>
            c.contract.vendors?.ict_provider === false ||
            c.contract.vendors?.ict_provider === null,
        );
      }
    }

    return {
      contracts: filtered,
      context: { hasIctProviders, allVendorsIctProviderNull },
      metadata: { hasIctProviders, allVendorsIctProviderNull },
    };
  },

  transform: (contracts) => contracts.map(buildDoraReportRow),

  metadata: {
    defaultSortColumn: 'doraScoreValue',
    defaultSortDirection: 'asc',
    // Dora report excludes invoices; only the Invoice Discrepancy report keeps them.
    includeInvoices: false,
  },
};
