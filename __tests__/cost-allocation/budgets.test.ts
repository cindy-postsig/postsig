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
  assertBudgetTargetInOrg,
  budgetTargetKey,
  budgetsByTargetKey,
  fiscalYearsTouched,
  loadBudgets,
  saveBudget,
  type BudgetRow,
} from '@/lib/v2/cost-allocation/budgets';
import { loadAllocationContext } from '@/lib/v2/cost-allocation/context';
import { NotFoundError } from '@/lib/errors';
import { FAKE_ORG_ID as ORG, FakeDb } from './fake-db';

type Client = Parameters<typeof loadBudgets>[1];

const JANUARY = { startMonth: 1 };
const APRIL = { startMonth: 4 };

describe('fiscalYearsTouched (decision Q4: no proration)', () => {
  it('a sub-year window reads its containing fiscal year, numbered by the start year', () => {
    expect(
      fiscalYearsTouched({ start: '2026-08-01', end: '2026-09-01' }, JANUARY),
    ).toEqual([2026]);
    // August 2026 sits in the FY that started April 2026.
    expect(
      fiscalYearsTouched({ start: '2026-08-01', end: '2026-09-01' }, APRIL),
    ).toEqual([2026]);
    // February 2026 sits in the FY that started April 2025.
    expect(
      fiscalYearsTouched({ start: '2026-02-01', end: '2026-03-01' }, APRIL),
    ).toEqual([2025]);
  });

  it('a window spanning fiscal years lists each one it touches', () => {
    expect(
      fiscalYearsTouched({ start: '2025-11-01', end: '2027-02-01' }, JANUARY),
    ).toEqual([2025, 2026, 2027]);
    // Calendar YTD under an April FY straddles the FY boundary.
    expect(
      fiscalYearsTouched({ start: '2026-01-01', end: '2026-08-25' }, APRIL),
    ).toEqual([2025, 2026]);
  });

  it('treats the half-open end as exclusive: a window ending on an FY start does not touch that FY', () => {
    expect(
      fiscalYearsTouched({ start: '2026-01-01', end: '2027-01-01' }, JANUARY),
    ).toEqual([2026]);
    expect(
      fiscalYearsTouched({ start: '2026-01-01', end: '2027-01-02' }, JANUARY),
    ).toEqual([2026, 2027]);
  });
});

describe('budgetsByTargetKey', () => {
  const rows: BudgetRow[] = [
    { org_unit_id: 5, org_employee_id: null, fiscal_year: 2025, amount: 100 },
    { org_unit_id: 5, org_employee_id: null, fiscal_year: 2026, amount: 250 },
    { org_unit_id: 5, org_employee_id: null, fiscal_year: 2027, amount: 999 },
    { org_unit_id: null, org_employee_id: 9, fiscal_year: 2026, amount: 40 },
  ];

  it('keys rows by the engine allocation key', () => {
    expect(budgetTargetKey(rows[0])).toBe('unit:5');
    expect(budgetTargetKey(rows[3])).toBe('user:9');
  });

  it('reads the containing FY only for a single-FY window', () => {
    expect([...budgetsByTargetKey(rows, [2026])]).toEqual([
      ['unit:5', 250],
      ['user:9', 40],
    ]);
  });

  it('sums the FYs a spanning window touches and omits targets with no row in any', () => {
    const totals = budgetsByTargetKey(rows, [2025, 2026]);
    expect(totals.get('unit:5')).toBe(350);
    expect(totals.get('user:9')).toBe(40);
    expect(budgetsByTargetKey(rows, [2024]).size).toBe(0);
  });
});

