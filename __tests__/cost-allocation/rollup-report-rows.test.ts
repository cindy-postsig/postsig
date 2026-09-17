import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import type { PickerEmployee } from '@/lib/v2/cost-allocation/picker';
import {
  applyBudgetEdit,
  buildAllocationRollup,
  flattenRollupView,
  isFlatRollup,
  searchRollupRows,
  UNRESOLVED_TARGET_LABEL,
  type RollupBuildInput,
  type RollupViewKey,
} from '@/lib/v2/cost-allocation/rollup-report-rows';
import {
  ORG_UNIT_TREE_LEVELS,
  type OrgUnitTreeLevel,
} from '@/lib/v2/org-units/levels';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';

const FULL_ORDER = [...ORG_UNIT_TREE_LEVELS];

const node = (
  id: number,
  level: OrgUnitNode['level'],
  name: string,
  parentId: number | null = null,
): OrgUnitNode => ({ id, level, name, parent_id: parentId });

const employee = (
  id: number,
  name: string,
  overrides: Partial<PickerEmployee> = {},
): PickerEmployee => ({
  id,
  name,
  status: 'active',
  deleted_at: null,
  org_unit_id: null,
  cost_center: null,
  ...overrides,
});

function build(
  units: OrgUnitNode[],
  employees: PickerEmployee[],
  targetTotals: Record<string, number>,
  budgets: Record<string, number> = {},
  levelOrder: OrgUnitTreeLevel[] = FULL_ORDER,
) {
  const ctx = buildAllocationContext({
    allocations: [],
    lines: [],
    units,
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      deleted_at: e.deleted_at,
      org_unit_id: e.org_unit_id,
      cost_center: e.cost_center,
    })),
    seats: [],
    relationships: [],
  });
  const input: RollupBuildInput = {
    targetTotals: new Map(Object.entries(targetTotals)),
    unitsById: ctx.unitsById,
    employeesById: ctx.employeesById,
    levelOrder,
    employees,
    budgetByKey: new Map(Object.entries(budgets)),
  };
  return buildAllocationRollup(input);
}

// Berenberg-shaped: a full path, a ragged division root, a stale branch, and
// flat cost centers.
const BERENBERG_UNITS: OrgUnitNode[] = [
  node(1, 'entity', 'Berenberg'),
  node(2, 'business_group', 'Investment Bank', 1),
  node(3, 'division', 'Markets', 2),
  node(4, 'business_unit', 'European Markets', 3),
  node(5, 'department', 'Equity Sales', 4),
  node(6, 'team', 'Risk Arb', 5),
  node(7, 'cost_center', '70133 - Sales Trading'),
  node(8, 'cost_center', '70200 - Research'),
  node(9, 'cost_center', '70999 - Old'),
  node(10, 'division', 'Wealth'),
  node(11, 'department', 'Advisory', 10),
  node(12, 'business_group', 'Private Bank', 1),
  node(13, 'department', 'Stale Dept', 12),
];

const BERENBERG_EMPLOYEES: PickerEmployee[] = [
  employee(900, 'Alice Aachen', {
    org_unit_id: 6,
    cost_center: '70133 - Sales Trading',
  }),
  employee(901, 'Bob Berlin', { org_unit_id: 11 }),
  employee(902, 'Carol Cork', { cost_center: '70200 - Research' }),
  employee(903, 'Dave Departed', {
    org_unit_id: 13,
    cost_center: '70999 - Old',
    status: 'departed',
  }),
];

const BERENBERG_TOTALS = {
  'unit:6': 100,
  'unit:5': 50,
  'unit:1': 30,
  'unit:7': 20,
  'unit:11': 15,
  'user:900': 10,
  'user:901': 5,
  'user:902': 7,
  unassigned: 40,
  'unit:9999': 3,
};

const BERENBERG_BUDGETS = {
  'unit:1': 5000,
  'unit:5': 1000,
  'unit:6': 400,
  'unit:11': 100,
};

const GRAND_TOTAL = 280;

