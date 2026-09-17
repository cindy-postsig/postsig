/**
 * Product comparison utilities for amendment history
 */

/**
 * Normalizes products for consistent comparison
 */
export function normalizeProductsForComparison(products: any[]) {
  if (!products || !products.length) return [];

  return products
    .map((product) => ({
      id: product.vendor_products?.id || product.product_id,
      name: product.vendor_products?.name,
      fees: product.compoundedFee || product.fees || 0,
      year: product.year,
    }))
    .sort((a, b) => {
      if (a.name !== b.name) return (a.name || '').localeCompare(b.name || '');
      if (a.year !== b.year) return (a.year || 0) - (b.year || 0);
      return (a.id || 0) - (b.id || 0);
    });
}

/**
 * Checks if two product sets are different
 */
export function areProductsDifferent(
  products1: any[],
  products2: any[],
): boolean {
  const normalized1 = normalizeProductsForComparison(products1);
  const normalized2 = normalizeProductsForComparison(products2);

  if (normalized1.length !== normalized2.length) {
    return true;
  }

  for (let i = 0; i < normalized1.length; i++) {
    const p1 = normalized1[i];
    const p2 = normalized2[i];

    if (
      p1.id !== p2.id ||
      p1.name !== p2.name ||
      p1.fees !== p2.fees ||
      p1.year !== p2.year
    ) {
      return true;
    }
  }

  return false;
}
