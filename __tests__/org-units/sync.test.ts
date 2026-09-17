jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  buildOrgUnitTree,
  countActiveLeafAssignments,
  getOrgHierarchyLevelOrder,
  getStaleNodeIds,
  syncOrgUnitsForEmployees,
  type OrgUnitNode,
} from '@/lib/v2/org-units';
import { FAKE_ORG_ID as ORG, FakeDb } from './fake-db';

type SyncClient = Parameters<typeof syncOrgUnitsForEmployees>[2];

let db: FakeDb;

const client = () => db.client() as SyncClient;
const sync = (
  employeeIds: number[],
  businessGroupNodeIdByEmployeeId?: ReadonlyMap<number, number | null>,
) =>
  syncOrgUnitsForEmployees(
    ORG,
    employeeIds,
    client(),
    businessGroupNodeIdByEmployeeId,
  );
const nodes = () => db.orgUnits as unknown as OrgUnitNode[];
const staleIds = () =>
  getStaleNodeIds(
    nodes(),
    countActiveLeafAssignments(
      db.orgEmployees as unknown as Parameters<
        typeof countActiveLeafAssignments
      >[0],
    ),
  );

beforeEach(() => {
  db = new FakeDb();
});

describe('syncOrgUnitsForEmployees', () => {
  it('walks a full Berenberg-shaped path and assigns the leaf', async () => {
    db.seedGroup(5, 'Investment Banking');
    const employee = db.seedEmployee({
      entity: 'Berenberg',
      group_id: 5,
      division: 'Zentralbereich Investment Bank',
      business_unit: '830000 - European Markets',
      department: '830200 - Equity Sales Trading Europe',
      team: '830201 - Risk Arb',
      cost_center: '70133 - Sales Trading Equities LD',
    });

    await sync([employee.id as number]);

    expect(db.orgUnits).toHaveLength(7);
    const entity = db.findUnit('entity', 'Berenberg');
    const group = db.findUnit('business_group', 'Investment Banking');
    const division = db.findUnit('division', 'Zentralbereich Investment Bank');
    const bu = db.findUnit('business_unit', '830000 - European Markets');
    const dept = db.findUnit(
      'department',
      '830200 - Equity Sales Trading Europe',
    );
    const team = db.findUnit('team', '830201 - Risk Arb');
    const costCenter = db.findUnit(
      'cost_center',
      '70133 - Sales Trading Equities LD',
    );

    expect(entity.parent_id).toBeNull();
    expect(group.parent_id).toBe(entity.id);
    expect(division.parent_id).toBe(group.id);
    expect(bu.parent_id).toBe(division.id);
    expect(dept.parent_id).toBe(bu.id);
    expect(team.parent_id).toBe(dept.id);

    expect(costCenter.parent_id).toBeNull();
    expect(employee.org_unit_id).toBe(team.id);
  });

  it('parents a department to the division when the business unit is absent', async () => {
    const withBu = db.seedEmployee({
      division: 'Markets',
      business_unit: 'Equities',
      department: 'Ops',
    });
    const ragged = db.seedEmployee({
      division: 'Markets',
      department: 'Research',
    });

    await sync([withBu.id as number, ragged.id as number]);

    const division = db.findUnit('division', 'Markets');
    const bu = db.findUnit('business_unit', 'Equities');
    expect(db.findUnit('department', 'Ops').parent_id).toBe(bu.id);
    expect(db.findUnit('department', 'Research').parent_id).toBe(division.id);
    expect(ragged.org_unit_id).toBe(db.findUnit('department', 'Research').id);
  });

  it('re-parents the existing node when a later upload fills in a missing level, keeping its id', async () => {
    const employee = db.seedEmployee({
      division: 'Markets',
      department: 'Research',
    });
    await sync([employee.id as number]);

    const division = db.findUnit('division', 'Markets');
    const research = db.findUnit('department', 'Research');
    expect(research.parent_id).toBe(division.id);
    expect(employee.org_unit_id).toBe(research.id);

    employee.business_unit = 'Equities';
    await sync([employee.id as number]);

    // Refinement identity: same level, same name, and the division is still
    // above it — the same target on a more precise path, never a fork.
    const bu = db.findUnit('business_unit', 'Equities');
    const moved = db.findUnit('department', 'Research');
    expect(moved.id).toBe(research.id);
    expect(moved.parent_id).toBe(bu.id);
    expect(employee.org_unit_id).toBe(research.id);
    expect(staleIds().size).toBe(0);
  });

  it('attaches a short-path employee to the refined node instead of forking', async () => {
    const pioneer = db.seedEmployee({
      division: 'Markets',
      business_unit: 'Equities',
      department: 'Research',
    });
    await sync([pioneer.id as number]);
    const research = db.findUnit('department', 'Research');

    const newcomer = db.seedEmployee({
      division: 'Markets',
      department: 'Research',
    });
    await sync([newcomer.id as number]);

    expect(newcomer.org_unit_id).toBe(research.id);
    expect(
      nodes().filter((n) => n.level === 'department' && n.name === 'Research'),
    ).toHaveLength(1);
  });

  it('keeps same-name departments under diverging branches distinct', async () => {
    const a = db.seedEmployee({
      division: 'Markets',
      business_unit: 'Equities',
      department: 'Research',
    });
    const b = db.seedEmployee({
      division: 'Markets',
      business_unit: 'Fixed Income',
      department: 'Research',
    });
    await sync([a.id as number, b.id as number]);

    const researches = nodes().filter(
      (n) => n.level === 'department' && n.name === 'Research',
    );
    expect(researches).toHaveLength(2);
    expect(a.org_unit_id).not.toBe(b.org_unit_id);
  });

  it('falls back to path identity when a short path matches two refined nodes', async () => {
    const a = db.seedEmployee({
      division: 'Markets',
      business_unit: 'Equities',
      department: 'Research',
    });
    const b = db.seedEmployee({
      division: 'Markets',
      business_unit: 'Fixed Income',
      department: 'Research',
    });
    await sync([a.id as number, b.id as number]);

    const short = db.seedEmployee({
      division: 'Markets',
      department: 'Research',
    });
    await sync([short.id as number]);

    // Which BU's Research the short path means is unknowable; an honest
    // third node under the division records exactly what the row says.
    const division = db.findUnit('division', 'Markets');
    const ambiguous = db.findUnit(
      'department',
      'Research',
      division.id as number,
    );
    expect(short.org_unit_id).toBe(ambiguous.id);
    expect(
      nodes().filter((n) => n.level === 'department' && n.name === 'Research'),
    ).toHaveLength(3);
  });

  it('leaves a shallow node alone when two branches claim it in one sync', async () => {
    const early = db.seedEmployee({
      division: 'Markets',
      department: 'Research',
    });
    await sync([early.id as number]);
    const markets = db.findUnit('division', 'Markets');
    const shallow = db.findUnit('department', 'Research');

    const a = db.seedEmployee({
      division: 'Markets',
      business_unit: 'Equities',
      department: 'Research',
    });
    const b = db.seedEmployee({
      division: 'Markets',
      business_unit: 'Fixed Income',
      department: 'Research',
    });
    await sync([a.id as number, b.id as number]);

    // Two re-parent destinations for one node in a batch is the ambiguity
    // rule: the shallow node stays where it was, each branch gets its own.
    const unmoved = db.findUnit('department', 'Research', markets.id as number);
    expect(unmoved.id).toBe(shallow.id);
    const equities = db.findUnit('business_unit', 'Equities');
    const fixedIncome = db.findUnit('business_unit', 'Fixed Income');
    const underEquities = db.findUnit(
      'department',
      'Research',
      equities.id as number,
    );
    const underFixedIncome = db.findUnit(
      'department',
      'Research',
      fixedIncome.id as number,
    );
    expect(
      new Set([shallow.id, underEquities.id, underFixedIncome.id]).size,
    ).toBe(3);
    expect(early.org_unit_id).toBe(shallow.id);
    expect(a.org_unit_id).toBe(underEquities.id);
    expect(b.org_unit_id).toBe(underFixedIncome.id);
  });

  it('stays converged across repeated uploads of mixed-precision rows', async () => {
    const short = db.seedEmployee({
      division: 'Markets',
      department: 'Research',
    });
    const long = db.seedEmployee({
      division: 'Markets',
      business_unit: 'Equities',
      department: 'Research',
    });
    await sync([short.id as number]);
    await sync([long.id as number]);
    const research = db.findUnit('department', 'Research');
    const bu = db.findUnit('business_unit', 'Equities');
    expect(research.parent_id).toBe(bu.id);

    // The weekly re-import replays both rows; nothing forks or oscillates.
    await sync([short.id as number, long.id as number]);
    await sync([short.id as number]);

    expect(
      nodes().filter((n) => n.level === 'department' && n.name === 'Research'),
    ).toHaveLength(1);
    expect(db.findUnit('department', 'Research').parent_id).toBe(bu.id);
    expect(short.org_unit_id).toBe(research.id);
    expect(long.org_unit_id).toBe(research.id);
  });

  it('is idempotent across a weekly re-import: zero new nodes, same ids, same leaves', async () => {
    db.seedGroup(9, 'Bank Management');
    const employees = [
      db.seedEmployee({
        entity: 'Berenberg',
        group_id: 9,
        division: 'Tax',
        department: 'Advisory',
        cost_center: '100 - Tax',
      }),
      db.seedEmployee({ entity: 'Berenberg', division: 'Tax' }),
      db.seedEmployee({ entity: 'Berenberg' }),
    ];
    const ids = employees.map((e) => e.id as number);

    await sync(ids);
    const snapshot = JSON.parse(JSON.stringify(db.orgUnits));
    const leaves = employees.map((e) => e.org_unit_id);

    await sync(ids);

    expect(db.orgUnits).toEqual(snapshot);
    expect(employees.map((e) => e.org_unit_id)).toEqual(leaves);
  });

  it('creates two nodes for the same name under two parents', async () => {
    const a = db.seedEmployee({
      business_unit: 'US Large Cap',
      department: 'Research',
    });
    const b = db.seedEmployee({
      business_unit: 'Wealth Management',
      department: 'Research',
    });

    await sync([a.id as number, b.id as number]);

    const research = nodes().filter(
      (n) => n.level === 'department' && n.name === 'Research',
    );
    expect(research).toHaveLength(2);
    expect(new Set(research.map((n) => n.parent_id)).size).toBe(2);
    expect(a.org_unit_id).not.toBe(b.org_unit_id);
  });

  it('creates cost centers flat, never assigns them as the leaf, and excludes them from the tree', async () => {
    const employee = db.seedEmployee({ cost_center: '70133 - Sales Trading' });

    await sync([employee.id as number]);

    expect(db.orgUnits).toHaveLength(1);
    const costCenter = db.findUnit('cost_center', '70133 - Sales Trading');
    expect(costCenter.parent_id).toBeNull();
    expect(employee.org_unit_id).toBeNull();

    const tree = buildOrgUnitTree(nodes());
    expect(tree.roots).toHaveLength(0);
    expect(tree.childrenByParentId.size).toBe(0);
  });

  it('respects the per-org level order preference and ignores unknown or non-tree entries', async () => {
    db.setHierarchyLevels(['division', 'cost_center', 'bogus', 'team']);
    const employee = db.seedEmployee({
      entity: 'Berenberg',
      division: 'Markets',
      department: 'Research',
      team: 'Risk Arb',
    });

    await sync([employee.id as number]);

    const division = db.findUnit('division', 'Markets');
    const team = db.findUnit('team', 'Risk Arb');
    expect(division.parent_id).toBeNull();
    expect(team.parent_id).toBe(division.id);
    expect(employee.org_unit_id).toBe(team.id);
    expect(
      nodes().filter((n) => n.level === 'entity' || n.level === 'department'),
    ).toHaveLength(0);
  });
});

