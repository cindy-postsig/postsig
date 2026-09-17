/**
 * DORA Report Data
 *
 * V2 data fetching and processing for the DORA report.
 */

import { getContractsList, EnrichedContract } from '@/lib/v2/contracts/service';
import { sumContractValuesInUSD } from '@/lib/v2/contracts/service';
import { buildDoraReportRow, DoraReportRow } from './transforms/dora';

interface DoraReportData {
  /** All active contracts (for tab counts) */
  allContracts: EnrichedContract[];
  /** Filtered contracts for current tab */
  filteredContracts: EnrichedContract[];
  /** Transformed rows for table */
  rows: DoraReportRow[];
  /** Total value in USD */
  totalValueInUSD: number;
  /** Whether any ICT providers have been set */
  hasIctProviders: boolean;
  /** Whether all vendors have null/false ICT provider */
  allVendorsIctProviderNull: boolean;
}

/**
 * Get DORA report data using V2 architecture.
 */
export async function getDoraReportData(
  activeTab: string = 'ict',
): Promise<DoraReportData> {
  // 1. FETCH - Get enriched contracts
  const { contracts } = await getContractsList();

  // 2. FILTER - Active contracts only, exclude linked child invoices
  const allContracts = contracts.filter(
    (c) => c.contract.status_id === 4 && !c.isLinkedChildInvoice,
  );

  // Check ICT provider status
  const hasIctProviders = allContracts.some(
    (c) => c.contract.vendors?.ict_provider === true,
  );

  const allVendorsIctProviderNull =
    allContracts.length > 0 &&
    allContracts.every(
      (c) =>
        c.contract.vendors?.ict_provider === null ||
        c.contract.vendors?.ict_provider === false,
    );

  // Filter by tab
  let filteredContracts = allContracts;
  if (hasIctProviders) {
    if (activeTab === 'ict') {
      filteredContracts = allContracts.filter(
        (c) => c.contract.vendors?.ict_provider === true,
      );
    } else if (activeTab === 'other') {
      filteredContracts = allContracts.filter(
        (c) =>
          c.contract.vendors?.ict_provider === false ||
          c.contract.vendors?.ict_provider === null,
      );
    }
  }

  // 3. Calculate total value (before transform, uses EnrichedContract)
  const totalValueInUSD = sumContractValuesInUSD(filteredContracts, 'total');

  // 4. TRANSFORM - Build report rows
  const rows = filteredContracts.map(buildDoraReportRow);

  return {
    allContracts,
    filteredContracts,
    rows,
    totalValueInUSD,
    hasIctProviders,
    allVendorsIctProviderNull,
  };
}