describe('saveBudget', () => {
  let db: FakeDb;
  let client: Client;
  let unitId: number;

  beforeEach(() => {
    db = new FakeDb();
    client = db.client() as Client;
    unitId = db.seedUnit('department', 'Research').id as number;
  });

  const budgets = () => db.tables.cost_allocation_budgets;

  it('inserts a row keyed on (target, fiscal year) with the author', async () => {
    await saveBudget(
      {
        organizationId: ORG,
        target: { kind: 'org_unit', id: unitId },
        fiscalYear: 2026,
        amount: 1200.5,
        userId: 'user-1',
      },
      client,
    );

    expect(budgets()).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        org_unit_id: unitId,
        org_employee_id: null,
        fiscal_year: 2026,
        amount: 1200.5,
        created_by: 'user-1',
        updated_by: 'user-1',
      }),
    ]);
  });

  it('updates the same fiscal year in place and keeps other years separate', async () => {
    const target = { kind: 'org_unit' as const, id: unitId };
    await saveBudget(
      { organizationId: ORG, target, fiscalYear: 2026, amount: 100 },
      client,
    );
    await saveBudget(
      { organizationId: ORG, target, fiscalYear: 2027, amount: 300 },
      client,
    );
    await saveBudget(
      {
        organizationId: ORG,
        target,
        fiscalYear: 2026,
        amount: 150,
        userId: 'user-2',
      },
      client,
    );

    expect(await loadBudgets(ORG, client)).toEqual([
      expect.objectContaining({ fiscal_year: 2026, amount: 150 }),
      expect.objectContaining({ fiscal_year: 2027, amount: 300 }),
    ]);
    expect(budgets()[0]).toEqual(
      expect.objectContaining({ updated_by: 'user-2' }),
    );
  });

  it('clears a budget with a null amount and ignores a clear for a year with none', async () => {
    const employeeId = db.seedEmployee('Ada Lovelace').id as number;
    const target = { kind: 'employee' as const, id: employeeId };
    await saveBudget(
      { organizationId: ORG, target, fiscalYear: 2026, amount: 10 },
      client,
    );
    await saveBudget(
      { organizationId: ORG, target, fiscalYear: 2026, amount: null },
      client,
    );
    await saveBudget(
      { organizationId: ORG, target, fiscalYear: 2030, amount: null },
      client,
    );

    expect(budgets()).toEqual([]);
  });

  it('keys employee budgets on org_employee_id, never colliding with a unit of the same id', async () => {
    const employeeId = db.seedEmployee('Ada Lovelace').id as number;
    await saveBudget(
      {
        organizationId: ORG,
        target: { kind: 'org_unit', id: unitId },
        fiscalYear: 2026,
        amount: 1,
      },
      client,
    );
    await saveBudget(
      {
        organizationId: ORG,
        target: { kind: 'employee', id: employeeId },
        fiscalYear: 2026,
        amount: 2,
      },
      client,
    );

    expect(
      budgets().map((row) => budgetTargetKey(row as unknown as BudgetRow)),
    ).toEqual([`unit:${unitId}`, `user:${employeeId}`]);
  });
});

describe('saveBudget with a corrupt duplicate', () => {
  it('fails loudly instead of silently updating one of two matching rows', async () => {
    const db = new FakeDb();
    const client = db.client() as Client;
    const unitId = db.seedUnit('department', 'Research').id as number;
    db.seedBudget({ orgUnitId: unitId }, 2026, 1);
    db.seedBudget({ orgUnitId: unitId }, 2026, 2);

    await expect(
      saveBudget(
        {
          organizationId: ORG,
          target: { kind: 'org_unit', id: unitId },
          fiscalYear: 2026,
          amount: 3,
        },
        client,
      ),
    ).rejects.toEqual({ message: 'expected at most one row, got 2' });
  });
});

describe('assertBudgetTargetInOrg', () => {
  it('passes for the org’s own units and employees and 404s anything else', async () => {
    const db = new FakeDb();
    const client = db.client() as Client;
    const unitId = db.seedUnit('team', 'Risk Arb').id as number;
    const employeeId = db.seedEmployee('Bob Berlin').id as number;

    await expect(
      assertBudgetTargetInOrg(ORG, { kind: 'org_unit', id: unitId }, client),
    ).resolves.toBeUndefined();
    await expect(
      assertBudgetTargetInOrg(
        ORG,
        { kind: 'employee', id: employeeId },
        client,
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertBudgetTargetInOrg(
        'other-org',
        { kind: 'org_unit', id: unitId },
        client,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      assertBudgetTargetInOrg(
        ORG,
        { kind: 'employee', id: unitId + 100 },
        client,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('allocation context cost-center resolution (phase 4b loader extension)', () => {
  it('name-matches each employee’s cost_center value to the flat cost-center node', async () => {
    const db = new FakeDb();
    const client = db.client() as Parameters<typeof loadAllocationContext>[1];
    const costCenter = db.seedUnit('cost_center', '70133 - Sales Trading').id;
    const department = db.seedUnit('department', 'Research').id as number;
    const alice = db.seedEmployee(
      'Alice Aachen',
      department,
      '70133 - Sales Trading',
    ).id;
    const bob = db.seedEmployee('Bob Berlin', department, null).id;
    const carol = db.seedEmployee('Carol Cork', null, '99999 - Unknown').id;
    // The loader reads only employees a line points at.
    const allocation = db.seedAllocation(1, 'manual').id as number;
    for (const employee of [alice, bob, carol]) {
      db.seedLine(allocation, { orgEmployeeId: employee as number }, 33);
    }

    const ctx = await loadAllocationContext(ORG, client, []);

    expect(ctx.employeesById.get(alice as number)?.cost_center_unit_id).toBe(
      costCenter,
    );
    expect(
      ctx.employeesById.get(bob as number)?.cost_center_unit_id,
    ).toBeNull();
    // A value with no node yet (the sync has not run) is non-routable.
    expect(
      ctx.employeesById.get(carol as number)?.cost_center_unit_id,
    ).toBeNull();
  });
});
