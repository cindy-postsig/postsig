/**
 * Product-aware lineage utilities
 * Optimized for product comparison by filtering contracts that have the product
 */

import {
  ContractHierarchy,
  findContractInHierarchy,
} from '@/lib/amendments/hierarchyUtils';

/**
 * Gets direct lineage contracts that contain a specific product
 * More efficient than getting all lineage then filtering
 *
 * Note: The center contract (contractId) is always included in the result,
 * regardless of whether it has the product.
 */
export function getDirectLineageWithProduct(
  hierarchy: ContractHierarchy | null,
  contractId: number,
  productId: number,
  allContracts: Map<number, any>,
): number[] {
  if (!hierarchy) return [];

  // Helper: check if contract has product
  // Check both allContracts map AND hierarchy data (for contracts not in filtered results)
  const hasProduct = (cId: number): boolean => {
    // First try the contracts map
    const contract = allContracts.get(cId);
    if (contract) {
      // Check both vendor_products.id (when joined) and product_id (when not joined)
      // This handles different query shapes consistently
      return (
        contract.vendor_products_details?.some(
          (vp: any) => (vp.vendor_products?.id ?? vp.product_id) === productId,
        ) ?? false
      );
    }

    // If not in map, check hierarchy data
    const hierarchyNode = findContractInHierarchy(hierarchy, cId);
    if (hierarchyNode?.vendor_products_details) {
      return hierarchyNode.vendor_products_details.some(
        (vp: any) => (vp.vendor_products?.id || vp.product_id) === productId,
      );
    }

    return false;
  };

  // Get ancestors with product (walk up)
  const ancestors: number[] = [];
  let current: ContractHierarchy | null = findContractInHierarchy(
    hierarchy,
    contractId,
  );

  while (current?.parent) {
    if (hasProduct(current.parent.id)) {
      ancestors.unshift(current.parent.id); // Add to front (oldest first)
    }
    current = current.parent;
  }

  // Get descendants with product (walk down)
  const descendants: number[] = [];
  const contractNode = findContractInHierarchy(hierarchy, contractId);

  function traverseDescendants(node: ContractHierarchy) {
    if (!node.children) return;

    for (const child of node.children) {
      if (hasProduct(child.id)) {
        descendants.push(child.id);
      }
      // Always traverse deeper to find products in deeper levels
      traverseDescendants(child);
    }
  }

  if (contractNode) {
    traverseDescendants(contractNode);
  }

  return [...ancestors, contractId, ...descendants];
}

/**
 * Gets contracts in lineage that share ANY products with target contract
 * Useful for finding all potentially related contracts
 */
export function getDirectLineageWithSharedProducts(
  hierarchy: ContractHierarchy | null,
  contractId: number,
  allContracts: Map<number, any>,
): number[] {
  if (!hierarchy) return [];

  const targetContract = allContracts.get(contractId);
  if (!targetContract) return [];

  // Helper to extract product ID from vendor_product_detail
  const getProductId = (vp: any): number | undefined =>
    vp.vendor_products?.id ?? vp.product_id;

  // Build product ID set from both vendor_products.id (when joined) and product_id (when not joined)
  // This handles different query shapes consistently
  const targetProductIds = new Set(
    (targetContract.vendor_products_details || [])
      .map(getProductId)
      .filter((id: number | undefined): id is number => id != null),
  );

  if (targetProductIds.size === 0) return [];

  // Helper: check if contract shares any products
  // Check both allContracts map AND hierarchy data (for contracts not in filtered results)
  const hasSharedProducts = (cId: number): boolean => {
    // First try the contracts map
    const contract = allContracts.get(cId);
    if (contract) {
      return (
        contract.vendor_products_details?.some((vp: any) =>
          targetProductIds.has(getProductId(vp)),
        ) ?? false
      );
    }

    // If not in map, check hierarchy data
    const hierarchyNode = findContractInHierarchy(hierarchy, cId);
    if (hierarchyNode?.vendor_products_details) {
      return hierarchyNode.vendor_products_details.some((vp: any) =>
        targetProductIds.has(getProductId(vp)),
      );
    }

    return false;
  };

  // Walk up ancestors
  let current: ContractHierarchy | null = findContractInHierarchy(
    hierarchy,
    contractId,
  );
  const ancestors: number[] = [];

  while (current?.parent) {
    if (hasSharedProducts(current.parent.id)) {
      ancestors.unshift(current.parent.id);
    }
    current = current.parent;
  }

  // Walk down descendants
  const descendants: number[] = [];
  const contractNode = findContractInHierarchy(hierarchy, contractId);

  function traverseDescendants(node: ContractHierarchy) {
    if (!node.children) return;

    for (const child of node.children) {
      if (hasSharedProducts(child.id)) {
        descendants.push(child.id);
      }
      traverseDescendants(child);
    }
  }

  if (contractNode) {
    traverseDescendants(contractNode);
  }

  return [...ancestors, contractId, ...descendants];
}
