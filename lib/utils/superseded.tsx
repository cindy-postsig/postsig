import { Row } from '@tanstack/react-table';
import { formatCurrency } from '@/app/lib/utils';

/**
 * Check if all products in a contract row are superseded.
 * Uses the same product data source as the product column (currentYearProducts || product).
 */
export function areAllProductsSuperseded(row: Row<any>): boolean {
  const products = row.original.currentYearProducts || row.original.product;
  const supersededProducts = row.original.supersededProducts;

  if (!supersededProducts || !Array.isArray(supersededProducts)) {
    return false;
  }

  // No products = not superseded
  if (!products) return false;

  // Handle single product (not an array)
  if (!Array.isArray(products)) {
    const product = products as any;
    const productId = product.vendor_products?.id || product.id;
    const productYear = product.year || 1;
    const productKey = `${productId}-${productYear}`;
    return supersededProducts.includes(productKey);
  }

  // Handle multiple products (array)
  if (products.length === 0) return false;

  // Check if ALL products are superseded
  const supersededSet = new Set(supersededProducts);
  return products.every((prod: any) => {
    const productId = prod.vendor_products?.id || prod.id;
    const productYear = prod.year || 1;
    const productKey = `${productId}-${productYear}`;
    return supersededSet.has(productKey);
  });
}

/**
 * Format product fee with strikethrough styling if superseded.
 */
export function formatProductFeeWithSuperseded(
  fee: number,
  currency: string | undefined,
  isSuperseded: boolean,
): React.ReactElement {
  const feeValue = formatCurrency(fee, currency);
  return (
    <span className={isSuperseded ? 'line-through opacity-60' : ''}>
      {feeValue}
    </span>
  );
}

/**
 * Get CSS classes for superseded styling.
 */
export function getSupersededClasses(isSuperseded: boolean): string {
  return isSuperseded ? 'line-through opacity-60' : '';
}
