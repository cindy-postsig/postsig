import { describe, expect, it } from '@jest/globals';

import { buildHierarchyMapFromRelationships } from '@/lib/amendments/hierarchyUtils';
import {
  buildParentTerms,
  buildParentNoticeDays,
  type RelationshipEdge,
} from '@/lib/v2/spend/members';
import { resolveRemovedProductIdsAcrossChains } from '@/lib/contracts/productLineageResolution';

/**
 * Task 2.3: the remaining in-memory relationship consumers must see hierarchy
 * edges only.
 *
 * Every case is written as an equivalence: the output with a 'billing' edge
 * present must equal the output computed from the same fixtures without it.
 * That shape is what the containment guarantee actually claims, and it fails
 * loudly if a site starts walking typed edges again.
 */

const hierarchy = (
  parent: number,
  child: number,
): RelationshipEdge & { relationship_type: null } => ({
  parent_contract_id: parent,
  child_contract_id: child,
  relationship_type: null,
});

const billing = (
  parent: number,
  child: number,
): RelationshipEdge & { relationship_type: string } => ({
  parent_contract_id: parent,
  child_contract_id: child,
  relationship_type: 'billing',
});

describe('buildHierarchyMapFromRelationships (amendments)', () => {
  const contracts = [
    { id: 10, term_start_date: [{ date: '2024-01-01' }] },
    { id: 20, term_start_date: [{ date: '2024-02-01' }] },
    { id: 30, term_start_date: [{ date: '2024-03-01' }] },
  ];
  // Invoice 30 hangs off SO 20; SO 10 is a separate chain that merely pays for
  // some of its lines.
  const hierarchyOnly = [hierarchy(20, 30)];
  const withBilling = [hierarchy(20, 30), billing(10, 30)];

  const childIds = (map: Map<number, { children?: Array<{ id: number }> }>) =>
    new Map(
      Array.from(map.entries()).map(([id, node]) => [
        id,
        (node.children ?? []).map((c) => c.id).sort((a, b) => a - b),
      ]),
    );

  it('does not list a billing child under its billing parent', () => {
    const map = buildHierarchyMapFromRelationships(contracts, withBilling);
    expect(map.get(10)?.children).toBeUndefined();
    expect(map.get(20)?.children?.map((c) => c.id)).toEqual([30]);
  });

  it('produces the same tree with and without the billing edge', () => {
    expect(
      childIds(buildHierarchyMapFromRelationships(contracts, withBilling)),
    ).toEqual(
      childIds(buildHierarchyMapFromRelationships(contracts, hierarchyOnly)),
    );
  });

  it('still builds the tree when relationship_type is absent entirely', () => {
    // Narrow selects that omit the column must stay byte-identical to today
    // rather than silently dropping every edge.
    const untyped = [{ parent_contract_id: 20, child_contract_id: 30 }];
    const map = buildHierarchyMapFromRelationships(contracts, untyped);
    expect(map.get(20)?.children?.map((c) => c.id)).toEqual([30]);
  });
});

