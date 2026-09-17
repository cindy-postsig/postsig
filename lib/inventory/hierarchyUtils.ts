/**
 * Inventory Hierarchy Utilities
 *
 * Minimal utilities for handling contract hierarchies in inventory context.
 * Used to merge product pricing from amendment chains while preserving parent metadata.
 *
 * ## Why a Separate File from lib/amendments/hierarchyUtils.ts?
 *
 * While both files work with contract hierarchies, they serve different purposes:
 *
 * **lib/amendments/hierarchyUtils.ts:**
 * - Data structure: Recursive tree (`ContractHierarchy` with `children` arrays)
 * - Use case: Building full hierarchies for UI display (amendment sidebar, visualizations)
 * - Operations: Tree traversal, finding nodes, filtering by access
 *
 * **lib/inventory/hierarchyUtils.ts (this file):**
 * - Data structure: Flat parent/child maps (`Map<number, number[]>`)
 * - Use case: Quick lookups for product pricing merging in inventory
 * - Operations: Finding topmost parent, finding deepest child, checking relationships
 *
 * The different data structures optimize for their respective use cases:
 * - Trees are better for display and complex traversal
 * - Flat maps are better for quick parent/child lookups during data processing
 */

import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';
import logger from '@/utils/pino';

/**
 * Helper to extract product ID from vendor_products_details entry
 * Handles both joined (vp.vendor_products.id) and unjoined (vp.product_id) shapes
 */
function getProductId(vp: any): number | undefined {
  return vp.vendor_products?.id ?? vp.product_id;
}

/**
 * Extract the latest term start date from a contract for comparison.
 * Returns empty string if no date, so contracts without dates sort first.
 */
function getTermStartDate(contract: any): string {
  const dates = contract.term_start_date;
  if (!Array.isArray(dates) || dates.length === 0) return '';
  return dates[0]?.date || '';
}

export interface ContractRelationship {
  parent_contract_id: number | null;
  child_contract_id: number | null;
  relationship_type?: string | null;
}

/** A hierarchy edge whose endpoints are both loaded — no null narrowing needed. */
interface ResolvedEdge {
  parentId: number;
  childId: number;
}

export interface HierarchyMap {
  children: Map<number, number[]>; // parentId -> childIds[]
  parents: Map<number, number>; // childId -> parentId
}

/**
 * Builds a hierarchy map from contract relationships
 *
 * Performance: Uses batched relationships fetched once for entire org to avoid N+1 queries.
 * Since only ~5% of contracts have relationships, this is highly efficient.
 *
 * @param contracts - Array of contracts
 * @param allRelationships - Pre-fetched relationships for the organization (batched)
 * @returns Hierarchy map with parent/child lookups
 */
export function buildContractHierarchyMap(
  contracts: any[],
  allRelationships: any[] = [],
): HierarchyMap {
  const children = new Map<number, number[]>();
  const parents = new Map<number, number>();

  // Build contract ID set for filtering (only process relationships for loaded contracts)
  const contractIds = new Set(contracts.map((c) => c.id));

  // Keep only hierarchy edges that involve loaded contracts, in a total order.
  //
  // `isHierarchyEdge` is what keeps billing edges out of the tree: this map is
  // the input to every topmost-parent walk, and fetchAllRelationshipsForOrg
  // selects '*' with no type filter, so an untyped read would let a billing
  // parent become a child's structural parent.
  //
  // The sort matters because the `parents` map below is first-edge-wins and the
  // fetch issues no ORDER BY — without it a child with two parents could
  // resolve differently request to request. Same (parent, child) ascending
  // treatment as `orderedEdges` in lib/v2/spend/members.ts, and the same
  // narrow-then-sort shape so the ordering needs no non-null assertions.
  const orderedEdges: ResolvedEdge[] = [];
  for (const rel of allRelationships as ContractRelationship[]) {
    if (!isHierarchyEdge(rel)) continue;

    const parentId = rel.parent_contract_id;
    const childId = rel.child_contract_id;
    if (parentId === null || childId === null) continue;
    if (!contractIds.has(parentId) || !contractIds.has(childId)) continue;

    orderedEdges.push({ parentId, childId });
  }
  orderedEdges.sort((a, b) => a.parentId - b.parentId || a.childId - b.childId);

  orderedEdges.forEach(({ parentId, childId }) => {
    // Add to children map
    if (!children.has(parentId)) {
      children.set(parentId, []);
    }
    if (!children.get(parentId)!.includes(childId)) {
      children.get(parentId)!.push(childId);
    }

    // Add to parents map
    if (!parents.has(childId)) {
      parents.set(childId, parentId);
    }
  });

  return { children, parents };
}

