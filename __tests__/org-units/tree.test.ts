import {
  buildOrgUnitTree,
  countActiveLeafAssignments,
  getStaleNodeIds,
  type OrgUnitNode,
} from '@/lib/v2/org-units';

const node = (
  id: number,
  level: OrgUnitNode['level'],
  name: string,
  parentId: number | null,
): OrgUnitNode => ({ id, level, name, parent_id: parentId });

const NODES: OrgUnitNode[] = [
  node(1, 'division', 'Markets', null),
  node(2, 'business_unit', 'Equities', 1),
  node(3, 'department', 'Research', 2),
  node(4, 'department', 'Ops', 2),
  node(5, 'cost_center', '70133 - Sales Trading', null),
];

describe('buildOrgUnitTree', () => {
  it('links children to parents and excludes cost centers', () => {
    const tree = buildOrgUnitTree(NODES);

    expect(tree.roots.map((n) => n.id)).toEqual([1]);
    expect(tree.childrenByParentId.get(1)?.map((n) => n.id)).toEqual([2]);
    expect(tree.childrenByParentId.get(2)?.map((n) => n.id)).toEqual([3, 4]);
    const all = [tree.roots, ...tree.childrenByParentId.values()].flat();
    expect(all.some((n) => n.level === 'cost_center')).toBe(false);
  });
});

describe('countActiveLeafAssignments', () => {
  it('counts only active, non-deleted employees with a leaf', () => {
    const counts = countActiveLeafAssignments([
      { org_unit_id: 3, status: 'active', deleted_at: null },
      { org_unit_id: 3, status: 'active', deleted_at: null },
      { org_unit_id: 3, status: 'on_leave', deleted_at: null },
      { org_unit_id: 4, status: 'inactive', deleted_at: null },
      { org_unit_id: 4, status: 'active', deleted_at: '2026-01-01' },
      { org_unit_id: null, status: 'active', deleted_at: null },
    ]);

    expect(counts.get(3)).toBe(2);
    expect(counts.has(4)).toBe(false);
  });
});

describe('getStaleNodeIds', () => {
  it('keeps ancestors of an active leaf fresh even with no direct members', () => {
    const stale = getStaleNodeIds(NODES, new Map([[3, 1]]));

    expect(stale.has(1)).toBe(false);
    expect(stale.has(2)).toBe(false);
    expect(stale.has(3)).toBe(false);
    expect(stale.has(4)).toBe(true);
  });

  it('marks a whole branch stale when only inactive employees remain', () => {
    const stale = getStaleNodeIds(NODES, new Map());

    expect(stale.has(1)).toBe(true);
    expect(stale.has(2)).toBe(true);
    expect(stale.has(3)).toBe(true);
    expect(stale.has(4)).toBe(true);
  });

  it('treats a directly-populated parent as fresh even when all children are stale', () => {
    const stale = getStaleNodeIds(NODES, new Map([[1, 1]]));

    expect(stale.has(1)).toBe(false);
    expect(stale.has(2)).toBe(true);
    expect(stale.has(3)).toBe(true);
  });

  // The parent FK cannot express acyclicity. A corrupt cycle must neither
  // overflow the stack nor be flagged stale while a member holds active staff.
  it('terminates on a parent cycle and keeps an active cycle fresh', () => {
    const cyclic = [
      node(10, 'division', 'A', 11),
      node(11, 'business_unit', 'B', 10),
    ];

    const stale = getStaleNodeIds(cyclic, new Map([[10, 1]]));

    expect(stale.has(10)).toBe(false);
    expect(stale.has(11)).toBe(false);
  });
});
