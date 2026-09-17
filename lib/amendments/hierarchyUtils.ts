/**
 * Utility functions for working with contract hierarchies
 * These are pure functions that can be used in both client and server components
 */

import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';

export interface ContractHierarchy {
  id: number;
  children?: ContractHierarchy[];
  [key: string]: any;
}

/**
 * Generate short label from contract type name (same logic as ContractLabel.tsx)
 */
export function generateShortLabel(name: string | undefined): string {
  if (!name) return 'UNK';

  const words = name.split(' ');
  return words.length === 1
    ? words[0].substring(0, 3).toUpperCase()
    : words
        .map((word) => word[0])
        .join('')
        .toUpperCase();
}

/**
 * Check if a contract has any children in the hierarchy
 */
export function hasChildContracts(
  hierarchy: ContractHierarchy | null,
): boolean {
  return !!(hierarchy?.children && hierarchy.children.length > 0);
}

/**
 * Find a specific contract in the hierarchy by ID
 */
export function findContractInHierarchy(
  hierarchy: ContractHierarchy | null,
  contractId: number,
): ContractHierarchy | null {
  if (!hierarchy) return null;
  if (hierarchy.id === contractId) return hierarchy;

  if (hierarchy.children) {
    for (const child of hierarchy.children) {
      const found = findContractInHierarchy(child, contractId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Find the parent of a specific contract in the hierarchy
 */
export function findParentInHierarchy(
  hierarchy: ContractHierarchy | null,
  contractId: number,
): ContractHierarchy | null {
  if (!hierarchy) return null;

  // Check if any of the direct children match the contract we're looking for
  if (hierarchy.children) {
    for (const child of hierarchy.children) {
      if (child.id === contractId) {
        return hierarchy; // This hierarchy node is the parent
      }

      // Recursively search in the child's subtree
      const found = findParentInHierarchy(child, contractId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Recursively collect all contract IDs from a hierarchy tree into a Set
 */
export function collectAllIdsFromHierarchy(
  node: ContractHierarchy,
  allIds: Set<number>,
): void {
  allIds.add(node.id);
  if (node.children) {
    node.children.forEach((child) => collectAllIdsFromHierarchy(child, allIds));
  }
}

/**
 * Extract all child contract IDs from hierarchy (recursive - gets all descendants)
 */
export function extractAllChildContractIds(
  hierarchy: ContractHierarchy | null,
): number[] {
  if (!hierarchy || !hierarchy.children) {
    return [];
  }

  const childIds: number[] = [];

  hierarchy.children.forEach((child) => {
    childIds.push(child.id);
    // Recursively get grandchildren
    const grandChildIds = extractAllChildContractIds(child);
    childIds.push(...grandChildIds);
  });

  return childIds;
}

/**
 * Filter hierarchy to only include contracts the user has access to
 * Returns null if the root contract is not accessible
 */
export function filterHierarchyByAccessibleContracts(
  hierarchy: ContractHierarchy | null,
  accessibleContractIds: Set<number>,
): ContractHierarchy | null {
  if (!hierarchy) return null;

  // If root contract is not accessible, return null
  if (!accessibleContractIds.has(hierarchy.id)) {
    return null;
  }

  // Recursively filter children
  const filteredChildren = (hierarchy.children || [])
    .map((child) =>
      filterHierarchyByAccessibleContracts(child, accessibleContractIds),
    )
    .filter((child): child is ContractHierarchy => child !== null);

  return {
    ...hierarchy,
    children: filteredChildren,
  };
}

/**
 * Builds a complete hierarchy map from contract relationship data
 * This enables building hierarchies in-memory without additional database queries
 *
 * @param contracts - Array of contracts with their data
 * @param allRelationships - Array of contract_relationships records
 * @returns Map of contract ID to complete hierarchy node
 */
export function buildHierarchyMapFromRelationships(
  contracts: any[],
  allRelationships: any[],
): Map<number, ContractHierarchy> {
  const contractMap = new Map(contracts.map((c) => [c.id, c]));

  // Only hierarchy edges shape the tree. A 'billing' edge names an invoice's
  // additional payer, so walking it would list the invoice as a structural
  // child of a contract that does not own it — and, because a node is built
  // once and cached, place it under whichever parent was visited first.
  const hierarchyRelationships = allRelationships.filter(isHierarchyEdge);

  // Build parent->children map (deduplicate to handle duplicate relationship rows)
  const childrenByParent = new Map<number, number[]>();
  hierarchyRelationships.forEach((rel) => {
    if (!childrenByParent.has(rel.parent_contract_id)) {
      childrenByParent.set(rel.parent_contract_id, []);
    }
    const list = childrenByParent.get(rel.parent_contract_id)!;
    if (!list.includes(rel.child_contract_id)) {
      list.push(rel.child_contract_id);
    }
  });

  // Build child->parent map for quick parent lookups
  const parentByChild = new Map<number, number>();
  hierarchyRelationships.forEach((rel) => {
    parentByChild.set(rel.child_contract_id, rel.parent_contract_id);
  });

  // Cache for built hierarchy nodes
  const hierarchyCache = new Map<number, ContractHierarchy>();
  // Track nodes currently being built to detect cycles
  const building = new Set<number>();

  /**
   * Recursively builds a hierarchy node for a contract
   * Protects against cycles in relationship data
   */
  function buildHierarchyNode(contractId: number): ContractHierarchy | null {
    // Return cached node if already built
    if (hierarchyCache.has(contractId)) {
      return hierarchyCache.get(contractId)!;
    }

    // Detect cycle: if we're already building this node, we have a cycle
    if (building.has(contractId)) {
      throw new Error(
        `Cycle detected in contract relationships at contract ID ${contractId}`,
      );
    }

    const contract = contractMap.get(contractId);
    if (!contract) return null;

    // Mark this node as being built
    building.add(contractId);

    // Recursively build children
    const childIds = childrenByParent.get(contractId) || [];
    const children = childIds
      .map((childId) => buildHierarchyNode(childId))
      .filter((child): child is ContractHierarchy => child !== null);

    // Sort children by term_start_date chronologically (if available)
    const sortedChildren =
      children.length > 0
        ? children.sort((a, b) => {
            const aDate = a.term_start_date?.[0]?.date || '';
            const bDate = b.term_start_date?.[0]?.date || '';
            return aDate.localeCompare(bDate);
          })
        : undefined;

    const node: ContractHierarchy = {
      ...contract,
      id: contractId,
      children: sortedChildren,
    };

    // Attach parent reference to support upward walks through the full ancestor chain
    if (sortedChildren) {
      sortedChildren.forEach((child) => {
        (child as any).parent = node;
      });
    }

    // Remove from building set now that we're done
    building.delete(contractId);

    hierarchyCache.set(contractId, node);
    return node;
  }

  // Build hierarchy nodes for all contracts (handles both roots and mid-tree contracts)
  contracts.forEach((contract) => {
    buildHierarchyNode(contract.id);
  });

  return hierarchyCache;
}
