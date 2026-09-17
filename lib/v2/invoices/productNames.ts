import type { ContractTableRow } from '@/lib/v2/core/types';

export function productNames(row: Pick<ContractTableRow, 'product'>): string {
  const products = Array.isArray(row.product) ? row.product : [];
  const names = Array.from(
    new Set(
      products
        .map((p) => p.vendor_products?.name || p.name || '')
        .filter(Boolean),
    ),
  );
  return names.join(', ');
}
