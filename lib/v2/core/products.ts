/**
 * Product Functions
 *
 * Functions for extracting and organizing products from contracts.
 */

import { extractBudgetFromPriceHistory } from '@/app/lib/budget';
import { ContractWithPricing, EnrichedProduct } from './types';

export interface TermProductsResult {
  productsByYear: Record<string, any[]>;
  hasValidTermDate: boolean;
  sortedYears: string[];
  termStartDate: any[];
  fiscalYearStartMonth: number;
}

/**
 * Extract flattened products from enriched contracts.
 * Each product becomes a separate row with vendor/contract info attached.
 */
export function extractProducts(
  contracts: ContractWithPricing[],
): EnrichedProduct[] {
  const products: EnrichedProduct[] = [];

  for (const contract of contracts) {
    for (const product of contract.products) {
      products.push({
        product_id: product.product_id,
        name: product.name,
        vendor_id: contract.vendor_id,
        vendor_name: contract.vendor_name,
        vendor_domain: contract.vendor_domain,
        contract_id: contract.id,
        sourceContractId: product.sourceContractId,
        isSuperseded: product.isSuperseded,
        supersededByContractId: product.supersededByContractId,
        isSuperseding: product.isSuperseding,
        supersedesProductInContractId: product.supersedesProductInContractId,
        currentFee: product.currentFee,
        currency: product.currency,
        currentFeeUSD: product.currentFeeUSD,
        currentProducts: product.currentProducts,
        effectiveFeeUSD: product.effectiveFeeUSD,
        // The native pair rides with its converted counterpart — dropping it
        // here silently downgrades every inventory row to the base-currency
        // fallback (the exact regression this copy once caused).
        effectiveFee: product.effectiveFee,
        effectiveFeeCurrency: product.effectiveFeeCurrency,
        feeSourceContractId: product.feeSourceContractId,
      });
    }
  }

  return products;
}

/**
 * Drop products cancelled by a confirmed lineage declaration (PSK-1830).
 *
 * A row is removed when its product id is struck on its OWN contract
 * (`contract_id`) — the same (chain contract, product) pairs the resolver
 * produces. Deliberately NOT keyed on `sourceContractId`: an addendum that
 * blanket-cancels and relicenses the same product id yields a surviving row
 * whose source is the struck ancestor, and keying on the source would
 * wrongly vanish a still-licensed product. Must run BEFORE
 * `filterToOnePerFamily`, so a family whose elected member is cancelled can
 * re-elect a surviving sibling instead of vanishing wholesale.
 */
export function excludeRemovedProducts(
  products: EnrichedProduct[],
  removedByContract: Map<number, Set<number>>,
): EnrichedProduct[] {
  if (removedByContract.size === 0) return products;

  return products.filter(
    (p) => removedByContract.get(p.contract_id)?.has(p.product_id) !== true,
  );
}

/**
 * Build products organized by year within the current term.
 * Uses already-generated priceHistory to avoid duplicate computation.
 *
 * @param contractData - Raw contract data
 * @param priceHistory - Already-generated price history from enrichWithPricing
 * @param fiscalYearStartMonth - Fiscal year start month
 */
export function buildTermProducts(
  contractData: any,
  priceHistory: any,
  fiscalYearStartMonth: number = 1,
): TermProductsResult {
  const hasProducts = contractData?.vendor_products_details?.length > 0;
  const currency = contractData?.currency;

  // Extract budget data including current products from price history
  const { currentProducts = [] } =
    extractBudgetFromPriceHistory(priceHistory) || {};

  // Check if the most recent (latest updated) term_start_date has a valid date
  const hasValidTermDate = (() => {
    if (!contractData?.term_start_date?.length) return false;
    // Sort by updated_at to get the most recent entry
    const sortedDates = [...contractData.term_start_date].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    const date = sortedDates[0]?.date;
    if (!date) return false;
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  })();

  // Group products by year within term
  let productsByYear: Record<string, any[]> = {};

  if (hasProducts) {
    // First try to use price history products if we have valid term dates and the products have periodInfo
    if (currentProducts.length > 0 && hasValidTermDate) {
      productsByYear = currentProducts.reduce<Record<string, any[]>>(
        (acc, product) => {
          // Skip products without period info or valid yearWithinTerm
          if (!product.periodInfo || product.periodInfo.yearWithinTerm == null)
            return acc;

          const yearKey = product.periodInfo.yearWithinTerm.toString();

          if (!acc[yearKey]) {
            acc[yearKey] = [];
          }

          // Check if this product is already in the array for this year
          const exists = acc[yearKey].some(
            (p) =>
              p.product_id === product.product_id &&
              p.periodInfo?.termIndex === product.periodInfo?.termIndex,
          );

          if (!exists) {
            // Create a default vendor_products object if it doesn't exist
            const vendorProductsDefault = {
              name: 'Unknown Product',
              id: product.product_id,
            };

            // Ensure vendor_products is defined and has the required properties
            const vendorProducts = product.vendor_products
              ? {
                  name: product.vendor_products.name || 'Unknown Product',
                  id: product.vendor_products.id || product.product_id,
                }
              : vendorProductsDefault;

            // Add the product with the information we need for display
            acc[yearKey].push({
              product_id: product.product_id,
              vendor_products: vendorProducts,
              fees: Number(product.fees) || 0,
              originalFees: Number(product.originalFees || product.fees) || 0,
              renewalCount: product.periodInfo?.termIndex ?? 0,
              hasIncrease:
                Number(product.fees) >
                Number(product.originalFees || product.fees),
              compoundedFee:
                Number(product.compoundedFees || product.fees) || 0,
              year: parseInt(yearKey, 10),
              periodInfo: product.periodInfo,
              startDate: product.startDate,
              endDate: product.endDate,
              currency,
              sort_order: product.sort_order ?? null,
            });
          }

          return acc;
        },
        {},
      );
    }

    // Always fallback to vendor_products_details if we don't have any products to show
    if (Object.keys(productsByYear).length === 0) {
      productsByYear['1'] = contractData.vendor_products_details.map(
        (product: any) => ({
          product_id: product.product_id || product.id,
          vendor_products: {
            name:
              product.name ||
              product.vendor_products?.name ||
              'Unknown Product',
            id: product.product_id ?? product.vendor_products?.id ?? product.id,
          },
          fees: Number(product.fees) || 0,
          originalFees: Number(product.fees) || 0,
          renewalCount: 0,
          hasIncrease: false,
          compoundedFee: Number(product.fees) || 0,
          year: 1,
          periodInfo: null,
          startDate: null,
          endDate: null,
          currency,
          sort_order: product.sort_order ?? null,
        }),
      );
    }
  }

  // Sort the years in ascending order
  const sortedYears = Object.keys(productsByYear).sort(
    (a, b) => Number(a) - Number(b),
  );

  for (const year of sortedYears) {
    productsByYear[year].sort((a: any, b: any) => {
      const orderA = a.sort_order ?? Infinity;
      const orderB = b.sort_order ?? Infinity;
      if (orderA !== orderB) return orderA - orderB;

      const idA = a.vendor_products?.id ?? a.product_id ?? 0;
      const idB = b.vendor_products?.id ?? b.product_id ?? 0;
      return idA - idB;
    });
  }

  return {
    productsByYear,
    hasValidTermDate,
    sortedYears,
    termStartDate: contractData.term_start_date || [],
    fiscalYearStartMonth,
  };
}

/**
 * @deprecated Use buildTermProducts instead, which accepts priceHistory as input.
 * This function regenerates priceHistory unnecessarily.
 */
export { buildTermProducts as getCurrentTermProducts };