describe('blank higher levels', () => {
  const ABC = {
    entity: 'test Entity',
    division: 'Test Division',
    business_unit: 'Test BU',
    department: 'Test Dep',
    team: 'Test Team',
  };
  const TEST = {};
  const ZXC = { business_unit: 'Test BU' };

  const seedThree = async (order: Record<string, string>[]) => {
    const group = db.upsertUnit({
      organization_id: ORG,
      level: 'business_group',
      name: 'Testing',
      parent_id: null,
    });
    for (const columns of order) {
      const employee = db.seedEmployee(columns);
      const id = employee.id as number;
      // Every one of them picked the same group in the form, so the write
      // carries that node id as the override.
      await sync([id], new Map([[id, group.id as number]]));
    }
  };

  const groupNodes = () =>
    db.orgUnits.filter(
      (unit) => unit.level === 'business_group' && unit.name === 'Testing',
    );

  it.each([
    ['fullest first', [ABC, TEST, ZXC]],
    ['emptiest first', [TEST, ZXC, ABC]],
    ['partial first', [ZXC, ABC, TEST]],
  ])(
    'keeps one business group whatever the import order (%s)',
    async (_label, order) => {
      await seedThree(order);
      expect(groupNodes()).toHaveLength(1);
    },
  );

  it('files everyone under the entity their group turned out to sit in', async () => {
    await seedThree([ABC, TEST, ZXC]);
    const entity = db.findUnit('entity', 'test Entity');
    const group = db.findUnit('business_group', 'Testing');
    expect(group.parent_id).toBe(entity.id);

    // The person with only a business group rests on the group itself; the
    // one who also named a Business Unit joins the existing deeper node
    // rather than starting a parallel branch.
    const [, test, zxc] = db.orgEmployees;
    expect(test.org_unit_id).toBe(group.id);
    expect(zxc.org_unit_id).toBe(db.findUnit('business_unit', 'Test BU').id);
  });

  it('lets one cleared employee hold the whole batch to path identity', async () => {
    const entity = db.upsertUnit({
      organization_id: ORG,
      level: 'entity',
      name: 'Acme',
      parent_id: null,
    });
    db.upsertUnit({
      organization_id: ORG,
      level: 'division',
      name: 'Markets',
      parent_id: entity.id,
    });
    const cleared = db.seedEmployee({ division: 'Markets' });
    const blank = db.seedEmployee({ division: 'Markets' });

    await sync(
      [cleared.id as number, blank.id as number],
      new Map([[cleared.id as number, null]]),
    );

    const root = db.findUnit('division', 'Markets', null);
    expect(cleared.org_unit_id).toBe(root.id);
    expect(blank.org_unit_id).toBe(root.id);
  });

  it('still keeps genuinely different groups of the same name apart', async () => {
    // Two "Testing" groups on diverging branches: a root step cannot tell
    // which one it meant, so it keeps its own node.
    const first = db.upsertUnit({
      organization_id: ORG,
      level: 'entity',
      name: 'Entity One',
      parent_id: null,
    });
    const second = db.upsertUnit({
      organization_id: ORG,
      level: 'entity',
      name: 'Entity Two',
      parent_id: null,
    });
    db.upsertUnit({
      organization_id: ORG,
      level: 'business_group',
      name: 'Testing',
      parent_id: first.id,
    });
    db.upsertUnit({
      organization_id: ORG,
      level: 'business_group',
      name: 'Testing',
      parent_id: second.id,
    });
    const group = db.upsertUnit({
      organization_id: ORG,
      level: 'business_group',
      name: 'Testing',
      parent_id: null,
    });
    const employee = db.seedEmployee({});
    await sync(
      [employee.id as number],
      new Map([[employee.id as number, group.id as number]]),
    );
    expect(groupNodes()).toHaveLength(3);
  });
});

