jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

let db: FakeDb;

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => db.client(),
}));

import {
  createBusinessGroupNode,
  getBusinessGroupNodes,
  getBusinessGroupsByLeaf,
  syncOrgUnitsForEmployees,
} from '@/lib/v2/org-units';
import { matchBusinessGroups } from '@/lib/v2/employee-import/groups';
import { FAKE_ORG_ID as ORG, FakeDb } from './fake-db';

type SyncClient = Parameters<typeof syncOrgUnitsForEmployees>[2];

const client = () => db.client() as SyncClient;

beforeEach(() => {
  db = new FakeDb();
});

describe('createBusinessGroupNode', () => {
  it('creates a root business_group node', async () => {
    const node = await createBusinessGroupNode(ORG, ' EMEA Sales ', client());

    expect(node.name).toBe('EMEA Sales');
    const stored = db.findUnit('business_group', 'EMEA Sales');
    expect(stored.id).toBe(node.id);
    expect(stored.parent_id).toBeNull();
  });

  it('returns the existing node on a normalized-name match instead of duplicating', async () => {
    const first = await createBusinessGroupNode(ORG, 'EMEA Sales', client());
    const again = await createBusinessGroupNode(ORG, ' emea sales', client());

    expect(again.id).toBe(first.id);
    expect(
      db.orgUnits.filter((n) => n.level === 'business_group'),
    ).toHaveLength(1);
  });

  it('rejects a blank name', async () => {
    await expect(createBusinessGroupNode(ORG, '   ', client())).rejects.toThrow(
      'required',
    );
  });
});

describe('getBusinessGroupNodes', () => {
  it('lists only business_group nodes, wherever they sit in the tree', async () => {
    const entity = db.upsertUnit({
      organization_id: ORG,
      level: 'entity',
      name: 'Berenberg',
      parent_id: null,
    });
    db.upsertUnit({
      organization_id: ORG,
      level: 'business_group',
      name: 'Investment Banking',
      parent_id: entity.id,
    });
    db.upsertUnit({
      organization_id: ORG,
      level: 'business_group',
      name: 'Ops',
      parent_id: null,
    });
    db.upsertUnit({
      organization_id: ORG,
      level: 'cost_center',
      name: '100 - Tax',
      parent_id: null,
    });

    const nodes = await getBusinessGroupNodes(ORG, client());
    expect(nodes.map((n) => n.name).sort()).toEqual([
      'Investment Banking',
      'Ops',
    ]);
  });
});

describe('getBusinessGroupsByLeaf', () => {
  it('resolves a leaf to the business_group node on its path', async () => {
    db.seedGroup(5, 'Investment Banking');
    const employee = db.seedEmployee({
      entity: 'Berenberg',
      group_id: 5,
      division: 'Markets',
    });
    await syncOrgUnitsForEmployees(ORG, [employee.id as number], client());

    const byLeaf = await getBusinessGroupsByLeaf(ORG, client());
    const group = db.findUnit('business_group', 'Investment Banking');
    expect(byLeaf.get(employee.org_unit_id as number)).toEqual({
      id: group.id,
      name: 'Investment Banking',
    });
  });

  it('has no entry for a leaf whose path holds no business group', async () => {
    const employee = db.seedEmployee({ division: 'Markets' });
    await syncOrgUnitsForEmployees(ORG, [employee.id as number], client());

    const byLeaf = await getBusinessGroupsByLeaf(ORG, client());
    expect(typeof employee.org_unit_id).toBe('number');
    expect(byLeaf.get(employee.org_unit_id as number)).toBeUndefined();
  });
});

// The ValueMapEditor flow at service level: the editor creates the node, the
// import's matcher resolves the file's spelling onto it, and the walk carries
// membership into org_unit_id — no `groups` row anywhere.
describe('import node-create flow', () => {
  it('create → match → walk lands the employee under the created node', async () => {
    const node = await createBusinessGroupNode(ORG, 'EMEA Sales', client());

    const { byName, matched, unmatched } = await matchBusinessGroups(ORG, [
      ' emea sales ',
    ]);
    expect(unmatched).toEqual([]);
    expect(matched).toEqual([{ source: 'emea sales', group: 'EMEA Sales' }]);
    expect(byName.get('emea sales')?.id).toBe(node.id);

    const employee = db.seedEmployee({ division: 'Markets' });
    await syncOrgUnitsForEmployees(
      ORG,
      [employee.id as number],
      client(),
      new Map([[employee.id as number, node.id]]),
    );

    const division = db.findUnit('division', 'Markets');
    expect(division.parent_id).toBe(node.id);
    expect(employee.org_unit_id).toBe(division.id);
    expect(db.tables.groups).toHaveLength(0);
  });
});
