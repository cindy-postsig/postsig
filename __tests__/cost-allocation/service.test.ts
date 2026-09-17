jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));
jest.mock('@/data/superuser/activities', () => ({
  logAllocationChanged: jest.fn().mockResolvedValue(true),
}));

import {
  normalizeScopes,
  saveContractAllocation,
} from '@/lib/v2/cost-allocation';
import { logAllocationChanged } from '@/data/superuser/activities';
import { FAKE_ORG_ID as ORG, FakeDb } from './fake-db';

type SaveClient = Parameters<typeof saveContractAllocation>[1];

const CONTRACT = 100;
const mockedLog = jest.mocked(logAllocationChanged);

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
  mockedLog.mockClear();
});

const save = (
  scopes: Parameters<typeof normalizeScopes>[0],
  overrides: Partial<{ userId: string; changedBy: string }> = {},
) =>
  saveContractAllocation(
    { organizationId: ORG, contractId: CONTRACT, scopes, ...overrides },
    db.client() as SaveClient,
  );

describe('normalizeScopes validation', () => {
  const line = (percent: number, orgUnitId = 1) => ({ orgUnitId, percent });

  it('accepts totals at the 0.01 tolerance boundary and rejects beyond it', () => {
    const scope = (percents: number[]) => [
      {
        productId: null,
        mode: 'manual' as const,
        lines: percents.map((percent, i) => line(percent, i + 1)),
      },
    ];

    expect(() => normalizeScopes(scope([50, 49.99]))).not.toThrow();
    expect(() => normalizeScopes(scope([50, 50.01]))).not.toThrow();
    expect(() => normalizeScopes(scope([50, 49.98]))).toThrow(
      'must total 100%',
    );
    expect(() => normalizeScopes(scope([50, 50.02]))).toThrow(
      'must total 100%',
    );
  });

  it('rejects mixing a whole-contract scope with product scopes', () => {
    expect(() =>
      normalizeScopes([
        { productId: null, mode: 'manual', lines: [line(100)] },
        { productId: 7, mode: 'manual', lines: [line(100)] },
      ]),
    ).toThrow('mutually exclusive');
  });

  it('rejects duplicate scopes for the same product', () => {
    expect(() =>
      normalizeScopes([
        { productId: 7, mode: 'manual', lines: [line(100)] },
        { productId: 7, mode: 'active_users' },
      ]),
    ).toThrow('Duplicate allocation scope');
  });

  it('rejects a line targeting both or neither side of the exclusive arc', () => {
    expect(() =>
      normalizeScopes([
        {
          productId: null,
          mode: 'manual',
          lines: [{ orgUnitId: 1, orgEmployeeId: 2, percent: 100 }],
        },
      ]),
    ).toThrow('exactly one');
    expect(() =>
      normalizeScopes([
        { productId: null, mode: 'manual', lines: [{ percent: 100 }] },
      ]),
    ).toThrow('exactly one');
  });

  it('rejects out-of-range percents and repeated targets', () => {
    expect(() =>
      normalizeScopes([
        { productId: null, mode: 'manual', lines: [line(0), line(100, 2)] },
      ]),
    ).toThrow('> 0 and <= 100');
    expect(() =>
      normalizeScopes([
        { productId: null, mode: 'manual', lines: [line(101)] },
      ]),
    ).toThrow('> 0 and <= 100');
    expect(() =>
      normalizeScopes([
        { productId: null, mode: 'manual', lines: [line(50), line(50)] },
      ]),
    ).toThrow('repeat a target');
  });

  it('rejects non-finite percents that slip past a plain range check', () => {
    const bad = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      'abc' as unknown as number,
    ];
    for (const percent of bad) {
      expect(() =>
        normalizeScopes([
          { productId: null, mode: 'manual', lines: [line(percent)] },
        ]),
      ).toThrow('> 0 and <= 100');
    }
  });

  it('rejects a manual scope with no lines', () => {
    expect(() =>
      normalizeScopes([{ productId: null, mode: 'manual', lines: [] }]),
    ).toThrow('at least one line');
  });

  it('materializes a scope submitted with lines as manual, whatever mode was sent', () => {
    const [scope] = normalizeScopes([
      {
        productId: null,
        mode: 'active_users',
        lines: [line(60), line(40, 2)],
      },
    ]);

    expect(scope.mode).toBe('manual');
    expect(scope.lines).toHaveLength(2);
  });

  it('rounds percents to the stored numeric(7,4) precision', () => {
    const [scope] = normalizeScopes([
      {
        productId: null,
        mode: 'manual',
        lines: [line(33.33333), line(33.33333, 2), line(33.33333, 3)],
      },
    ]);

    expect(scope.lines.map((l) => l.percent)).toEqual([
      33.3333, 33.3333, 33.3333,
    ]);
  });
});

