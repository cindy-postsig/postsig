import { deriveLegacyGroupBackfill } from '@/lib/v2/cost-allocation/legacy-backfill';
import type { OrgUnitNode } from '@/lib/v2/org-units';

/**
 * deriveLegacyGroupBackfill is the derivation scripts/backfill-cost-allocation-acl.ts
 * runs per org, and the one the backfill equality gate
 * (spend-allocation-gates.test.ts) derives its allocations through — so a rule
 * change that breaks the §Backfill rules either fails here or fails the gate.
 */
describe('ACL backfill derivation (TS mirror semantics)', () => {
  const groups = [
    { id: 11, name: 'Trading' },
    { id: 12, name: 'Ops' },
    { id: 13, name: 'trading ' },
    { id: 14, name: '   ' },
  ];

  function derive(
    over: Partial<Parameters<typeof deriveLegacyGroupBackfill>[0]> = {},
  ) {
    let seq = 1000;
    return deriveLegacyGroupBackfill({
      groups,
      units: [],
      contracts: [
        { id: 1, business_group: null },
        { id: 2, business_group: null },
        { id: 3, business_group: 'Research' },
        { id: 4, business_group: null },
        { id: 5, business_group: 'Scalar' },
        { id: 6, business_group: null },
        { id: 7, business_group: '   ' },
      ],
      contractAclGroups: [
        { contract_id: 1, group_id: 11 },
        { contract_id: 5, group_id: 11 },
        { contract_id: 6, group_id: 11 },
        { contract_id: 6, group_id: 12 },
        // Case-variant duplicate of Trading: one node, one line.
        { contract_id: 6, group_id: 13 },
        // Whitespace-named group: resolves no node, still suppresses the scalar.
        { contract_id: 7, group_id: 14 },
      ],
      folderContracts: [
        { contract_id: 2, folder_id: 91 },
        { contract_id: 6, folder_id: 91 },
      ],
      folderAclGroups: [{ folder_id: 91, group_id: 12 }],
      allocatedContractIds: new Set<number>(),
      mintUnitId: () => seq++,
      ...over,
    });
  }

  it('creates one root node per normalized group name, in normalized order, plus scalar nodes', () => {
    const result = derive();
    // Contract 5's 'Scalar' is suppressed by its ACL group, so no node.
    expect(
      result.createdUnits.map((unit) => [unit.name, unit.parent_id]),
    ).toEqual([
      ['Ops', null],
      ['Trading', null],
      ['Research', null],
    ]);
    expect(
      result.createdUnits.every((unit) => unit.level === 'business_group'),
    ).toBe(true);
  });

  it('derives direct, folder-inherited, and scalar allocations; whitespace and unassigned get none', () => {
    const result = derive();
    const byContract = new Map(
      result.allocations.map((allocation) => [
        allocation.contractId,
        allocation.lines,
      ]),
    );
    const nameOf = new Map(
      result.createdUnits.map((unit) => [unit.id, unit.name]),
    );
    const names = (contractId: number) =>
      (byContract.get(contractId) ?? []).map((line) =>
        nameOf.get(line.orgUnitId),
      );

    expect(names(1)).toEqual(['Trading']);
    expect(names(2)).toEqual(['Ops']);
    expect(names(3)).toEqual(['Research']);
    expect(byContract.has(4)).toBe(false);
    // ACL suppresses the scalar.
    expect(names(5)).toEqual(['Trading']);
    // Direct + folder + case-variant duplicate: two nodes, node-id order.
    expect(names(6)).toEqual(['Ops', 'Trading']);
    // A whitespace-named ACL group resolves nothing and still wins precedence.
    expect(byContract.has(7)).toBe(false);
  });

  it('splits at truncated truly-equal percents', () => {
    const result = derive();
    const twoWay = result.allocations.find((a) => a.contractId === 6);
    expect(twoWay?.lines.map((line) => line.percent)).toEqual([50, 50]);

    let seq = 2000;
    const threeWay = deriveLegacyGroupBackfill({
      groups: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ],
      units: [],
      contracts: [{ id: 1, business_group: null }],
      contractAclGroups: [
        { contract_id: 1, group_id: 1 },
        { contract_id: 1, group_id: 2 },
        { contract_id: 1, group_id: 3 },
      ],
      folderContracts: [],
      folderAclGroups: [],
      allocatedContractIds: new Set<number>(),
      mintUnitId: () => seq++,
    });
    expect(threeWay.allocations[0].lines.map((line) => line.percent)).toEqual([
      33.3333, 33.3333, 33.3333,
    ]);
  });

  it('skips contracts that already carry an allocation', () => {
    const result = derive({ allocatedContractIds: new Set([1, 6]) });
    const ids = result.allocations.map((allocation) => allocation.contractId);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(6);
    expect(ids).toContain(2);
  });

  it('reuses an existing same-named node, lowest id winning, instead of minting', () => {
    const existing: OrgUnitNode[] = [
      { id: 7, level: 'business_group', name: 'TRADING', parent_id: 3 },
      { id: 9, level: 'business_group', name: 'Trading', parent_id: null },
    ];
    const result = derive({ units: existing });
    expect(result.createdUnits.map((unit) => unit.name)).toEqual([
      'Ops',
      'Research',
    ]);
    const direct = result.allocations.find((a) => a.contractId === 1);
    expect(direct?.lines).toEqual([{ orgUnitId: 7, percent: 100 }]);
  });
});