describe('spend members orderedEdges consumers', () => {
  // Parent 1 is the billing parent and sorts FIRST, so first-edge-wins would
  // hand its 36-month term to the invoice if billing edges were walked.
  const enriched = [
    {
      id: 1,
      contract: { subscription_term: 36 },
      products: [],
      isLinkedChildInvoice: false,
    },
    {
      id: 2,
      contract: { subscription_term: 12 },
      products: [],
      isLinkedChildInvoice: false,
    },
    {
      id: 3,
      contract: { subscription_term: null },
      products: [],
      isLinkedChildInvoice: false,
    },
  ];

  it('does not inherit a term from a billing parent', () => {
    const terms = buildParentTerms(enriched, [billing(1, 3), hierarchy(2, 3)]);
    expect(terms.get(3)).toBe(12);
  });

  it('matches the billing-free result for parent terms', () => {
    expect(
      buildParentTerms(enriched, [billing(1, 3), hierarchy(2, 3)]),
    ).toEqual(buildParentTerms(enriched, [hierarchy(2, 3)]));
  });

  it('grants no inherited term when the only parent is a billing parent', () => {
    expect(buildParentTerms(enriched, [billing(1, 3)]).size).toBe(0);
  });

  // deriveCancelByDateFromParent only grants a notice period to a service
  // order under an MSA that records one, so the notice-day fixtures need real
  // types and dates — otherwise the equivalence holds vacuously at zero.
  const CONTRACT_TYPE_MSA = 1;
  const CONTRACT_TYPE_SO = 2;
  const noticeEnriched = [
    {
      id: 1,
      contract: { type_id: CONTRACT_TYPE_MSA, cancel_by_date: 90 },
      products: [],
      isLinkedChildInvoice: false,
    },
    {
      id: 2,
      contract: { type_id: CONTRACT_TYPE_MSA, cancel_by_date: 30 },
      products: [],
      isLinkedChildInvoice: false,
    },
    {
      id: 3,
      contract: {
        type_id: CONTRACT_TYPE_SO,
        term_end_date: [{ date: '2025-12-31' }],
      },
      products: [],
      isLinkedChildInvoice: false,
    },
  ];

  it('does not inherit a notice period from a billing parent', () => {
    const days = buildParentNoticeDays(noticeEnriched, [
      billing(1, 3),
      hierarchy(2, 3),
    ]);
    expect(days.get(3)).toBe(30);
  });

  it('matches the billing-free result for notice days', () => {
    const withBilling = buildParentNoticeDays(noticeEnriched, [
      billing(1, 3),
      hierarchy(2, 3),
    ]);
    expect(withBilling).toEqual(
      buildParentNoticeDays(noticeEnriched, [hierarchy(2, 3)]),
    );
    // Guard against a vacuous pass: both sides must actually grant a period.
    expect(withBilling.size).toBe(1);
  });

  it('keeps edges whose relationship_type is absent', () => {
    const untyped = [{ parent_contract_id: 2, child_contract_id: 3 }];
    expect(buildParentTerms(enriched, untyped).get(3)).toBe(12);
  });
});

describe('productLineageResolution buildAdjacency', () => {
  // Two independent chains: SO-A (100 -> 101) and SO-B (200 -> 201). Invoice
  // 101 is billing-linked to 200. A replace_all_prior on 101 must not reach
  // SO-B's products.
  const chainContracts = [
    { contractId: 100, termStartDate: '2024-01-01', productIds: [1] },
    { contractId: 101, termStartDate: '2024-06-01', productIds: [2] },
    { contractId: 200, termStartDate: '2024-02-01', productIds: [3] },
    { contractId: 201, termStartDate: '2024-03-01', productIds: [4] },
  ];
  const events = [
    { contract_id: 101, product_id: null, action: 'replace_all_prior' },
  ];
  const hierarchyOnly = [hierarchy(100, 101), hierarchy(200, 201)];
  const withBilling = [...hierarchyOnly, billing(200, 101)];

  it('does not strike another chain through a billing edge', () => {
    const removed = resolveRemovedProductIdsAcrossChains(
      events,
      chainContracts,
      withBilling,
    );
    // 100 is in the declaring contract's own chain and predates it.
    expect(Array.from(removed.get(100) ?? [])).toEqual([1]);
    // 200 and 201 belong to the other chain and must be untouched.
    expect(removed.get(200)).toBeUndefined();
    expect(removed.get(201)).toBeUndefined();
  });

  it('matches the billing-free component partition', () => {
    const asPlain = (map: Map<number, Set<number>>) =>
      Array.from(map.entries())
        .map(([id, set]) => [id, Array.from(set).sort((a, b) => a - b)])
        .sort((a, b) => Number(a[0]) - Number(b[0]));

    expect(
      asPlain(
        resolveRemovedProductIdsAcrossChains(
          events,
          chainContracts,
          withBilling,
        ),
      ),
    ).toEqual(
      asPlain(
        resolveRemovedProductIdsAcrossChains(
          events,
          chainContracts,
          hierarchyOnly,
        ),
      ),
    );
  });

  it('keeps NULL-type strike behavior byte-identical (psk-1830 legacy)', () => {
    // The pre-existing single-chain case: no typed edges anywhere.
    const removed = resolveRemovedProductIdsAcrossChains(
      events,
      chainContracts,
      hierarchyOnly,
    );
    expect(Array.from(removed.get(100) ?? [])).toEqual([1]);
  });
});