describe('business group via node override', () => {
  it('places the overridden node name in the path, reusing a root-created node when it fits', async () => {
    const node = db.upsertUnit({
      organization_id: ORG,
      level: 'business_group',
      name: 'Ops',
      parent_id: null,
    });
    const employee = db.seedEmployee({ division: 'Markets' });

    await sync(
      [employee.id as number],
      new Map([[employee.id as number, node.id as number]]),
    );

    const group = db.findUnit('business_group', 'Ops');
    expect(group.id).toBe(node.id);
    const division = db.findUnit('division', 'Markets');
    expect(division.parent_id).toBe(node.id);
    expect(employee.org_unit_id).toBe(division.id);
  });

  it('keeps the business group already on the path when a later sync has no override', async () => {
    const node = db.upsertUnit({
      organization_id: ORG,
      level: 'business_group',
      name: 'Ops',
      parent_id: null,
    });
    const employee = db.seedEmployee({ division: 'Markets' });
    await sync(
      [employee.id as number],
      new Map([[employee.id as number, node.id as number]]),
    );

    employee.department = 'Research';
    await sync([employee.id as number]);

    const division = db.findUnit('division', 'Markets');
    expect(division.parent_id).toBe(node.id);
    const department = db.findUnit('department', 'Research');
    expect(department.parent_id).toBe(division.id);
    expect(employee.org_unit_id).toBe(department.id);
  });

  it('an explicit null override clears the business group even while legacy group_id is set', async () => {
    db.seedGroup(5, 'Sales');
    const employee = db.seedEmployee({ group_id: 5, division: 'Markets' });
    await sync([employee.id as number]);
    expect(db.findUnit('division', 'Markets').parent_id).toBe(
      db.findUnit('business_group', 'Sales').id,
    );

    await sync(
      [employee.id as number],
      new Map([[employee.id as number, null]]),
    );

    const rootDivision = db.findUnit('division', 'Markets', null);
    expect(employee.org_unit_id).toBe(rootDivision.id);
  });

  it('rejects an override that is not a business_group node', async () => {
    const division = db.upsertUnit({
      organization_id: ORG,
      level: 'division',
      name: 'Markets',
      parent_id: null,
    });
    const employee = db.seedEmployee({ team: 'Risk Arb' });

    await expect(
      sync(
        [employee.id as number],
        new Map([[employee.id as number, division.id as number]]),
      ),
    ).rejects.toThrow('business group node');
  });

  // loadNodeIndex is org-scoped, so a foreign node id is simply absent — this
  // pins that the override cannot reach across tenants.
  it('rejects an override node that belongs to another organization', async () => {
    const foreign = db.upsertUnit({
      organization_id: 'org-2',
      level: 'business_group',
      name: 'Ops',
      parent_id: null,
    });
    const employee = db.seedEmployee({ division: 'Markets' });

    await expect(
      sync(
        [employee.id as number],
        new Map([[employee.id as number, foreign.id as number]]),
      ),
    ).rejects.toThrow('business group node');
  });
});

