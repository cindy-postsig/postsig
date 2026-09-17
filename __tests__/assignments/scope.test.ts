import {
  childrenOfScope,
  descendantIds,
  employeeIdsInScope,
  scopePath,
  unitPathOf,
  unitPaths,
} from '@/lib/v2/assignments/scope';
import type { OrgUnitLevel } from '@/lib/v2/org-units/levels';
import type { AssignmentNode } from '@/lib/v2/assignments/types';
import { FIRMWIDE } from '@/lib/v2/assignments/types';

function node(
  id: number,
  name: string,
  parentId: number | null,
  childIds: number[],
  memberIds: number[] = [],
  level: OrgUnitLevel = 'department',
): AssignmentNode {
  return {
    id,
    name,
    level,
    levelLabel: 'Department',
    parentId,
    childIds,
    memberIds,
    headcount: memberIds.length,
  };
}

// 1 Markets -> 2 Rates -> 4 Sterling, and 3 Credit. People hang off leaves,
// except one attached to Markets itself (a ragged HR path).
const NODES: Record<number, AssignmentNode> = {
  1: node(1, 'Markets', null, [2, 3], [90]),
  2: node(2, 'Rates', 1, [4], [91]),
  3: node(3, 'Credit', 1, [], [92]),
  4: node(4, 'Sterling', 2, [], [93]),
};

describe('descendantIds', () => {
  it('returns the node and everything below it', () => {
    expect(descendantIds(NODES, 1).sort()).toEqual([1, 2, 3, 4]);
    expect(descendantIds(NODES, 2).sort()).toEqual([2, 4]);
    expect(descendantIds(NODES, 3)).toEqual([3]);
  });

  it('terminates on a corrupt parent chain rather than hanging', () => {
    const cyclic: Record<number, AssignmentNode> = {
      1: node(1, 'A', 2, [2]),
      2: node(2, 'B', 1, [1]),
    };
    expect(descendantIds(cyclic, 1).sort()).toEqual([1, 2]);
  });

  it('ignores a child id with no node behind it', () => {
    const dangling = { 1: node(1, 'A', null, [2, 99]), 2: node(2, 'B', 1, []) };
    expect(descendantIds(dangling, 1).sort()).toEqual([1, 2]);
  });
});

describe('employeeIdsInScope', () => {
  it('collects everyone in the subtree, ragged paths included', () => {
    expect(employeeIdsInScope(NODES, 1, []).sort()).toEqual([90, 91, 92, 93]);
    expect(employeeIdsInScope(NODES, 2, []).sort()).toEqual([91, 93]);
  });

  it('is every employee at Firmwide, including those outside the tree', () => {
    expect(
      employeeIdsInScope(NODES, FIRMWIDE, [90, 91, 92, 93, 94]).sort(),
    ).toEqual([90, 91, 92, 93, 94]);
  });
});

describe('scopePath', () => {
  it('reads root-first and ends at the node itself', () => {
    expect(scopePath(NODES, 4).map((n) => n.name)).toEqual([
      'Markets',
      'Rates',
      'Sterling',
    ]);
  });

  it('is empty for an id no node claims', () => {
    expect(scopePath(NODES, 999)).toEqual([]);
  });
});

describe('unitPaths', () => {
  // Markets (entity) -> Rates (department) -> Sterling (team): a ragged chain,
  // with no division or business unit between them.
  const LEVELLED: Record<number, AssignmentNode> = {
    1: node(1, 'Markets', null, [2], [], 'entity'),
    2: node(2, 'Rates', 1, [4], [], 'department'),
    4: node(4, 'Sterling', 2, [], [], 'team'),
  };

  it('reads root-first and ends at the unit itself', () => {
    expect(unitPathOf(unitPaths(LEVELLED), 4).path).toEqual([
      'Markets',
      'Rates',
      'Sterling',
    ]);
  });

  it('keys one name per level, skipping the levels the chain has none of', () => {
    expect(unitPathOf(unitPaths(LEVELLED), 4).pathByLevel).toEqual({
      entity: 'Markets',
      department: 'Rates',
      team: 'Sterling',
    });
  });

  it('is empty for someone outside the tree and for a unit no node claims', () => {
    const paths = unitPaths(LEVELLED);
    expect(unitPathOf(paths, null)).toEqual({ path: [], pathByLevel: {} });
    expect(unitPathOf(paths, 999)).toEqual({ path: [], pathByLevel: {} });
  });

  it('terminates on a corrupt parent chain rather than hanging', () => {
    const cyclic: Record<number, AssignmentNode> = {
      1: node(1, 'A', 2, [2]),
      2: node(2, 'B', 1, [1]),
    };
    const paths = unitPaths(cyclic);
    expect(unitPathOf(paths, 1).path).toEqual(['B', 'A']);
    expect(unitPathOf(paths, 2).path).toEqual(['B']);
  });
});

describe('childrenOfScope', () => {
  it('lists child units and then the node’s own people', () => {
    expect(childrenOfScope(NODES, 1, [1])).toEqual({
      unitIds: [2, 3],
      memberIds: [90],
    });
  });

  it('gives Firmwide the roots plus anyone no node claims', () => {
    // Without the unplaced people the roots would not sum to the whole org.
    expect(childrenOfScope(NODES, FIRMWIDE, [1], [94])).toEqual({
      unitIds: [1],
      memberIds: [94],
    });
  });
});