/**
 * Builds a hierarchy map spanning every edge endpoint in an org's relationship
 * set, rather than a caller's contract array.
 *
 * Callers that filter their contracts (archived, draft, report scope) would
 * otherwise drop the edge to a parent that is missing from the array, and a
 * child invoice whose parent was filtered out reads as a root — double-counted
 * against the parent that already carries its amount.
 */
export function buildOrgHierarchyMap(
  relationships: ContractRelationship[],
): HierarchyMap {
  const edgeContractIds = new Set<number>();
  for (const rel of relationships) {
    if (rel.parent_contract_id !== null) {
      edgeContractIds.add(rel.parent_contract_id);
    }
    if (rel.child_contract_id !== null) {
      edgeContractIds.add(rel.child_contract_id);
    }
  }

  return buildContractHierarchyMap(
    [...edgeContractIds].map((id) => ({ id })),
    relationships,
  );
}

/**
 * Finds the deepest child contract that contains a specific product ID
 * with pricing that applies to the given year (amendment year <= target year).
 *
 * Amendment pricing overrides all future years from the amendment's effective year.
 * E.g., Amendment Year 1 pricing applies to Parent Year 1, 2, 3, etc.
 *
 * Traverses the hierarchy tree depth-first to find the most recent amendment.
 */
export function findDeepestChildForProduct(
  contractId: number,
  productId: number,
  year: number,
  hierarchyMap: HierarchyMap,
  allContracts: Map<number, any>,
  visited: Set<number> = new Set(),
): { contract: any; depth: number; productYear: number } | null {
  // Cycle detection
  if (visited.has(contractId)) {
    throw new Error(
      `Cycle detected in child hierarchy at contract ID ${contractId}`,
    );
  }
  visited.add(contractId);

  const contract = allContracts.get(contractId);
  if (!contract) return null;

  // Find the highest year product that applies to this year (product_year <= year)
  // E.g., if looking for Year 3, prefer Year 2 over Year 1 (most specific)
  const applicableProducts =
    contract.vendor_products_details?.filter((vp: any) => {
      const id = getProductId(vp);
      return id === productId && (vp.year || 1) <= year;
    }) || [];

  const hasProduct = applicableProducts.length > 0;

  // Get the highest year that's still <= target year (most specific pricing)
  const productYear = hasProduct
    ? Math.max(...applicableProducts.map((vp: any) => vp.year || 1))
    : 0;

  const children = hierarchyMap.children.get(contractId) || [];

  if (children.length === 0) {
    // Leaf node - return if it has applicable product
    return hasProduct ? { contract, depth: 0, productYear } : null;
  }

  // Recursively check children
  let deepestChild: {
    contract: any;
    depth: number;
    productYear: number;
  } | null = null;

  for (const childId of children) {
    const childResult = findDeepestChildForProduct(
      childId,
      productId,
      year,
      hierarchyMap,
      allContracts,
      visited,
    );

    if (childResult) {
      const newDepth = childResult.depth + 1;
      // Prefer deeper contracts, or if same depth, prefer higher product year (more specific)
      if (
        !deepestChild ||
        newDepth > deepestChild.depth ||
        (newDepth === deepestChild.depth &&
          childResult.productYear > deepestChild.productYear)
      ) {
        deepestChild = {
          contract: childResult.contract,
          depth: newDepth,
          productYear: childResult.productYear,
        };
      }
    }
  }

  // If we found a deeper child with the product, return it
  // Otherwise, return current contract if it has the product
  if (deepestChild) {
    return deepestChild;
  }

  return hasProduct ? { contract, depth: 0, productYear } : null;
}

/**
 * Determines if a contract should be filtered out because it's a child
 * (not a topmost parent in its hierarchy)
 */
export function shouldFilterContract(
  contractId: number,
  hierarchyMap: HierarchyMap,
): boolean {
  // If the contract has a parent, it should be filtered out
  return hierarchyMap.parents.has(contractId);
}

/**
 * Finds the topmost parent for a contract
 */
export function findTopmostParent(
  contractId: number,
  hierarchyMap: HierarchyMap,
): number {
  let currentId = contractId;
  const visited = new Set<number>();

  // Traverse up the hierarchy until we find a contract with no parent
  while (hierarchyMap.parents.has(currentId)) {
    // Cycle detection
    if (visited.has(currentId)) {
      throw new Error(
        `Cycle detected in parent chain at contract ID ${currentId}`,
      );
    }
    visited.add(currentId);

    currentId = hierarchyMap.parents.get(currentId)!;
  }

  return currentId;
}

