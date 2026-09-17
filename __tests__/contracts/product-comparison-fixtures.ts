import { type HierarchyProductsData } from '@/components/contracts/amendments/productComparisonUtils';

export const MSA = 100;
export const ADD1 = 101;
export const ADD2 = 102;

export const product = (
  productId: number,
  year: number,
  fees: number,
  compoundedFee?: number,
) => ({
  product_id: productId,
  vendor_products: { id: productId, name: `Product ${productId}` },
  year,
  fees,
  ...(compoundedFee === undefined ? {} : { compoundedFee }),
});

export const contract = (
  contractId: number,
  products: ReturnType<typeof product>[],
  termStartDate: string,
): HierarchyProductsData => ({
  contractId,
  products: { 1: products },
  contractData: {
    id: contractId,
    term_start_date: [{ date: termStartDate }],
  } as HierarchyProductsData['contractData'],
});

/**
 * MSA licenses products 1 and 2; ADD1 re-licenses product 1 at the same fee
 * (so nothing is superseded by price) and adds product 3.
 */
export const chain = (): HierarchyProductsData[] => [
  contract(MSA, [product(1, 1, 100), product(2, 1, 200)], '2020-01-01'),
  contract(ADD1, [product(1, 1, 100), product(3, 1, 300)], '2021-01-01'),
];

/** MSA licenses product 1; ADD1 reprices it, superseding the MSA row. */
export const repricedChain = (): HierarchyProductsData[] => [
  contract(MSA, [product(1, 1, 100)], '2020-01-01'),
  contract(ADD1, [product(1, 1, 150)], '2021-01-01'),
];

/** Product 2 survives into ADD1 at a new price; product 1 does not recur. */
export const survivorChain = (): HierarchyProductsData[] => [
  contract(MSA, [product(1, 1, 100), product(2, 1, 200)], '2020-01-01'),
  contract(ADD1, [product(2, 1, 250)], '2021-01-01'),
];

/** Both contracts carry compoundedFee, which the comparison prefers over fees. */
export const compoundedChain = (): HierarchyProductsData[] => [
  contract(
    MSA,
    [product(1, 1, 100, 100), product(2, 1, 200, 220)],
    '2020-01-01',
  ),
  contract(
    ADD1,
    [product(1, 1, 100, 100), product(2, 1, 200, 220)],
    '2021-01-01',
  ),
];