describe('buildAllocationRollup — Berenberg-shaped org', () => {
  const data = build(
    BERENBERG_UNITS,
    BERENBERG_EMPLOYEES,
    BERENBERG_TOTALS,
    BERENBERG_BUDGETS,
  );
  const view = (key: RollupViewKey) => {
    const found = data.views.find((v) => v.key === key);
    if (!found) throw new Error(`no view ${key}`);
    return found;
  };

  it('offers every tree level in use in org order, then the Cost Center and Users views', () => {
    expect(data.views.map((v) => v.key)).toEqual([
      'entity',
      'business_group',
      'division',
      'business_unit',
      'department',
      'team',
      'cost_center',
      'user',
    ]);
    expect(view('cost_center').label).toBe('Cost Centers');
    expect(view('user').label).toBe('Users');
  });

  it("nests each employee under their unit as the tree's bottom level, carrying only their own lines", () => {
    expect(data.rows['unit:6'].childKeys).toEqual(['user:900']);
    expect(data.rows['user:900']).toEqual(
      expect.objectContaining({
        level: 'user',
        levelLabel: 'User',
        direct: 10,
        rollup: 0,
        total: 10,
        stale: false,
        target: { kind: 'employee', id: 900 },
        path: [
          'Berenberg',
          'Investment Bank',
          'Markets',
          'European Markets',
          'Equity Sales',
          'Risk Arb',
          'Alice Aachen',
        ],
      }),
    );
    expect(data.rows['unit:11'].childKeys).toEqual(['user:901']);
    // No unit assignment: a Users-view row only.
    expect(data.rows['user:902'].path).toEqual(['Carol Cork']);
    // Departed with no spend or budget: not a row at all.
    expect(data.rows['user:903']).toBeUndefined();
    expect(data.rows['unit:13'].childKeys).toEqual([]);
    // The unit already counted the person as rollup; nesting moves nothing.
    expect(data.rows['unit:6']).toEqual(
      expect.objectContaining({ direct: 100, rollup: 10, total: 110 }),
    );
  });

  it('Users view: people flat with their own lines; unit and cost-center lines sit outside', () => {
    const users = view('user');
    expect(users.rootKeys).toEqual(['user:900', 'user:901', 'user:902']);
    expect(users.outsideHierarchy).toBe(100 + 50 + 30 + 20 + 15 + 3);
    expect(users.unassigned).toBe(40);
    expect(users.spendTotal).toBe(GRAND_TOTAL);
    expect(users.budgetTotal).toBe(0);
  });

  it("rolls a person's budget into the units above them", () => {
    const budgeted = build(
      BERENBERG_UNITS,
      BERENBERG_EMPLOYEES,
      BERENBERG_TOTALS,
      {
        ...BERENBERG_BUDGETS,
        'user:900': 250,
      },
    );
    expect(budgeted.rows['user:900']).toEqual(
      expect.objectContaining({ budget: 250, difference: 240 }),
    );
    expect(budgeted.rows['unit:6'].rolledUpBudget).toBe(250);
    expect(budgeted.rows['unit:5'].rolledUpBudget).toBe(650);
    expect(budgeted.rows['unit:1'].rolledUpBudget).toBe(1650);
    const viewOf = (key: RollupViewKey) =>
      budgeted.views.find((v) => v.key === key)?.budgetTotal;
    expect(viewOf('entity')).toBe(6650);
    expect(viewOf('user')).toBe(250);
  });

  it('keeps an inactive employee as a stale row only while spend or a budget points at them', () => {
    const withSpend = build(BERENBERG_UNITS, BERENBERG_EMPLOYEES, {
      ...BERENBERG_TOTALS,
      'user:903': 6,
    });
    expect(withSpend.rows['user:903']).toEqual(
      expect.objectContaining({ stale: true, direct: 6, rollup: 0, total: 6 }),
    );
    expect(withSpend.rows['unit:13'].childKeys).toEqual(['user:903']);
    expect(withSpend.views.find((v) => v.key === 'user')?.rootKeys).toContain(
      'user:903',
    );

    const withBudget = build(
      BERENBERG_UNITS,
      BERENBERG_EMPLOYEES,
      BERENBERG_TOTALS,
      { 'user:903': 90 },
    );
    expect(withBudget.rows['user:903']).toEqual(
      expect.objectContaining({
        stale: true,
        total: 0,
        budget: 90,
        difference: 90,
      }),
    );
    expect(withBudget.rows['unit:13'].rolledUpBudget).toBe(90);
  });

  it('splits a node into direct (its own lines) and rollup (lines below it, employees included)', () => {
    const berenberg = data.rows['unit:1'];
    expect(berenberg.direct).toBe(30);
    expect(berenberg.rollup).toBe(160);
    expect(berenberg.total).toBe(190);

    const equitySales = data.rows['unit:5'];
    expect(equitySales.direct).toBe(50);
    expect(equitySales.rollup).toBe(110);
    expect(equitySales.total).toBe(160);

    // An employee whose leaf IS the node counts as rolled, not direct.
    const riskArb = data.rows['unit:6'];
    expect(riskArb.direct).toBe(100);
    expect(riskArb.rollup).toBe(10);
  });

  it('reads the same node figures in every view it appears in', () => {
    const entityRows = flattenRollupView(data.rows, view('entity').rootKeys);
    const inEntityView = entityRows.find((r) => r.row.key === 'unit:5');
    expect(inEntityView?.depth).toBe(4);
    expect(inEntityView?.row).toBe(data.rows['unit:5']);
    expect(view('department').rootKeys).toContain('unit:5');
  });

  it('routes what a tree view cannot place to Outside hierarchy, and reconciles to the grand total', () => {
    // Entity view: Wealth's ragged branch, the cost-center line, the employee
    // outside the tree, and an unresolvable key all sit outside.
    expect(view('entity').outsideHierarchy).toBe(15 + 5 + 20 + 7 + 3);
    // Department view: the entity line sits above the level.
    expect(view('department').outsideHierarchy).toBe(30 + 20 + 7 + 3);
    for (const v of data.views) {
      expect(v.unassigned).toBe(40);
      expect(v.spendTotal).toBe(GRAND_TOTAL);
    }
  });

  it('labels each Outside hierarchy row with the kind of target it is', () => {
    const rows = view('department').outsideHierarchyRows;
    const labelFor = (name: string) =>
      rows.find((row) => row.name === name)?.levelLabel;

    // The bucket mixes kinds, so a name alone cannot say what it is.
    expect(new Set(rows.map((row) => row.levelLabel)).size).toBeGreaterThan(1);
    expect(labelFor(UNRESOLVED_TARGET_LABEL)).toBeUndefined();
  });

  it('cost-center view: CC lines are direct, employee lines roll in via their cost-center value', () => {
    const cc = view('cost_center');
    expect(cc.rootKeys).toEqual(['unit:7', 'unit:8', 'unit:9']);
    expect(data.rows['unit:7']).toEqual(
      expect.objectContaining({ direct: 20, rollup: 10, total: 30 }),
    );
    expect(data.rows['unit:8']).toEqual(
      expect.objectContaining({ direct: 0, rollup: 7, total: 7 }),
    );
    // Tree-node lines and the employee with no cost-center value are outside.
    expect(cc.outsideHierarchy).toBe(100 + 50 + 30 + 15 + 5 + 3);
    expect(cc.spendTotal).toBe(GRAND_TOTAL);
  });

  it('rolls up descendant budgets and compares each node against its own budget', () => {
    expect(data.rows['unit:1']).toEqual(
      expect.objectContaining({
        budget: 5000,
        rolledUpBudget: 1400,
        difference: 5000 - 190,
      }),
    );
    expect(data.rows['unit:2']).toEqual(
      expect.objectContaining({
        budget: null,
        rolledUpBudget: 1400,
        difference: null,
      }),
    );
    expect(data.rows['unit:6']).toEqual(
      expect.objectContaining({
        budget: 400,
        rolledUpBudget: 0,
        difference: 400 - 110,
      }),
    );
    expect(view('entity').budgetTotal).toBe(6400);
    expect(view('department').budgetTotal).toBe(1500);
  });

  it('marks stale tree nodes from active leaf assignments and stale cost centers from cost_center values', () => {
    expect(data.rows['unit:13'].stale).toBe(true);
    expect(data.rows['unit:12'].stale).toBe(true);
    expect(data.rows['unit:1'].stale).toBe(false);
    expect(data.rows['unit:11'].stale).toBe(false);
    expect(data.rows['unit:7'].stale).toBe(false);
    expect(data.rows['unit:8'].stale).toBe(false);
    expect(data.rows['unit:9'].stale).toBe(true);
  });

  it('orders children and roots by name and carries the breadcrumb', () => {
    expect(data.rows['unit:1'].childKeys).toEqual(['unit:2', 'unit:12']);
    expect(view('department').rootKeys).toEqual([
      'unit:11',
      'unit:5',
      'unit:13',
    ]);
    expect(data.rows['unit:6'].path).toEqual([
      'Berenberg',
      'Investment Bank',
      'Markets',
      'European Markets',
      'Equity Sales',
      'Risk Arb',
    ]);
    expect(data.rows['unit:7'].path).toEqual(['70133 - Sales Trading']);
  });

  it('stamps a breadcrumb only on same-level twins, and orders them by it among the roots', () => {
    const twins = build(
      [
        node(1, 'entity', 'Bank'),
        node(2, 'business_group', 'Wealth', 1),
        node(3, 'business_group', 'Markets', 1),
        node(4, 'department', 'Research', 2),
        node(5, 'department', 'Research', 3),
        node(6, 'department', 'Ops', 3),
      ],
      [],
      { 'unit:4': 10, 'unit:5': 20 },
      {},
      ['entity', 'business_group', 'department'],
    );

    expect(twins.rows['unit:4'].breadcrumb).toBe('Wealth · Bank');
    expect(twins.rows['unit:5'].breadcrumb).toBe('Markets · Bank');
    expect(twins.rows['unit:6'].breadcrumb).toBeUndefined();
    // Ops, then the two Researches in the order of the parents that tell
    // them apart — Markets before Wealth.
    expect(
      twins.views.find((view) => view.key === 'department')?.rootKeys,
    ).toEqual(['unit:6', 'unit:5', 'unit:4']);
  });

  it('derives the slicer from the org level order, never from every level with data', () => {
    const sliced = build(
      BERENBERG_UNITS,
      BERENBERG_EMPLOYEES,
      BERENBERG_TOTALS,
      {},
      ['entity', 'department', 'team'],
    );
    expect(sliced.views.map((v) => v.key)).toEqual([
      'entity',
      'department',
      'team',
      'cost_center',
      'user',
    ]);
    // A preferred level with no nodes is not a view.
    const sparse = build(
      [node(1, 'entity', 'Bank'), node(2, 'department', 'Ops', 1)],
      [],
      {},
      {},
      ['entity', 'division', 'department'],
    );
    expect(sparse.views.map((v) => v.key)).toEqual(['entity', 'department']);
    expect(isFlatRollup(sliced)).toBe(false);
  });

  it('flattens depth-first honouring the expansion state', () => {
    const collapsed = flattenRollupView(
      data.rows,
      view('entity').rootKeys,
      () => false,
    );
    expect(collapsed.map((r) => r.row.key)).toEqual(['unit:1']);
    const partial = flattenRollupView(
      data.rows,
      view('entity').rootKeys,
      (key) => key === 'unit:1',
    );
    expect(partial.map((r) => [r.row.key, r.depth])).toEqual([
      ['unit:1', 0],
      ['unit:2', 1],
      ['unit:12', 1],
    ]);
  });
});

