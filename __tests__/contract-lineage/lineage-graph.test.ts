import { describe, expect, it } from '@jest/globals';
import {
  buildLineageGraphExtras,
  hasLineageContent,
  type LineageChain,
} from '@/lib/contracts/lineageGraph';

/**
 * `buildLineageGraphExtras` merges billing-linked chains into the lineage
 * map's one-canvas DAG. The invariants: the primary chain always wins ties,
 * a linked chain rooted inside the primary is the primary (skip), and a
 * billing edge only renders when both endpoints survived the merge.
 */

const record = (id: number) => ({ id, localId: `C-${id}` });

// Primary: 39 -> 45. Billing parent 40 is its own root.
const primaryTree = { id: 39, children: [{ id: 45 }] };
const primary: LineageChain = {
  completeHierarchy: primaryTree,
  allContractsInHierarchy: [record(39), record(45)],
};

const chain40: LineageChain = {
  completeHierarchy: { id: 40 },
  allContractsInHierarchy: [record(40)],
};

// A linked chain that reaches into the primary with a conflicting record.
const overlappingTree = { id: 40, children: [{ id: 45 }] };
const overlapping: LineageChain = {
  completeHierarchy: overlappingTree,
  allContractsInHierarchy: [record(40), { id: 45, localId: 'OTHER-45' }],
};

const emptyPrimary: LineageChain = {
  completeHierarchy: null,
  allContractsInHierarchy: [],
};

const edge40to45 = { source: 40, target: 45 };
const prunedEdge = { source: 99, target: 45 };
const loneRoot = { id: 40 };

describe('buildLineageGraphExtras', () => {
  it('adds a billing-linked chain and its records alongside the primary', () => {
    const extras = buildLineageGraphExtras(primary, [chain40], [edge40to45]);

    expect(extras.additionalHierarchies.map((h) => h.id)).toEqual([40]);
    expect(extras.additionalContracts.map((c) => c.id)).toEqual([40]);
    expect(extras.billingEdges).toEqual([edge40to45]);
  });

  it('skips a linked chain rooted inside the primary chain', () => {
    // getAmendmentChain(45) resolves to 39's tree — the primary itself.
    const extras = buildLineageGraphExtras(primary, [primary], [edge40to45]);

    expect(extras.additionalHierarchies).toEqual([]);
    expect(extras.additionalContracts).toEqual([]);
    // 40 never joined the graph, so its edge must not dangle.
    expect(extras.billingEdges).toEqual([]);
  });

  it('skips a linked chain rooted at a primary descendant, not only the root', () => {
    // A malformed resolver could hand back a subtree rooted mid-chain; every
    // node of the primary must repel it, not just the root id.
    const descendantRooted: LineageChain = {
      completeHierarchy: { id: 45 },
      allContractsInHierarchy: [record(45)],
    };

    const extras = buildLineageGraphExtras(
      primary,
      [descendantRooted],
      [edge40to45],
    );

    expect(extras.additionalHierarchies).toEqual([]);
    expect(extras.additionalContracts).toEqual([]);
    expect(extras.billingEdges).toEqual([]);
  });

  it('adds a shared chain once when two billing links resolve to it', () => {
    const extras = buildLineageGraphExtras(
      primary,
      [chain40, chain40],
      [edge40to45],
    );

    expect(extras.additionalHierarchies.map((h) => h.id)).toEqual([40]);
    expect(extras.additionalContracts.map((c) => c.id)).toEqual([40]);
  });

  it('keeps the primary record when a linked chain carries the same contract', () => {
    const extras = buildLineageGraphExtras(primary, [overlapping], []);

    expect(extras.additionalContracts.map((c) => c.id)).toEqual([40]);
  });

  it('deduplicates identical billing links', () => {
    const extras = buildLineageGraphExtras(
      primary,
      [chain40],
      [edge40to45, { ...edge40to45 }],
    );

    expect(extras.billingEdges).toEqual([edge40to45]);
  });

  it('drops an edge whose endpoint was ACL-pruned away', () => {
    const extras = buildLineageGraphExtras(primary, [], [prunedEdge]);

    expect(extras.billingEdges).toEqual([]);
  });

  it('handles a null primary hierarchy without adding dangling edges', () => {
    const extras = buildLineageGraphExtras(
      emptyPrimary,
      [chain40],
      [edge40to45],
    );

    expect(extras.additionalHierarchies.map((h) => h.id)).toEqual([40]);
    expect(extras.billingEdges).toEqual([]);
  });
});

describe('hasLineageContent', () => {
  it('is true with hierarchy children', () => {
    expect(hasLineageContent(primaryTree, [])).toBe(true);
  });

  it('is true with only billing edges', () => {
    expect(hasLineageContent(loneRoot, [edge40to45])).toBe(true);
  });

  it('is false for a lone root with no billing links', () => {
    expect(hasLineageContent(loneRoot, [])).toBe(false);
    expect(hasLineageContent(null, undefined)).toBe(false);
  });
});
