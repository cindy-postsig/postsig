import { describe, expect, it } from '@jest/globals';
import { createProductComparison } from '@/components/contracts/amendments/productComparisonUtils';
import {
  ADD1,
  ADD2,
  MSA,
  chain,
  compoundedChain,
  contract,
  product,
  repricedChain,
  survivorChain,
} from './product-comparison-fixtures';

describe('createProductComparison — without removals (regression pin)', () => {
  it('returns an empty removedProducts set when no removals are passed', () => {
    expect(createProductComparison(MSA, chain(), MSA).removedProducts).toEqual(
      new Set(),
    );
  });

  it('still reports added products', () => {
    const result = createProductComparison(ADD1, chain(), MSA);
    expect(result.productDifferences.get('3-1')).toBe('added');
  });

  it('still reports unchanged products', () => {
    const result = createProductComparison(ADD1, chain(), MSA);
    expect(result.productDifferences.get('1-1')).toBe('unchanged');
  });

  it('still reports a price increase', () => {
    const result = createProductComparison(ADD1, repricedChain(), MSA);
    expect(result.productDifferences.get('1-1')).toBe('price_increased');
  });

  it('still reports a price decrease', () => {
    const data = [
      contract(MSA, [product(1, 1, 100)], '2020-01-01'),
      contract(ADD1, [product(1, 1, 50)], '2021-01-01'),
    ];
    const result = createProductComparison(ADD1, data, MSA);
    expect(result.productDifferences.get('1-1')).toBe('price_decreased');
  });

  it('still supersedes a product repriced by a later contract', () => {
    const result = createProductComparison(MSA, repricedChain(), MSA);
    expect(result.supersededProducts).toEqual(new Set(['1-1']));
  });

  it('returns empty structures for an empty hierarchy', () => {
    const result = createProductComparison(MSA, [], MSA);
    expect(result.productDifferences.size).toBe(0);
    expect(result.supersededProducts.size).toBe(0);
    expect(result.removedProducts.size).toBe(0);
  });

  it('returns empty structures when the contract is not in the hierarchy', () => {
    const result = createProductComparison(999, chain(), MSA);
    expect(result.productDifferences.size).toBe(0);
    expect(result.removedProducts.size).toBe(0);
  });
});

describe('createProductComparison — removals', () => {
  it('marks a removed product in both the set and the difference map', () => {
    const result = createProductComparison(MSA, chain(), MSA, new Set([1]));
    expect(result.removedProducts).toEqual(new Set(['1-1']));
    expect(result.productDifferences.get('1-1')).toBe('removed');
  });

  it('leaves products that were not removed alone', () => {
    const result = createProductComparison(MSA, chain(), MSA, new Set([1]));
    expect(result.removedProducts.has('2-1')).toBe(false);
    expect(result.productDifferences.get('2-1')).not.toBe('removed');
  });

  it('marks every year instance of a removed product', () => {
    // Keyed on product_id, so all years of that product are struck.
    const data = [
      contract(
        MSA,
        [product(1, 1, 100), product(1, 2, 110), product(2, 1, 200)],
        '2020-01-01',
      ),
    ];
    const result = createProductComparison(MSA, data, MSA, new Set([1]));
    expect(result.removedProducts).toEqual(new Set(['1-1', '1-2']));
  });

  it('ignores removal ids for products this contract does not license', () => {
    const result = createProductComparison(MSA, chain(), MSA, new Set([9999]));
    expect(result.removedProducts.size).toBe(0);
  });

  it('treats an empty removal set as no removals', () => {
    const withEmpty = createProductComparison(MSA, chain(), MSA, new Set());
    const without = createProductComparison(MSA, chain(), MSA);
    expect(withEmpty.removedProducts).toEqual(without.removedProducts);
    expect(withEmpty.productDifferences).toEqual(without.productDifferences);
  });

  it('composes with superseded rather than replacing it', () => {
    // Product 1 is repriced by ADD1 (superseded) AND removed by declaration.
    const result = createProductComparison(
      MSA,
      repricedChain(),
      MSA,
      new Set([1]),
    );
    expect(result.supersededProducts).toEqual(new Set(['1-1']));
    expect(result.removedProducts).toEqual(new Set(['1-1']));
  });
});

describe('createProductComparison — surviving products are unaffected', () => {
  it('computes identical differences for surviving products with and without removals', () => {
    // The plan's core safety criterion: introducing removals must not perturb
    // the comparison of anything that survives.
    const without = createProductComparison(MSA, chain(), MSA);
    const withRemovals = createProductComparison(
      MSA,
      chain(),
      MSA,
      new Set([1]),
    );
    expect(withRemovals.productDifferences.get('2-1')).toBe(
      without.productDifferences.get('2-1'),
    );
  });

  it('computes identical superseded sets with and without removals', () => {
    const without = createProductComparison(MSA, survivorChain(), MSA);
    const withRemovals = createProductComparison(
      MSA,
      survivorChain(),
      MSA,
      new Set([1]),
    );
    expect(withRemovals.supersededProducts).toEqual(without.supersededProducts);
  });

  it('preserves compounded-fee-driven comparison for surviving products', () => {
    // compoundedFee takes precedence over fees in the comparison; removing a
    // sibling product must not change the branch taken for survivors.
    const without = createProductComparison(ADD1, compoundedChain(), MSA);
    const withRemovals = createProductComparison(
      ADD1,
      compoundedChain(),
      MSA,
      new Set([1]),
    );
    expect(without.productDifferences.get('2-1')).toBe('unchanged');
    expect(withRemovals.productDifferences.get('2-1')).toBe('unchanged');
  });

  it('does not change predecessorYears', () => {
    const without = createProductComparison(ADD1, chain(), MSA);
    const withRemovals = createProductComparison(
      ADD1,
      chain(),
      MSA,
      new Set([1]),
    );
    expect(withRemovals.predecessorYears).toEqual(without.predecessorYears);
  });

  it('applies removals per contract, not across the chain', () => {
    const data = [
      contract(MSA, [product(1, 1, 100)], '2020-01-01'),
      contract(ADD2, [product(5, 1, 500)], '2022-01-01'),
    ];
    // Callers pass the set resolved for THIS contract; ADD2 has none.
    const result = createProductComparison(ADD2, data, MSA, new Set());
    expect(result.removedProducts.size).toBe(0);
    expect(result.productDifferences.get('5-1')).toBe('added');
  });
});
