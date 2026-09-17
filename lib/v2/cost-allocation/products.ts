export interface AllocationProductSource {
  product_id: number;
  name: string;
  isSuperseded: boolean;
  isCancelled?: boolean;
  sort_order?: number | null;
}

export interface AllocationProduct {
  id: number;
  name: string;
  live: boolean;
}

export function uniqueAllocationProducts(
  products: ReadonlyArray<AllocationProductSource>,
): AllocationProduct[] {
  const sorted = [...products].sort(
    (a, b) =>
      (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
      (b.sort_order ?? Number.MAX_SAFE_INTEGER),
  );
  const byId = new Map<number, AllocationProduct>();
  for (const product of sorted) {
    if (byId.has(product.product_id)) continue;
    byId.set(product.product_id, {
      id: product.product_id,
      name: product.name,
      live: !product.isSuperseded && product.isCancelled !== true,
    });
  }
  return [...byId.values()];
}

/** The product a row leads with: the first live one, else the first at all. */
export function leadAllocationProduct(
  products: readonly AllocationProduct[],
): AllocationProduct | undefined {
  return products.find((product) => product.live) ?? products[0];
}