describe('buildAllocationRollup — degraded shapes (§Fallback matrix)', () => {
  it('Sucden-shaped (entity / department / cost centers): two tree views plus flat cost centers', () => {
    const data = build(
      [
        node(1, 'entity', 'Sucden'),
        node(2, 'department', 'Trading', 1),
        node(3, 'department', 'Finance', 1),
        node(4, 'cost_center', 'CC-100'),
      ],
      [
        employee(10, 'Ann', { org_unit_id: 2, cost_center: 'CC-100' }),
        employee(11, 'Ben', { org_unit_id: 3 }),
      ],
      { 'unit:2': 100, 'user:11': 20, 'unit:4': 5, unassigned: 1 },
      {},
      ['entity', 'department'],
    );
    expect(data.views.map((v) => v.key)).toEqual([
      'entity',
      'department',
      'cost_center',
      'user',
    ]);
    expect(data.rows['unit:1']).toEqual(
      expect.objectContaining({ direct: 0, rollup: 120, total: 120 }),
    );
    expect(data.rows['unit:3']).toEqual(
      expect.objectContaining({ direct: 0, rollup: 20, total: 20 }),
    );
    expect(data.rows['unit:2'].childKeys).toEqual(['user:10']);
    expect(data.rows['unit:3'].childKeys).toEqual(['user:11']);
    expect(data.views.map((v) => v.spendTotal)).toEqual([126, 126, 126, 126]);
    expect(isFlatRollup(data)).toBe(false);
  });

  it('departments only: people nest under their department, and the Users view sits beside it', () => {
    const data = build(
      [node(1, 'department', 'Ops'), node(2, 'department', 'Sales')],
      [employee(10, 'Ann', { org_unit_id: 1 })],
      { 'unit:2': 50, 'user:10': 8 },
      { 'unit:1': 100 },
      ['department'],
    );
    expect(data.views.map((v) => v.key)).toEqual(['department', 'user']);
    expect(isFlatRollup(data)).toBe(false);
    expect(data.rows['unit:1']).toEqual(
      expect.objectContaining({
        direct: 0,
        rollup: 8,
        total: 8,
        budget: 100,
        childKeys: ['user:10'],
      }),
    );
    expect(data.rows['user:10']).toEqual(
      expect.objectContaining({ direct: 8, rollup: 0, total: 8 }),
    );
    expect(data.views.map((v) => v.spendTotal)).toEqual([58, 58]);
    expect(data.views[1].outsideHierarchy).toBe(50);
  });

  it('a single level with nobody assigned: one flat view with nothing to expand', () => {
    const data = build(
      [node(1, 'department', 'Ops'), node(2, 'department', 'Sales')],
      [],
      { 'unit:2': 50 },
      { 'unit:1': 100 },
      ['department'],
    );
    expect(data.views.map((v) => v.key)).toEqual(['department']);
    expect(isFlatRollup(data)).toBe(true);
  });

  it('D1-shaped (employees, no levels): a flat Users view, inactive employees only when they carry spend or budget', () => {
    const data = build(
      [],
      [
        employee(10, 'Zed'),
        employee(11, 'Amy'),
        employee(12, 'Gone', { status: 'departed' }),
        employee(13, 'Quiet Leaver', { status: 'departed' }),
      ],
      { 'user:10': 30, 'user:12': 4, 'unit:77': 9, unassigned: 2 },
      { 'user:11': 500 },
    );
    expect(data.views.map((v) => v.key)).toEqual(['user']);
    expect(isFlatRollup(data)).toBe(true);
    expect(data.views[0].rootKeys).toEqual(['user:11', 'user:12', 'user:10']);
    expect(data.rows['user:10']).toEqual(
      expect.objectContaining({
        level: 'user',
        direct: 30,
        rollup: 0,
        total: 30,
        stale: false,
        path: ['Zed'],
      }),
    );
    expect(data.rows['user:12'].stale).toBe(true);
    expect(data.rows['user:11']).toEqual(
      expect.objectContaining({ budget: 500, difference: 500 }),
    );
    expect(data.views[0].outsideHierarchy).toBe(9);
    expect(data.views[0].spendTotal).toBe(45);
  });

  it('no employees, no nodes: no views (the empty state)', () => {
    const data = build([], [], { unassigned: 12 });
    expect(data.views).toEqual([]);
    expect(data.rows).toEqual({});
  });

  it('groups only (Causeway-shaped): a person in no group leaves the groups as leaves; the Users view still lists them', () => {
    const data = build(
      [node(1, 'business_group', 'Ops'), node(2, 'business_group', 'Tech')],
      [employee(10, 'Only One')],
      { 'unit:1': 10, 'unit:2': 20, 'user:10': 5 },
      {},
      ['business_group'],
    );
    expect(data.views.map((v) => v.key)).toEqual(['business_group', 'user']);
    expect(isFlatRollup(data)).toBe(false);
    expect(data.rows['unit:1'].stale).toBe(true);
    expect(data.rows['unit:1'].childKeys).toEqual([]);
    expect(data.views[0].outsideHierarchy).toBe(5);
    expect(data.views[1].rootKeys).toEqual(['user:10']);
    expect(data.views[1].outsideHierarchy).toBe(30);
  });
});

