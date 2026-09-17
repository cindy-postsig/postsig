import {
  getFieldValue,
  getFieldDefinition,
} from '@/app/ui/contracts/contractFieldConfigs';
import { getHierarchyOrder } from '@/lib/utils/hierarchyOrder';
import { findContractInHierarchy } from './hierarchyUtils';

interface Contract {
  id: number;
  [key: string]: any;
}

interface AmendmentData {
  contractId: number;
  value: any;
  isOriginal: boolean;
  relationship: 'current' | 'parent' | 'child'; // Add relationship context
}

interface ChainAmendmentData extends AmendmentData {
  contractType?: string;
  termStartDate?: string;
  localAmendmentId?: string;
  chainPosition: 'parent' | 'current' | 'child'; // Position in the amendment chain
}

interface CompleteAmendmentResult {
  fieldKey: string;
  hasAmendmentChain: boolean;
  currentValue: any;
  amendmentChain: ChainAmendmentData[]; // Complete parent -> current -> children chain
  currentContractId: number;
}

/**
 * Get all ancestor IDs from root to the target contract (excluding the target itself)
 * @export For use in components that need to determine contract relationships
 */
export function getAncestorIds(
  hierarchy: any | null,
  targetId: number,
  ancestors: number[] = [],
): number[] | null {
  if (!hierarchy) return null;

  // Found the target - return the ancestors we've collected
  if (hierarchy.id === targetId) {
    return ancestors;
  }

  // Search in children
  if (hierarchy.children) {
    for (const child of hierarchy.children) {
      const result = getAncestorIds(child, targetId, [
        ...ancestors,
        hierarchy.id,
      ]);
      if (result !== null) {
        return result;
      }
    }
  }

  return null;
}

/**
 * Determine the relationship of a contract to another contract in the hierarchy
 * @param contractId The ID of the contract to check
 * @param currentId The ID of the current/reference contract
 * @param hierarchy The complete hierarchy tree
 * @returns 'current' if same contract, 'parent' if ancestor, 'child' if descendant
 * @export For use in components that need to determine contract relationships
 */
export function getRelationship(
  contractId: number,
  currentId: number,
  hierarchy: any | null,
): 'current' | 'parent' | 'child' {
  if (contractId === currentId) return 'current';

  if (!hierarchy) return 'parent'; // fallback

  // Check if contractId is an ancestor (parent) of currentId
  const ancestors = getAncestorIds(hierarchy, currentId);
  if (ancestors && ancestors.includes(contractId)) {
    return 'parent';
  }

  // Otherwise it's a descendant (child)
  return 'child';
}

/**
 * Get all descendant IDs from a contract node (including the contract itself)
 */
function getDescendantIds(contractNode: any): number[] {
  if (!contractNode) return [];

  const descendants: number[] = [contractNode.id];

  if (contractNode.children) {
    for (const child of contractNode.children) {
      descendants.push(...getDescendantIds(child));
    }
  }

  return descendants;
}

/**
 * Get all contract IDs in the direct lineage of a contract
 * This includes: ancestors (path from root to current) + current + descendants
 * Excludes: siblings, cousins, and other branches
 *
 * @export For use in components that need to filter contracts to direct lineage
 */
export function getDirectLineageIds(
  hierarchy: any | null,
  contractId: number,
): Set<number> {
  const lineageIds = new Set<number>();

  if (!hierarchy) return lineageIds;

  // Get ancestors (root -> parent chain)
  const ancestors = getAncestorIds(hierarchy, contractId);
  if (ancestors) {
    ancestors.forEach((id) => lineageIds.add(id));
  }

  // Add current contract
  lineageIds.add(contractId);

  // Get descendants (all children recursively)
  const contractNode = findContractInHierarchy(hierarchy, contractId);
  if (contractNode) {
    const descendants = getDescendantIds(contractNode);
    descendants.forEach((id) => lineageIds.add(id));
  }

  return lineageIds;
}

/**
 * Check if a value is meaningful (not null, undefined, empty string, or "N/A")
 */
function hasMeaningfulValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      trimmed === '' ||
      trimmed.toLowerCase() === 'n/a' ||
      trimmed === 'NO_DATA'
    )
      return false;
  }
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Compare two field values with improved type handling
 */
