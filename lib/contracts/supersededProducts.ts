/**
 * Superseded Products Processing Utility
 *
 * Processes contract hierarchies to identify superseded products across amendment chains.
 * A product is "superseded" when a later amendment in the direct lineage has the same
 * product with a different price, making the earlier price obsolete.
 *
 * This utility orchestrates existing functions to avoid code duplication:
 * - buildHierarchyProductsData: Extracted from HierarchyContext
 * - createProductComparison: From productComparisonUtils
 * - getDirectLineageWithSharedProducts: From productLineageUtils
 */

import { getDirectLineageWithSharedProducts } from '@/lib/amendments/productLineageUtils';
import { createProductComparison } from '@/components/contracts/amendments/productComparisonUtils';
import { buildHierarchyProductsData } from '@/lib/contracts/hierarchyProductsData';
import { buildHierarchyMapFromRelationships } from '@/lib/amendments/hierarchyUtils';
import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';
import { fetchContractsById } from '@/app/lib/contracts/actions';
import logger from '@/utils/pino';

/**
 * Processes contract hierarchies to identify superseded products.
 * Adds supersededProducts Set to each contract object.
 *
 * EFFICIENT APPROACH:
 * - Fetches all relationships once if not provided
 * - Only processes contracts in direct lineage (not entire family tree)
 * - Only processes contracts that share products
 * - Reuses existing tested utilities
 * - All hierarchy building is done in-memory (no N+1 queries)
 *
 * @param contracts - Array of contracts with relationship data
 * @param fiscalYearStartMonth - Fiscal year start month for product processing
 * @param preloadedRelationships - Optional pre-fetched contract_relationships data for efficiency
 * @returns Enhanced contracts with supersededProducts field
 */
export async function processContractHierarchies(
  contracts: any[],
  fiscalYearStartMonth: number = 1,
  preloadedRelationships?: any[],
): Promise<any[]> {
  if (!contracts || contracts.length === 0) return [];

  const contractsMap = new Map(contracts.map((c) => [c.id, c]));

  // Track which contracts we've already processed to avoid duplicates
  const processedContracts = new Set<number>();
  const contractSupersededMap = new Map<number, Set<string>>();

  // Auto-fetch relationships if not provided
  let allRelationships = preloadedRelationships;

  if (!allRelationships || allRelationships.length === 0) {
    // Extract organization ID from first contract
    const firstContract = contracts[0];
    const organizationId =
      firstContract?.users?.organizations?.id ||
      firstContract?.users?.organization;

    if (organizationId) {
      const { fetchAllRelationshipsForOrg } =
        await import('@/data/superuser/contracts');
      allRelationships = await fetchAllRelationshipsForOrg(organizationId);

      logger.info(
        {
          organizationId,
          relationshipCount: allRelationships.length,
          contractCount: contracts.length,
        },
        'Auto-fetched relationships for hierarchy processing',
      );
    } else {
      // No organization ID found, no relationships to fetch
      allRelationships = [];
    }
  }

  // Ensure ancestors and descendants needed for hierarchy exist in our dataset
  let contractsMapArray = contracts.slice();
  if (allRelationships && allRelationships.length > 0) {
    const providedIds = new Set(contractsMapArray.map((c) => c.id));
    const parentByChild = new Map<number, number>();
    const childrenByParent = new Map<number, number[]>();

    // Hierarchy edges only: a 'billing' edge is an invoice's additional payer,
    // not a lineage link, so following it would pull an unrelated chain's
    // contracts into this dataset and let their products be compared as if
    // they superseded each other.
    allRelationships.filter(isHierarchyEdge).forEach((rel) => {
      parentByChild.set(rel.child_contract_id, rel.parent_contract_id);
      if (!childrenByParent.has(rel.parent_contract_id)) {
        childrenByParent.set(rel.parent_contract_id, []);
      }
      childrenByParent.get(rel.parent_contract_id)!.push(rel.child_contract_id);
    });

    const missingIds = new Set<number>();

    // Collect missing ancestors (walk up)
    providedIds.forEach((id) => {
      let curr = id;
      const seen = new Set<number>();
      while (parentByChild.has(curr) && !seen.has(curr)) {
        seen.add(curr);
        const parentId = parentByChild.get(curr)!;
        if (!providedIds.has(parentId)) missingIds.add(parentId);
        curr = parentId;
      }
    });

    // Collect missing descendants (walk down)
    const walkDescendants = (id: number) => {
      const children = childrenByParent.get(id) || [];
      children.forEach((childId) => {
        if (!providedIds.has(childId)) {
          missingIds.add(childId);
        }
        walkDescendants(childId);
      });
    };

    providedIds.forEach((id) => walkDescendants(id));

    if (missingIds.size > 0) {
      const missingContracts = await fetchContractsById({
        ids: Array.from(missingIds),
      });
      if (Array.isArray(missingContracts) && missingContracts.length > 0) {
        contractsMapArray = contractsMapArray.concat(
          missingContracts.filter(Boolean),
        );
        missingContracts.forEach((c: any) => contractsMap.set(c.id, c));
      }
    }
  }

  // Build complete hierarchy map from enriched dataset
  const hierarchyMapCache = buildHierarchyMapFromRelationships(
    contractsMapArray,
    allRelationships,
  );

  // Process each contract
  for (const contract of contracts) {
    if (processedContracts.has(contract.id)) continue;

    // Get complete hierarchy for this contract from in-memory cache
    // Since we pre-fetched all ancestors, every contract should have its complete hierarchy available
    const completeHierarchy: any | null = hierarchyMapCache.get(contract.id);

    if (!completeHierarchy) {
      // No hierarchy - contract has no amendments
      contractSupersededMap.set(contract.id, new Set());
      processedContracts.add(contract.id);
      continue;
    }

    // Get only contracts in direct lineage that share products with current contract
    // This is much more efficient than processing entire family tree
    const relevantContractIds = getDirectLineageWithSharedProducts(
      completeHierarchy,
      contract.id,
      contractsMap,
    );

    // Mark all as processed to avoid redundant work
    relevantContractIds.forEach((id) => processedContracts.add(id));

    // Build hierarchyProductsData for this lineage using extracted utility
    const lineageContracts = relevantContractIds
      .map((id) => contractsMap.get(id))
      .filter(Boolean) as any[];

    const hierarchyProductsData = buildHierarchyProductsData(
      lineageContracts,
      fiscalYearStartMonth,
      completeHierarchy,
    );

    // For each contract in lineage, call createProductComparison
    relevantContractIds.forEach((contractId) => {
      const comparisonData = createProductComparison(
        contractId,
        hierarchyProductsData,
        completeHierarchy.id, // topmost parent
      );

      contractSupersededMap.set(
        contractId,
        comparisonData.supersededProducts as Set<string>,
      );
    });
  }

  // Enhance contracts with superseded data
  // Convert Sets to Arrays to survive serialization across Server/Client boundary
  return contracts.map((contract) => ({
    ...contract,
    supersededProducts: Array.from(
      contractSupersededMap.get(contract.id) || new Set(),
    ),
  }));
}