describe('getOrgHierarchyLevelOrder', () => {
  it('de-duplicates a stored preference and drops unknown entries', async () => {
    db.setHierarchyLevels(['division', 'department', 'division', 'bogus']);

    await expect(getOrgHierarchyLevelOrder(ORG, client())).resolves.toEqual([
      'division',
      'department',
    ]);
  });

  it('derives the default from levels present on non-deleted employees, in canonical order', async () => {
    db.seedEmployee({ entity: 'Sucden', cost_center: '100' });
    db.seedEmployee({ department: 'Ops', status: 'inactive' });
    db.seedEmployee({ team: 'Ghost', deleted_at: '2026-01-01' });

    await expect(getOrgHierarchyLevelOrder(ORG, client())).resolves.toEqual([
      'entity',
      'department',
    ]);
  });

  it('includes business_group when any employee has a legacy group_id', async () => {
    db.seedGroup(3, 'Investment Banking');
    db.seedEmployee({ group_id: 3, division: 'Markets' });

    await expect(getOrgHierarchyLevelOrder(ORG, client())).resolves.toEqual([
      'business_group',
      'division',
    ]);
  });

  it('prefers the stored preference over derivation', async () => {
    db.setHierarchyLevels(['department', 'division']);
    db.seedEmployee({ entity: 'E', division: 'D', department: 'X' });

    await expect(getOrgHierarchyLevelOrder(ORG, client())).resolves.toEqual([
      'department',
      'division',
    ]);
  });

  it('includes business_group when a node exists and no employee carries a legacy group_id', async () => {
    db.tables.org_units.push({
      id: 999,
      organization_id: ORG,
      level: 'business_group',
      name: 'Markets',
      parent_id: null,
    });
    db.seedEmployee({ division: 'Markets' });

    await expect(getOrgHierarchyLevelOrder(ORG, client())).resolves.toEqual([
      'business_group',
      'division',
    ]);
  });

  it('propagates a probe failure', async () => {
    db.seedEmployee({ division: 'Markets' });
    const base = db.client() as { from: (table: string) => unknown };
    const failing = {
      from: (table: string) => {
        if (table !== 'org_employees') return base.from(table);
        const query = {
          select: () => query,
          eq: () => query,
          is: () => query,
          not: () => query,
          limit: () => query,
          maybeSingle: async () => ({
            data: null,
            error: { message: 'probe failed' },
          }),
        };
        return query;
      },
    } as unknown as SyncClient;

    await expect(getOrgHierarchyLevelOrder(ORG, failing)).rejects.toEqual({
      message: 'probe failed',
    });
  });
});