// Deterministic PRNG so a failure reproduces from its seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFixture(seed: number) {
  const rand = mulberry32(seed);
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(rand() * items.length)];
  const cents = (n: number) => Math.round(n * 100) / 100;

  // A random subset of levels in canonical order; paths may be ragged.
  const levels = FULL_ORDER.filter(() => rand() < 0.7);
  const units: OrgUnitNode[] = [];
  let nextId = 1;
  const nodesAtDepth: OrgUnitNode[][] = [];
  levels.forEach((level, depth) => {
    const parents = depth === 0 ? [null] : nodesAtDepth[depth - 1];
    const created: OrgUnitNode[] = [];
    for (const parent of parents) {
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        // Ragged: sometimes skip a level by parenting to the grandparent row.
        const parentId =
          parent === null
            ? null
            : rand() < 0.15 && parent.parent_id !== null
              ? parent.parent_id
              : parent.id;
        const unit = node(nextId++, level, `${level} ${nextId}`, parentId);
        units.push(unit);
        created.push(unit);
      }
    }
    nodesAtDepth.push(created);
  });
  const costCenters: OrgUnitNode[] = [];
  const ccCount = Math.floor(rand() * 4);
  for (let i = 0; i < ccCount; i++) {
    const cc = node(nextId++, 'cost_center', `CC-${nextId}`);
    units.push(cc);
    costCenters.push(cc);
  }

  const treeNodes = units.filter((u) => u.level !== 'cost_center');
  const employees: PickerEmployee[] = [];
  const employeeCount = Math.floor(rand() * 8);
  for (let i = 0; i < employeeCount; i++) {
    const leaf = treeNodes.length > 0 && rand() < 0.8 ? pick(treeNodes) : null;
    const cc =
      costCenters.length > 0 && rand() < 0.6 ? pick(costCenters) : null;
    employees.push(
      employee(500 + i, `Employee ${i}`, {
        org_unit_id: leaf?.id ?? null,
        // A value with no node: non-routable, must land outside.
        cost_center: cc ? cc.name : rand() < 0.2 ? 'NO-SUCH-CC' : null,
        status: rand() < 0.85 ? 'active' : 'departed',
      }),
    );
  }

  const targetTotals: Record<string, number> = {};
  const targetCount = Math.floor(rand() * 12);
  for (let i = 0; i < targetCount; i++) {
    const roll = rand();
    const key =
      roll < 0.5 && units.length > 0
        ? `unit:${pick(units).id}`
        : roll < 0.9 && employees.length > 0
          ? `user:${pick(employees).id}`
          : 'unassigned';
    targetTotals[key] = cents((targetTotals[key] ?? 0) + rand() * 10000 - 1000);
  }
  if (rand() < 0.5) targetTotals.unassigned = cents(rand() * 5000);
  if (rand() < 0.3) targetTotals['unit:99999'] = cents(rand() * 100);

  const budgets: Record<string, number> = {};
  for (const unit of units) {
    if (rand() < 0.3) budgets[`unit:${unit.id}`] = cents(rand() * 20000);
  }
  const levelOrder = levels.filter(() => rand() < 0.85);
  return { units, employees, targetTotals, budgets, levelOrder };
}

