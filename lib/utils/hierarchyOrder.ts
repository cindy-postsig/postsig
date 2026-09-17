/**
 * Utility functions for extracting contract hierarchy order
 * Used to maintain consistent ordering between sidebar and amendment accordions
 */

interface HierarchyContract {
  id: string | number;
  children?: HierarchyContract[];
}

/**
 * Extract contract IDs in hierarchy order using depth-first traversal
 * This matches exactly how the ContractSidebar renders contracts
 */
export function getHierarchyOrder(
  hierarchy: HierarchyContract | null,
): (string | number)[] {
  const order: (string | number)[] = [];

  function traverse(contract: HierarchyContract | null): void {
    if (!contract) return;

    order.push(contract.id);

    if (contract.children) {
      contract.children.forEach((child) => traverse(child));
    }
  }

  traverse(hierarchy);
  return order;
}

/**
 * Sort an array of contracts by hierarchy order
 */
export function sortByHierarchyOrder<T extends { contractId: string | number }>(
  contracts: T[],
  hierarchy: HierarchyContract | null,
): T[] {
  if (!hierarchy) {
    // Fallback to contract ID sorting if no hierarchy
    return contracts.slice().sort((a, b) => {
      const aNum =
        typeof a.contractId === 'string'
          ? parseInt(a.contractId)
          : a.contractId;
      const bNum =
        typeof b.contractId === 'string'
          ? parseInt(b.contractId)
          : b.contractId;
      return aNum - bNum;
    });
  }

  const hierarchyOrder = getHierarchyOrder(hierarchy);

  return contracts.slice().sort((a, b) => {
    const aIndex = hierarchyOrder.indexOf(a.contractId);
    const bIndex = hierarchyOrder.indexOf(b.contractId);

    // If both contracts are in hierarchy, use hierarchy order
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    // If only one is in hierarchy, prioritize it
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    // Fallback to contract ID order
    const aNum =
      typeof a.contractId === 'string' ? parseInt(a.contractId) : a.contractId;
    const bNum =
      typeof b.contractId === 'string' ? parseInt(b.contractId) : b.contractId;
    return aNum - bNum;
  });
}
