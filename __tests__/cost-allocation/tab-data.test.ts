jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const getOrgHierarchyLevelOrder = jest.fn();
jest.mock('@/lib/v2/org-units/sync', () => ({
  getOrgHierarchyLevelOrder: (...args: unknown[]) =>
    getOrgHierarchyLevelOrder(...args),
}));

import {
  loadAllocationCatalog,
  loadCostAllocationTabData,
  loadContractHeader,
} from '@/lib/v2/cost-allocation/tab-data';
import { FAKE_ORG_ID as ORG, FakeDb } from './fake-db';

type LoaderClient = Parameters<typeof loadCostAllocationTabData>[2];

const MSA = 100;
const INVOICE = 300;
const TERMINAL = 7;

type Row = Record<string, unknown>;

/**
 * The 2a fake covers the allocation tables; the tab loader adds a `contracts`
 * header read (with a `contract_types` embed and maybeSingle) that is layered
 * on here without widening the shared fake.
 */
function withContracts(db: FakeDb, contracts: Row[]) {
  const base = db.client() as { from: (table: string) => unknown };
  return {
    from: (table: string) => {
      if (table !== 'contracts') return base.from(table);
      const filters: ((row: Row) => boolean)[] = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        maybeSingle: async () => ({
          data: contracts.find((row) => filters.every((f) => f(row))) ?? null,
          error: null,
        }),
      };
      return query;
    },
  } as unknown as LoaderClient;
}

let db: FakeDb;
let client: LoaderClient;

beforeEach(() => {
  db = new FakeDb();
  db.tables.org_employees = [];
  client = withContracts(db, [
    {
      id: MSA,
      organization_id: ORG,
      type_id: 1,
      contract_types: { name: 'MSA' },
    },
    {
      id: INVOICE,
      organization_id: ORG,
      type_id: 6,
      contract_types: { name: 'Invoice' },
    },
    { id: 999, organization_id: 'other-org', type_id: 1, contract_types: null },
  ]);
  getOrgHierarchyLevelOrder.mockResolvedValue(['division', 'department']);
  db.seedRelationship(MSA, INVOICE);
});

const seedEmployee = (
  name: string,
  orgUnitId: number | null,
  extra: Row = {},
) => {
  const row = db.seedEmployee(name, orgUnitId);
  Object.assign(
    row,
    { status: 'active', deleted_at: null, cost_center: null },
    extra,
  );
  return row;
};

describe('loadContractHeader', () => {
  it('404s a contract outside the organization', async () => {
    await expect(loadContractHeader(ORG, 999, client)).rejects.toThrow(
      'Contract not found',
    );
    await expect(loadContractHeader(ORG, MSA, client)).resolves.toEqual({
      id: MSA,
      type_id: 1,
      typeName: 'MSA',
    });
  });
});

describe('loadCostAllocationTabData', () => {
  it('builds the picker from the org tree and reports an own allocation', async () => {
    const division = db.seedUnit('division', 'Markets');
    const research = db.seedUnit(
      'department',
      'Research',
      division.id as number,
    );
    seedEmployee('Ada Lovelace', research.id as number);
    const allocation = db.seedAllocation(MSA, 'manual');
    db.seedLine(
      allocation.id as number,
      { orgUnitId: research.id as number },
      100,
    );

    const data = await loadCostAllocationTabData(ORG, MSA, client);

    expect(data.isInvoice).toBe(false);
    expect(data.hasOwnAllocation).toBe(true);
    expect(data.sourceContract).toBeNull();
    expect(data.parentContract).toBeNull();
    expect(data.hasAllocationTargets).toBe(true);
    expect(data.levelByUnitId).toEqual({
      [division.id as number]: 'division',
      [research.id as number]: 'department',
    });
    expect(data.resolved.scopes[0].lines[0].target).toEqual({
      kind: 'org_unit',
      id: research.id,
      name: 'Research',
    });
  });

  it('labels the inherited source for an invoice and carries its seats', async () => {
    const research = db.seedUnit('department', 'Research');
    const ada = seedEmployee('Ada Lovelace', research.id as number);
    const allocation = db.seedAllocation(MSA, 'manual');
    db.seedLine(
      allocation.id as number,
      { orgUnitId: research.id as number },
      100,
    );
    db.seedSeat(INVOICE, ada.id as number, TERMINAL);
    db.seedSeat(INVOICE, null, TERMINAL);

    const data = await loadCostAllocationTabData(ORG, INVOICE, client);

    expect(data.isInvoice).toBe(true);
    expect(data.hasOwnAllocation).toBe(false);
    expect(data.sourceContract).toEqual({ id: MSA, label: 'MSA · ID 100' });
    expect(data.parentContract).toEqual({ id: MSA, label: 'MSA · ID 100' });
    expect(data.seats).toEqual([
      { productId: TERMINAL, employeeId: ada.id },
      { productId: TERMINAL, employeeId: null },
    ]);
  });

  it('labels an unassigned invoice with its parent so the tab can offer the parent setup', async () => {
    const data = await loadCostAllocationTabData(ORG, INVOICE, client);

    expect(data.resolved.scopes).toEqual([]);
    expect(data.sourceContract).toBeNull();
    expect(data.parentContract).toEqual({ id: MSA, label: 'MSA · ID 100' });
  });

  it('carries the contract products the by-product scopes name, one entry per product', async () => {
    db.seedProductDetail(INVOICE, { id: TERMINAL, name: 'Terminal' }, 1);
    db.seedProductDetail(INVOICE, { id: TERMINAL, name: 'Terminal' }, 2);
    db.seedProductDetail(INVOICE, { id: 8, name: 'Data Feed' });
    db.seedProductDetail(MSA, { id: 9, name: 'Analytics' });

    const data = await loadCostAllocationTabData(ORG, INVOICE, client);

    expect(data.products).toEqual([
      { id: TERMINAL, name: 'Terminal' },
      { id: 8, name: 'Data Feed' },
    ]);
  });

  it('reports no allocation targets for a bare org', async () => {
    getOrgHierarchyLevelOrder.mockResolvedValue([]);

    const data = await loadCostAllocationTabData(ORG, MSA, client);

    expect(data.hasAllocationTargets).toBe(false);
    expect(data.resolved.scopes).toEqual([]);
    expect(data.hasOwnAllocation).toBe(false);
  });

  it('counts only picker-eligible employees toward allocation targets', async () => {
    getOrgHierarchyLevelOrder.mockResolvedValue([]);
    seedEmployee('On Leave', null, { status: 'on_leave' });

    expect(
      (await loadCostAllocationTabData(ORG, MSA, client)).hasAllocationTargets,
    ).toBe(false);

    seedEmployee('Ada Active', null);
    expect(
      (await loadCostAllocationTabData(ORG, MSA, client)).hasAllocationTargets,
    ).toBe(true);
  });
});

describe('loadAllocationCatalog', () => {
  it('builds the org-wide picker catalog from the tree, level order, and roster', async () => {
    const division = db.seedUnit('division', 'Markets');
    const research = db.seedUnit(
      'department',
      'Research',
      division.id as number,
    );
    seedEmployee('Ada Lovelace', research.id as number);

    const { catalog } = await loadAllocationCatalog(ORG, client);

    expect(catalog.map((c) => c.key)).toEqual([
      'division',
      'department',
      'user',
    ]);
    expect(catalog[2].items.map((i) => i.target.name)).toEqual([
      'Ada Lovelace',
    ]);
  });
});