describe('reconciliation invariant (decisions Q2/Q2b)', () => {
  it('every view — each tree level and the Cost Center view — totals to the same number', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const fixture = randomFixture(seed);
      const data = build(
        fixture.units,
        fixture.employees,
        fixture.targetTotals,
        fixture.budgets,
        fixture.levelOrder,
      );
      const expected =
        Math.round(
          Object.values(fixture.targetTotals).reduce((s, v) => s + v, 0) * 100,
        ) / 100;
      for (const view of data.views) {
        const rootSum = view.rootKeys.reduce(
          (sum, key) => sum + data.rows[key].total,
          0,
        );
        const reconciled =
          Math.round(
            (rootSum + view.outsideHierarchy + view.unassigned) * 100,
          ) / 100;
        expect({ seed, view: view.key, total: view.spendTotal }).toEqual({
          seed,
          view: view.key,
          total: expected,
        });
        expect({ seed, view: view.key, reconciled }).toEqual({
          seed,
          view: view.key,
          reconciled: expected,
        });
      }
    }
  });

  it("a parent's rollup is exactly its children's totals, the people sitting on it included", () => {
    for (let seed = 300; seed <= 400; seed++) {
      const fixture = randomFixture(seed);
      const data = build(
        fixture.units,
        fixture.employees,
        fixture.targetTotals,
        {},
        fixture.levelOrder,
      );
      for (const row of Object.values(data.rows)) {
        if (row.childKeys.length === 0) continue;
        const childTotals = row.childKeys.reduce(
          (sum, key) => sum + data.rows[key].total,
          0,
        );
        expect({ seed, key: row.key, rollup: row.rollup }).toEqual({
          seed,
          key: row.key,
          rollup: Math.round(childTotals * 100) / 100,
        });
      }
    }
  });
});