/**
 * Gets all contracts in a lineage (ancestors + current + descendants)
 *
 * @deprecated This function returns the entire family tree (~60% more contracts than needed).
 * For most use cases, use `getDirectLineageIds` from '@/lib/amendments/amendmentService'
 * instead, which only returns the direct lineage without siblings/cousins.
 *
 * This function is kept for backward compatibility but should not be used in new code.
 *
 * @see {@link getDirectLineageIds} in /lib/amendments/amendmentService.ts
 */
export function getLineageIds(
  contractId: number,
  hierarchyMap: HierarchyMap,
): Set<number> {
  logger.warn(
    { contractId },
    'getLineageIds is deprecated - consider using getDirectLineageIds from amendmentService instead',
  );

  const lineageIds = new Set<number>();
  const visitedDescendants = new Set<number>();

  // Get topmost parent
  const topmostParentId = findTopmostParent(contractId, hierarchyMap);
  lineageIds.add(topmostParentId);

  // Recursively add all descendants
  function addDescendants(id: number) {
    // Cycle detection
    if (visitedDescendants.has(id)) {
      throw new Error(`Cycle detected in child hierarchy at contract ID ${id}`);
    }
    visitedDescendants.add(id);

    const children = hierarchyMap.children.get(id) || [];
    children.forEach((childId) => {
      lineageIds.add(childId);
      addDescendants(childId);
    });
  }

  addDescendants(topmostParentId);

  return lineageIds;
}

/**
 * Walks up the hierarchy to find the topmost parent that has a specific product
 * Returns null if no parent has this product (meaning it's unique to the child)
 */
export function findTopmostParentWithProduct(
  contractId: number,
  productId: number,
  hierarchyMap: HierarchyMap,
  allContracts: Map<number, any>,
): any | null {
  // Get all ancestors (walk up the tree)
  const ancestors = [];
  let currentId = contractId;
  const visited = new Set<number>();

  while (hierarchyMap.parents.has(currentId)) {
    // Cycle detection
    if (visited.has(currentId)) {
      throw new Error(
        `Cycle detected in parent chain at contract ID ${currentId}`,
      );
    }
    visited.add(currentId);

    currentId = hierarchyMap.parents.get(currentId)!;
    ancestors.push(currentId);
  }

  // Check from topmost ancestor down to find first one with this product
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = allContracts.get(ancestors[i]);
    const hasProduct = ancestor?.vendor_products_details?.some(
      (vp: any) => getProductId(vp) === productId,
    );

    if (hasProduct) {
      return ancestor; // Found topmost parent with this product
    }
  }

  return null; // No parent has this product - it's unique to child
}

/**
 * Finds the deepest child contract that contains a specific product
 * Simplified version without year matching - child always supersedes parent
 * Returns both the contract and its depth for proper comparison
 */
export function findDeepestChildWithProduct(
  contractId: number,
  productId: number,
  hierarchyMap: HierarchyMap,
  allContracts: Map<number, any>,
  visited: Set<number> = new Set(),
): { contract: any; depth: number } | null {
  // Cycle detection
  if (visited.has(contractId)) {
    throw new Error(
      `Cycle detected in child hierarchy at contract ID ${contractId}`,
    );
  }
  visited.add(contractId);

  const contract = allContracts.get(contractId);
  if (!contract) return null;

  const hasProduct = contract.vendor_products_details?.some(
    (vp: any) => getProductId(vp) === productId,
  );

  const children = hierarchyMap.children.get(contractId) || [];

  if (children.length === 0) {
    // Leaf node - return if it has the product
    return hasProduct ? { contract, depth: 0 } : null;
  }

  // Recursively check children
  let deepestChild: { contract: any; depth: number } | null = null;

  for (const childId of children) {
    const childResult = findDeepestChildWithProduct(
      childId,
      productId,
      hierarchyMap,
      allContracts,
      visited,
    );

    if (childResult) {
      const newDepth = childResult.depth + 1;
      // Sibling amendments at the same depth: latest start date wins
      const isBetter =
        !deepestChild ||
        newDepth > deepestChild.depth ||
        (newDepth === deepestChild.depth &&
          getTermStartDate(childResult.contract) >
            getTermStartDate(deepestChild.contract));
      if (isBetter) {
        deepestChild = {
          contract: childResult.contract,
          depth: newDepth,
        };
      }
    }
  }

  // If we found a deeper child with the product, return it
  // Otherwise, return current contract if it has the product
  if (deepestChild) {
    return deepestChild;
  }

  return hasProduct ? { contract, depth: 0 } : null;
}
