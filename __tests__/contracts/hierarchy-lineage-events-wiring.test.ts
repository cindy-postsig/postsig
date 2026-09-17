import { describe, expect, it } from '@jest/globals';
import {
  resolveRemovedProductIds,
  toChainContracts as toResolverInput,
} from '@/lib/contracts/productLineageResolution';
import { createProductComparison } from '@/components/contracts/amendments/productComparisonUtils';
import { ADD1, MSA, chain } from './product-comparison-fixtures';

/**
 * HierarchyProvider is a client component whose value is assembled from
 * hierarchyProductsData. Rather than mount React, this exercises the exact
 * transformation the provider performs — hierarchyProductsData -> resolver
 * input -> per-contract removal set -> createProductComparison — so a change
 * to either end that breaks the seam is caught.
 *
 * `toChainContracts` is the same function HierarchyProvider calls, not a copy
 * of it, so this cannot pass against a stale duplicate of the projection.
 */

const blanketOn = (contractId: number) => [
  {
    contract_id: contractId,
    product_id: null,
    action: 'replace_all_prior',
    status: 'confirmed',
  },
];

const DATED = { term_start_date: [{ date: '2020-01-01' }] };

/** Rows as the two id shapes appear in productsByYear buckets. */
const MIXED_ID_SHAPES = [{ product_id: 7 }, { vendor_products: { id: 8 } }];

/**
 * Rows that carry no usable numeric product id. Includes a string id: the
 * resolver compares ids with `includes`/Set identity, so a stringified id
 * would silently never match and must be dropped, not merely null-checked.
 */
const UNUSABLE_ID_ROWS = [
  null,
  {},
  { product_id: null },
  { product_id: '5' },
  { product_id: 5 },
];

describe('hierarchy -> resolution seam', () => {
  it('extracts contract ids, dates and product ids from hierarchy products data', () => {
    const input = toResolverInput(chain());

    expect(input).toEqual([
      {
        contractId: MSA,
        termStartDate: [{ date: '2020-01-01' }],
        productIds: [1, 2],
      },
      {
        contractId: ADD1,
        termStartDate: [{ date: '2021-01-01' }],
        productIds: [1, 3],
      },
    ]);
  });

  it('falls back to product_id when the vendor_products join is absent', () => {
    const input = toResolverInput([
      {
        contractId: MSA,
        products: { 1: MIXED_ID_SHAPES },
        contractData: DATED,
      },
    ]);

    expect(input[0].productIds).toEqual([7, 8]);
  });

  it('drops rows carrying no usable product id', () => {
    const input = toResolverInput([
      {
        contractId: MSA,
        products: { 1: UNUSABLE_ID_ROWS },
        contractData: DATED,
      },
    ]);

    expect(input[0].productIds).toEqual([5]);
  });

  it('tolerates a contract with no products or contractData', () => {
    expect(toResolverInput([{ contractId: MSA }])).toEqual([
      { contractId: MSA, termStartDate: undefined, productIds: [] },
    ]);
  });

  it('resolves a blanket declaration into the earlier contract removal set', () => {
    const removed = resolveRemovedProductIds(
      blanketOn(ADD1),
      toResolverInput(chain()),
    );

    expect(removed.get(MSA)).toEqual(new Set([1, 2]));
    expect(removed.has(ADD1)).toBe(false);
  });

  it('feeds the per-contract set into createProductComparison', () => {
    const removed = resolveRemovedProductIds(
      blanketOn(ADD1),
      toResolverInput(chain()),
    );

    const comparison = createProductComparison(
      MSA,
      chain(),
      MSA,
      removed.get(MSA),
    );

    expect(comparison.removedProducts).toEqual(new Set(['1-1', '2-1']));
  });

  it('gives a contract with no removals an undefined set, which is a no-op', () => {
    const removed = resolveRemovedProductIds(
      blanketOn(ADD1),
      toResolverInput(chain()),
    );

    const comparison = createProductComparison(
      ADD1,
      chain(),
      MSA,
      removed.get(ADD1),
    );

    expect(removed.get(ADD1)).toBeUndefined();
    expect(comparison.removedProducts.size).toBe(0);
  });
});

describe('no events means no change', () => {
  it('resolves to an empty map', () => {
    expect(resolveRemovedProductIds([], toResolverInput(chain())).size).toBe(0);
  });

  it('produces a comparison identical to omitting the parameter entirely', () => {
    // The production default is an empty event list, so this is what every
    // page renders today. It must match pre-PSK-1830 behavior exactly.
    const removed = resolveRemovedProductIds([], toResolverInput(chain()));

    const wired = createProductComparison(MSA, chain(), MSA, removed.get(MSA));
    const legacy = createProductComparison(MSA, chain(), MSA);

    expect(wired.productDifferences).toEqual(legacy.productDifferences);
    expect(wired.supersededProducts).toEqual(legacy.supersededProducts);
    expect(wired.removedProducts).toEqual(legacy.removedProducts);
  });

  it.each(['pending', 'rejected'])(
    'renders nothing for a %s declaration',
    (status) => {
      const removed = resolveRemovedProductIds(
        [{ ...blanketOn(ADD1)[0], status }],
        toResolverInput(chain()),
      );

      const comparison = createProductComparison(
        MSA,
        chain(),
        MSA,
        removed.get(MSA),
      );

      expect(comparison.removedProducts.size).toBe(0);
    },
  );
});
