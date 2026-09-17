import { useMemo } from 'react';
import { getDirectLineageIds } from '@/lib/amendments/amendmentService';

/**
 * Filters hierarchy product data to only include contracts in the direct lineage
 * (ancestors + current + descendants, excluding siblings/cousins)
 *
 * @param hierarchyProductsData - All products data from HierarchyContext
 * @param currentContractId - The ID of the current contract being viewed
 * @param completeHierarchy - The complete hierarchy tree
 * @returns Filtered product data for direct lineage only
 */
export function useFilteredLineageData<T extends { contractId: number }>(
  hierarchyProductsData: T[],
  currentContractId: number | undefined,
  completeHierarchy: any | null,
): T[] {
  return useMemo(() => {
    // No filtering if missing required data
    if (!currentContractId || !completeHierarchy) {
      return hierarchyProductsData;
    }

    // If viewing topmost parent, show all contracts (no filtering)
    if (currentContractId === completeHierarchy.id) {
      return hierarchyProductsData;
    }

    // Get direct lineage IDs (ancestors + current + descendants)
    const lineageIds = getDirectLineageIds(
      completeHierarchy,
      currentContractId,
    );

    // Filter to only contracts in direct lineage
    return hierarchyProductsData.filter((item) =>
      lineageIds.has(item.contractId),
    );
  }, [hierarchyProductsData, currentContractId, completeHierarchy]);
}