describe('saveContractAllocation', () => {
  it('creates rows and lines and audits before/after', async () => {
    const unit = db.seedUnit('department', 'Research');
    const employee = db.seedEmployee('Alice Aachen');

    await save(
      [
        {
          productId: null,
          mode: 'manual',
          lines: [
            { orgUnitId: unit.id as number, percent: 60 },
            { orgEmployeeId: employee.id as number, percent: 40 },
          ],
        },
      ],
      { userId: 'user-1', changedBy: 'Alice' },
    );

    expect(db.tables.contract_cost_allocations).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        contract_id: CONTRACT,
        product_id: null,
        mode: 'manual',
        created_by: 'user-1',
      }),
    ]);
    expect(db.tables.contract_cost_allocation_lines).toEqual([
      expect.objectContaining({ org_unit_id: unit.id, percent: 60 }),
      expect.objectContaining({ org_employee_id: employee.id, percent: 40 }),
    ]);
    expect(mockedLog).toHaveBeenCalledWith({
      contractId: CONTRACT,
      before: [],
      after: [
        {
          productId: null,
          mode: 'manual',
          lines: [
            { orgUnitId: unit.id, orgEmployeeId: null, percent: 60 },
            { orgUnitId: null, orgEmployeeId: employee.id, percent: 40 },
          ],
        },
      ],
      changedBy: 'Alice',
      userId: 'user-1',
    });
  });

  it('stores an active_users scope with no lines', async () => {
    await save([{ productId: null, mode: 'active_users' }]);

    expect(db.tables.contract_cost_allocations).toEqual([
      expect.objectContaining({ mode: 'active_users' }),
    ]);
    expect(db.tables.contract_cost_allocation_lines).toEqual([]);
  });

  it('flips an active_users allocation to manual when a save carries lines', async () => {
    const unit = db.seedUnit('department', 'Research');
    db.seedAllocation(CONTRACT, 'active_users');

    await save([
      {
        productId: null,
        mode: 'active_users',
        lines: [{ orgUnitId: unit.id as number, percent: 100 }],
      },
    ]);

    expect(db.tables.contract_cost_allocations).toEqual([
      expect.objectContaining({ mode: 'manual' }),
    ]);
    expect(db.tables.contract_cost_allocation_lines).toEqual([
      expect.objectContaining({ org_unit_id: unit.id, percent: 100 }),
    ]);
    expect(mockedLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before: [{ productId: null, mode: 'active_users', lines: [] }],
        after: [
          {
            productId: null,
            mode: 'manual',
            lines: [{ orgUnitId: unit.id, orgEmployeeId: null, percent: 100 }],
          },
        ],
      }),
    );
  });

  it('replaces existing lines and drops scopes missing from the new state', async () => {
    const oldUnit = db.seedUnit('department', 'Ops');
    const newUnit = db.seedUnit('department', 'Research');
    const keptScope = db.seedAllocation(CONTRACT, 'manual', 7);
    db.seedLine(
      keptScope.id as number,
      { orgUnitId: oldUnit.id as number },
      100,
    );
    const droppedScope = db.seedAllocation(CONTRACT, 'manual', 8);
    db.seedLine(
      droppedScope.id as number,
      { orgUnitId: oldUnit.id as number },
      100,
    );

    await save([
      {
        productId: 7,
        mode: 'manual',
        lines: [{ orgUnitId: newUnit.id as number, percent: 100 }],
      },
    ]);

    expect(db.tables.contract_cost_allocations).toEqual([
      expect.objectContaining({ id: keptScope.id, product_id: 7 }),
    ]);
    expect(db.tables.contract_cost_allocation_lines).toEqual([
      expect.objectContaining({
        allocation_id: keptScope.id,
        org_unit_id: newUnit.id,
      }),
    ]);
    expect(mockedLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before: [
          {
            productId: 7,
            mode: 'manual',
            lines: [
              { orgUnitId: oldUnit.id, orgEmployeeId: null, percent: 100 },
            ],
          },
          {
            productId: 8,
            mode: 'manual',
            lines: [
              { orgUnitId: oldUnit.id, orgEmployeeId: null, percent: 100 },
            ],
          },
        ],
        after: [
          {
            productId: 7,
            mode: 'manual',
            lines: [
              { orgUnitId: newUnit.id, orgEmployeeId: null, percent: 100 },
            ],
          },
        ],
      }),
    );
  });

  it('clears the allocation when saved with no scopes', async () => {
    const unit = db.seedUnit('department', 'Ops');
    const allocation = db.seedAllocation(CONTRACT, 'manual');
    db.seedLine(allocation.id as number, { orgUnitId: unit.id as number }, 100);

    await save([]);

    expect(db.tables.contract_cost_allocations).toEqual([]);
    expect(db.tables.contract_cost_allocation_lines).toEqual([]);
    expect(mockedLog).toHaveBeenCalledWith(
      expect.objectContaining({ after: [] }),
    );
  });

  it('writes and audits nothing when the state is unchanged', async () => {
    const unit = db.seedUnit('department', 'Ops');
    const scopes = [
      {
        productId: null,
        mode: 'manual' as const,
        lines: [{ orgUnitId: unit.id as number, percent: 100 }],
      },
    ];
    await save(scopes);
    expect(mockedLog).toHaveBeenCalledTimes(1);
    const rowsAfterFirstSave = JSON.parse(JSON.stringify(db.tables));

    await save(scopes);

    expect(db.tables).toEqual(rowsAfterFirstSave);
    expect(mockedLog).toHaveBeenCalledTimes(1);
  });
});
