import { describe, expect, it } from '@jest/globals';
import { excludeRemovedProducts } from '@/lib/v2/core/products';
import { filterToOnePerFamily } from '@/lib/v2/core/lineage';
import type { EnrichedProduct } from '@/lib/v2/core/types';

const product = (
  overrides: Partial<EnrichedProduct> & {
    product_id: number;
    contract_id: number;
    sourceContractId: number;
  },
): EnrichedProduct => ({
  name: `Product ${overrides.product_id}`,
  vendor_id: 1,
  vendor_name: 'Vendor',
  isSuperseded: false,
  isSuperseding: false,
  currentFee: 100,
  currency: 'USD',
  currentFeeUSD: 100,
  effectiveFeeUSD: 100,
  ...overrides,
});

function removedMap(
  contractId: number,
  ids: number[],
): Map<number, Set<number>> {
  return new Map([[contractId, new Set(ids)]]);
}

describe('excludeRemovedProducts', () => {
  it('drops a row whose own contract is struck for that product', () => {
    const rows = [
      product({ product_id: 5, contract_id: 1, sourceContractId: 1 }),
      product({ product_id: 6, contract_id: 1, sourceContractId: 1 }),
    ];

    const kept = excludeRemovedProducts(rows, removedMap(1, [5]));

    expect(kept.map((p) => p.product_id)).toEqual([6]);
  });

  it('keeps a relicensed row even though its SOURCE contract is struck', () => {
    // The addendum (contract 2) blanket-cancelled the MSA (contract 1) and
    // relicensed the same product id. The surviving addendum row carries the
    // struck MSA as sourceContractId — removing by source would vanish a
    // product that is still licensed.
    const rows = [
      product({ product_id: 5, contract_id: 1, sourceContractId: 1 }),
      product({ product_id: 5, contract_id: 2, sourceContractId: 1 }),
    ];

    const kept = excludeRemovedProducts(rows, removedMap(1, [5]));

    expect(kept).toHaveLength(1);
    expect(kept[0].contract_id).toBe(2);
  });

  it('keeps a row whose product id is struck only on unrelated contracts', () => {
    const rows = [
      product({ product_id: 5, contract_id: 2, sourceContractId: 1 }),
    ];

    const kept = excludeRemovedProducts(rows, removedMap(3, [5]));

    expect(kept).toHaveLength(1);
  });

  it('returns the input array unchanged when nothing is removed', () => {
    const rows = [
      product({ product_id: 5, contract_id: 2, sourceContractId: 1 }),
    ];

    expect(excludeRemovedProducts(rows, new Map())).toBe(rows);
  });

  it('lets a family re-elect a surviving member when filtered before dedupe', () => {
    // Family key is `${product_id}-${sourceContractId}`. The active member is
    // cancelled; filtering BEFORE filterToOnePerFamily lets the superseded
    // sibling win instead of the whole family silently vanishing.
    const active = product({
      product_id: 5,
      contract_id: 2,
      sourceContractId: 1,
    });
    const supersededSibling = product({
      product_id: 5,
      contract_id: 3,
      sourceContractId: 1,
      isSuperseded: true,
    });

    const kept = filterToOnePerFamily(
      excludeRemovedProducts([active, supersededSibling], removedMap(2, [5])),
    );

    expect(kept).toHaveLength(1);
    expect(kept[0].contract_id).toBe(3);
  });
});