describe('applyBudgetEdit', () => {
  const TOTALS = { 'unit:6': 100, 'user:900': 40, unassigned: 7 };
  const BUDGETS = { 'unit:6': 300, 'unit:3': 50 };

  it('is exactly a rebuild with the changed budget: set, change, and clear', () => {
    const built = build(BERENBERG_UNITS, BERENBERG_EMPLOYEES, TOTALS, BUDGETS);

    expect(applyBudgetEdit(built, 'unit:5', 120)).toEqual(
      build(BERENBERG_UNITS, BERENBERG_EMPLOYEES, TOTALS, {
        ...BUDGETS,
        'unit:5': 120,
      }),
    );
    expect(applyBudgetEdit(built, 'unit:6', 500)).toEqual(
      build(BERENBERG_UNITS, BERENBERG_EMPLOYEES, TOTALS, {
        ...BUDGETS,
        'unit:6': 500,
      }),
    );
    expect(applyBudgetEdit(built, 'unit:6', null)).toEqual(
      build(BERENBERG_UNITS, BERENBERG_EMPLOYEES, TOTALS, { 'unit:3': 50 }),
    );
  });

  it('matches a rebuild for a user row nested under its unit', () => {
    const built = build(BERENBERG_UNITS, BERENBERG_EMPLOYEES, TOTALS, BUDGETS);

    expect(applyBudgetEdit(built, 'user:900', 75)).toEqual(
      build(BERENBERG_UNITS, BERENBERG_EMPLOYEES, TOTALS, {
        ...BUDGETS,
        'user:900': 75,
      }),
    );
  });

  it('matches a rebuild for user rows in a no-tree org', () => {
    const employees = [employee(900, 'Alice Aachen')];
    const built = build([], employees, { 'user:900': 40 }, {});

    expect(applyBudgetEdit(built, 'user:900', 75)).toEqual(
      build([], employees, { 'user:900': 40 }, { 'user:900': 75 }),
    );
  });

  it('returns the data untouched for an unknown key or an unchanged amount', () => {
    const built = build(BERENBERG_UNITS, BERENBERG_EMPLOYEES, TOTALS, BUDGETS);

    expect(applyBudgetEdit(built, 'unit:999', 10)).toBe(built);
    expect(applyBudgetEdit(built, 'unit:6', 300)).toBe(built);
  });
});