function areValuesEqual(value1: any, value2: any): boolean {
  // Handle null/undefined cases
  if (value1 === value2) return true;
  if (!value1 || !value2) return false;

  // Handle arrays (like date arrays)
  if (Array.isArray(value1) && Array.isArray(value2)) {
    if (value1.length !== value2.length) return false;
    return value1.every((item, index) => {
      const otherItem = value2[index];
      // For date objects, compare the date field specifically
      if (item?.date && otherItem?.date) {
        return item.date === otherItem.date;
      }
      return areValuesEqual(item, otherItem);
    });
  }

  // Handle date objects
  if (value1?.date && value2?.date) {
    return value1.date === value2.date;
  }

  // Handle other objects with JSON comparison (fallback)
  if (typeof value1 === 'object' && typeof value2 === 'object') {
    try {
      return JSON.stringify(value1) === JSON.stringify(value2);
    } catch {
      return false;
    }
  }

  // Convert to string for final comparison (handles numbers, booleans, etc.)
  return String(value1) === String(value2);
}

/**
 * Build complete amendment chain including parent and child relationships (optimized)
 */
export function buildCompleteAmendmentChain(
  currentContract: Contract,
  fieldKey: string,
  completeHierarchy?: any,
  allContractsInHierarchy?: Contract[],
): CompleteAmendmentResult | null {
  const field = getFieldDefinition(fieldKey);
  if (!field) {
    return null;
  }

  const currentValue = getFieldValue(currentContract, field);
  if (!hasMeaningfulValue(currentValue)) {
    return null;
  }

  // Use allContractsInHierarchy as the source of truth for all contracts
  let contractsToCheck = allContractsInHierarchy?.length
    ? allContractsInHierarchy
    : [currentContract];

  // Filter to direct lineage if current contract is not the topmost parent
  if (completeHierarchy && currentContract.id !== completeHierarchy.id) {
    const lineageIds = getDirectLineageIds(
      completeHierarchy,
      currentContract.id,
    );
    contractsToCheck = contractsToCheck.filter((contract) =>
      lineageIds.has(contract.id),
    );
  }

  const amendmentChain: ChainAmendmentData[] = [];

  // Process contracts and build chain data
  contractsToCheck.forEach((contract) => {
    if (!contract) return;

    const contractValue = getFieldValue(contract, field);

    // Only include contracts with meaningful values
    if (!hasMeaningfulValue(contractValue)) return;

    // Include current contract or contracts with different values
    const includeInChain =
      contract.id === currentContract.id ||
      !areValuesEqual(currentValue, contractValue);
    if (!includeInChain) return;

    // Determine relationship based on hierarchy position
    const isCurrent = contract.id === currentContract.id;

    // Find positions in the hierarchy to determine parent/child relationships
    const currentIndex =
      allContractsInHierarchy?.findIndex((c) => c.id === currentContract.id) ??
      -1;
    const contractIndex =
      allContractsInHierarchy?.findIndex((c) => c.id === contract.id) ?? -1;

    // Contracts earlier in hierarchy are parents, later ones are children
    const isChild =
      contractIndex > currentIndex &&
      contractIndex !== -1 &&
      currentIndex !== -1;
    const chainPosition = isCurrent ? 'current' : isChild ? 'child' : 'parent';

    amendmentChain.push({
      contractId: contract.id,
      value: contractValue,
      isOriginal: chainPosition === 'parent',
      relationship: isCurrent ? 'current' : isChild ? 'child' : 'parent',
      chainPosition,
      contractType: contract.contract_types?.name,
      termStartDate: contract.term_start_date?.[0]?.date,
      localAmendmentId: contract.localId,
    });
  });

  // Sort by hierarchy order to match sidebar and other components
  if (completeHierarchy) {
    const hierarchyOrder = getHierarchyOrder(completeHierarchy);
    amendmentChain.sort((a, b) => {
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
      return a.contractId - b.contractId;
    });
  } else {
    // Fallback to contract ID order when no hierarchy available
    amendmentChain.sort((a, b) => a.contractId - b.contractId);
  }

  return {
    fieldKey,
    hasAmendmentChain: amendmentChain.length > 1,
    currentValue,
    amendmentChain,
    currentContractId: currentContract.id,
  };
}
