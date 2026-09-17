import { rollupToLevel, type ResolvedLine } from '@/lib/v2/cost-allocation';
import type { OrgUnitNode } from '@/lib/v2/org-units';

const NODES: OrgUnitNode[] = [
  { id: 1, level: 'entity', name: 'Berenberg', parent_id: null },
  { id: 2, level: 'business_group', name: 'Investment Bank', parent_id: 1 },
  { id: 3, level: 'division', name: 'Markets', parent_id: 2 },
  { id: 4, level: 'business_unit', name: 'European Markets', parent_id: 3 },
  { id: 5, level: 'department', name: 'Equity Sales', parent_id: 4 },
  { id: 6, level: 'team', name: 'Risk Arb', parent_id: 5 },
  {
    id: 7,
    level: 'cost_center',
    name: '70133 - Sales Trading',
    parent_id: null,
  },
  // Ragged branch: a department parented straight to a division.
  { id: 10, level: 'division', name: 'Wealth', parent_id: null },
  { id: 11, level: 'department', name: 'Advisory', parent_id: 10 },
];

const unitsById = new Map(NODES.map((node) => [node.id, node]));

const unitLine = (id: number, percent = 100): ResolvedLine => {
  const node = NODES.find((n) => n.id === id);
  if (!node) throw new Error(`no fixture node ${id}`);
  return {
    target: { kind: 'org_unit', id: node.id, name: node.name },
    percent,
  };
};

const employeeLine = (
  orgUnitId: number | null,
  percent = 100,
  costCenterUnitId: number | null = null,
): ResolvedLine => ({
  target: {
    kind: 'employee',
    id: 900,
    name: 'Alice Aachen',
    orgUnitId,
    costCenterUnitId,
  },
  percent,
});

describe('rollupToLevel', () => {
  it('rolls a team-targeted line to its ancestor at every level, direct only at the team itself', () => {
    const line = unitLine(6, 40);

    expect(rollupToLevel([line], 'team', unitsById)).toEqual([
      {
        target: { kind: 'org_unit', id: 6, name: 'Risk Arb' },
        percent: 40,
        direct: true,
      },
    ]);
    const expectations: Array<[string, number, string]> = [
      ['department', 5, 'Equity Sales'],
      ['business_unit', 4, 'European Markets'],
      ['division', 3, 'Markets'],
      ['business_group', 2, 'Investment Bank'],
      ['entity', 1, 'Berenberg'],
    ];
    for (const [level, id, name] of expectations) {
      expect(
        rollupToLevel([line], level as OrgUnitNode['level'], unitsById),
      ).toEqual([
        { target: { kind: 'org_unit', id, name }, percent: 40, direct: false },
      ]);
    }
  });

  it('rolls an employee through its leaf: rollup even at the leaf level itself', () => {
    const line = employeeLine(6, 25);

    expect(rollupToLevel([line], 'team', unitsById)).toEqual([
      {
        target: { kind: 'org_unit', id: 6, name: 'Risk Arb' },
        percent: 25,
        direct: false,
      },
    ]);
    expect(rollupToLevel([line], 'department', unitsById)).toEqual([
      {
        target: { kind: 'org_unit', id: 5, name: 'Equity Sales' },
        percent: 25,
        direct: false,
      },
    ]);
  });

  it('a target above the requested level lands nowhere: an entity is not a department', () => {
    const line = unitLine(1, 100);

    expect(rollupToLevel([line], 'department', unitsById)).toEqual([
      { target: null, percent: 100, direct: false },
    ]);
  });

  // Phase 4b revised the 2a pin "cost centers never roll" per decision Q2b:
  // a CC-targeted line still never rolls to a tree level, but at the
  // cost-center level employee lines now roll to their cost center.
  it('cost-center targets land nowhere at a tree level and are direct on themselves in the cost-center view', () => {
    const line = unitLine(7, 100);

    for (const level of ['entity', 'department', 'team'] as const) {
      expect(rollupToLevel([line], level, unitsById)).toEqual([
        { target: null, percent: 100, direct: false },
      ]);
    }
    expect(rollupToLevel([line], 'cost_center', unitsById)).toEqual([
      {
        target: { kind: 'org_unit', id: 7, name: '70133 - Sales Trading' },
        percent: 100,
        direct: true,
      },
    ]);
  });

  describe('cost-center level routing (decision Q2b)', () => {
    it('routes an employee line to the node matching its cost-center value as rolled spend', () => {
      const line = employeeLine(6, 30, 7);

      expect(rollupToLevel([line], 'cost_center', unitsById)).toEqual([
        {
          target: { kind: 'org_unit', id: 7, name: '70133 - Sales Trading' },
          percent: 30,
          direct: false,
        },
      ]);
    });

    it('routes through the cost-center value even for an employee outside the tree', () => {
      const line = employeeLine(null, 30, 7);

      expect(rollupToLevel([line], 'cost_center', unitsById)).toEqual([
        {
          target: { kind: 'org_unit', id: 7, name: '70133 - Sales Trading' },
          percent: 30,
          direct: false,
        },
      ]);
    });

    it('lands an employee with no cost-center value nowhere: non-routable', () => {
      const line = employeeLine(6, 30, null);

      expect(rollupToLevel([line], 'cost_center', unitsById)).toEqual([
        { target: null, percent: 30, direct: false },
      ]);
    });

    it('lands a tree-node line nowhere: a department cannot map to one cost center', () => {
      const line = unitLine(5, 100);

      expect(rollupToLevel([line], 'cost_center', unitsById)).toEqual([
        { target: null, percent: 100, direct: false },
      ]);
    });

    it('does not change tree-level routing: the cost-center value is ignored above the cost-center level', () => {
      const line = employeeLine(6, 25, 7);

      expect(rollupToLevel([line], 'department', unitsById)).toEqual([
        {
          target: { kind: 'org_unit', id: 5, name: 'Equity Sales' },
          percent: 25,
          direct: false,
        },
      ]);
      expect(
        rollupToLevel([employeeLine(null, 25, 7)], 'department', unitsById),
      ).toEqual([{ target: null, percent: 25, direct: false }]);
    });
  });

  it('a ragged branch with no node at the requested level lands nowhere', () => {
    const line = unitLine(11, 100);

    // The branch skips business_unit entirely, so there is nothing to name
    // there; the division above it still catches the line.
    expect(rollupToLevel([line], 'business_unit', unitsById)).toEqual([
      { target: null, percent: 100, direct: false },
    ]);
    expect(rollupToLevel([line], 'division', unitsById)).toEqual([
      {
        target: { kind: 'org_unit', id: 10, name: 'Wealth' },
        percent: 100,
        direct: false,
      },
    ]);
  });

  it('an employee outside the tree lands nowhere: a person is not an org unit', () => {
    const line = employeeLine(null, 100);

    expect(rollupToLevel([line], 'department', unitsById)).toEqual([
      { target: null, percent: 100, direct: false },
    ]);
  });
});
