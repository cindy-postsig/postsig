/**
 * Hierarchy Products Data Utilities
 *
 * Extracted from HierarchyContext to make the logic reusable across different contexts
 * (e.g., HierarchyContext for UI, superseded products processing for data enrichment)
 */

import {
  getCurrentTermProducts,
  hasFeeOverrides,
} from '@/lib/v2/products/transforms';
import { HierarchyProductsData } from '@/components/contracts/amendments/productComparisonUtils';
import { getHierarchyOrder } from '@/lib/utils/hierarchyOrder';
import { isInvoiceType } from '@/app/lib/constants';

/**
 * Builds hierarchyProductsData array from contracts
 * This is the same logic used in HierarchyContext, extracted for reusability
 *
 * @param contracts - Array of contracts with product details
 * @param fiscalYearStartMonth - Fiscal year start month for product processing
 * @param completeHierarchy - Optional hierarchy for sorting, if not provided uses contract ID order
 * @returns Array of HierarchyProductsData with products organized by year
 */
export function buildHierarchyProductsData(
  contracts: any[],
  fiscalYearStartMonth: number = 1,
  completeHierarchy?: any | null,
): HierarchyProductsData[] {
  if (!contracts || contracts.length === 0) {
    return [];
  }

  // Get hierarchy order if available for sorting
  const hierarchyOrder = completeHierarchy
    ? getHierarchyOrder(completeHierarchy)
    : [];

  const productsData = contracts
    .filter((contract) => {
      // Exclude invoices, but include all other contracts even if they have no products
      // This allows product changes to "bubble up" the lineage to parents without products
      const isInvoice = isInvoiceType(contract.type_id);
      return !isInvoice;
    })
    .map((contract) => {
      const hasProducts = contract.vendor_products_details?.length > 0;
      const feeOverrides = hasFeeOverrides(contract);
      const termProducts = hasProducts
        ? getCurrentTermProducts(contract, fiscalYearStartMonth, {
            hasFeeOverrides: feeOverrides,
          })
        : { productsByYear: {}, hasValidTermDate: false, sortedYears: [] };

      return {
        contractId: contract.id,
        products: termProducts.productsByYear,
        contractData: {
          id: contract.id,
          localId: contract.localId || contract.id.toString(),
          contract_types: contract.contract_types,
          currency: contract.currency,
          annual_increase: contract.annual_increase,
          renewal_type: contract.renewal_type,
          vendor_products_details: contract.vendor_products_details,
          term_start_date: contract.term_start_date,
          other_attributes: contract.other_attributes,
        },
      };
    });

  // Sort by hierarchy order if available, otherwise by contract ID
  if (hierarchyOrder.length > 0) {
    productsData.sort((a, b) => {
      return (
        hierarchyOrder.indexOf(a.contractId) -
        hierarchyOrder.indexOf(b.contractId)
      );
    });
  } else {
    productsData.sort((a, b) => a.contractId - b.contractId);
  }

  return productsData;
}