describe('searchRollupRows', () => {
  const { rows } = build(
    BERENBERG_UNITS,
    BERENBERG_EMPLOYEES,
    BERENBERG_TOTALS,
    BERENBERG_BUDGETS,
  );
  const found = (query: string) =>
    searchRollupRows(rows, query).map((row) => [row.name, row.level]);

  it('matches any level, case-insensitively, once each and by name', () => {
    // Markets is a root of the Divisions view and a child under Investment
    // Bank in the Entities view; a search lists it once either way.
    expect(searchRollupRows(rows, 'MARKETS').map((row) => row.key)).toEqual([
      'unit:4',
      'unit:3',
    ]);
    expect(found('markets')).toEqual([
      ['European Markets', 'business_unit'],
      ['Markets', 'division'],
    ]);
  });

  it('lists org units and users together', () => {
    expect(found('ber')).toEqual([
      ['Berenberg', 'entity'],
      ['Bob Berlin', 'user'],
    ]);
  });

  it('lists a user and an org unit sharing a name, each at its own level', () => {
    const shared = build(
      [node(1, 'department', 'Aurora')],
      [employee(500, 'Aurora', { org_unit_id: 1 })],
      {},
    );

    expect(
      searchRollupRows(shared.rows, 'aurora').map((row) => row.key),
    ).toEqual(['unit:1', 'user:500']);
  });

  it('cannot match the catch-alls, which are view figures rather than rows', () => {
    expect(found('unassigned')).toEqual([]);
    expect(found('outside hierarchy')).toEqual([]);
  });

  it('searches nothing on an empty or whitespace query', () => {
    expect(found('')).toEqual([]);
    expect(found('   ')).toEqual([]);
  });

  it('trims the query rather than failing to match on it', () => {
    expect(found('  wealth  ')).toEqual([['Wealth', 'division']]);
  });

  it('returns nothing for a name no row carries', () => {
    expect(found('nobody')).toEqual([]);
  });
});
