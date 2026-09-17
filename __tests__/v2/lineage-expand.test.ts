import { expandToLineageComponents } from '@/lib/v2/core/lineage';

const rel = (p: number | null, c: number | null) => ({
  parent_contract_id: p,
  child_contract_id: c,
});

describe('expandToLineageComponents', () => {
  it('expands a linear chain from any seed in it', () => {
    const rels = [rel(1, 2), rel(2, 3)];
    expect(
      [...expandToLineageComponents([2], rels)].sort((a, b) => a - b),
    ).toEqual([1, 2, 3]);
    expect(
      [...expandToLineageComponents([3], rels)].sort((a, b) => a - b),
    ).toEqual([1, 2, 3]);
  });

  it('includes sibling branches under a shared parent', () => {
    const rels = [rel(1, 2), rel(1, 3)];
    expect(
      [...expandToLineageComponents([2], rels)].sort((a, b) => a - b),
    ).toEqual([1, 2, 3]);
  });

  it('does not cross into disjoint components', () => {
    const rels = [rel(1, 2), rel(10, 11)];
    expect(
      [...expandToLineageComponents([2], rels)].sort((a, b) => a - b),
    ).toEqual([1, 2]);
  });

  it('returns a standalone seed with no relationships', () => {
    expect([...expandToLineageComponents([5], [])]).toEqual([5]);
  });

  it('ignores null endpoints', () => {
    const rels = [rel(null, 2), rel(2, null)];
    expect([...expandToLineageComponents([2], rels)]).toEqual([2]);
  });

  it('unions multiple seeds across components', () => {
    const rels = [rel(1, 2), rel(10, 11)];
    expect(
      [...expandToLineageComponents([2, 11], rels)].sort((a, b) => a - b),
    ).toEqual([1, 2, 10, 11]);
  });

  // psk-1930: components here must match buildContractHierarchyMap's, which
  // excludes billing edges. Crossing one would widen the price-history fetch
  // scope into an unrelated chain and change the supersession flags computed
  // over it.
  it('does not cross a billing edge into another component', () => {
    const rels = [
      rel(1, 2),
      rel(10, 11),
      {
        parent_contract_id: 10,
        child_contract_id: 2,
        relationship_type: 'billing',
      },
    ];
    expect(
      [...expandToLineageComponents([2], rels)].sort((a, b) => a - b),
    ).toEqual([1, 2]);
  });

  it('expands identically with and without a billing edge', () => {
    const base = [rel(1, 2), rel(10, 11)];
    const withBilling = [
      ...base,
      {
        parent_contract_id: 10,
        child_contract_id: 2,
        relationship_type: 'billing',
      },
    ];
    expect([...expandToLineageComponents([2], withBilling)].sort()).toEqual(
      [...expandToLineageComponents([2], base)].sort(),
    );
  });
});
