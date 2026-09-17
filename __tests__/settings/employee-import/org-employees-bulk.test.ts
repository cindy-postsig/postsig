jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn(async () => ({ organizationId: 'org-1' })),
}));

jest.mock('@/data/user-permissions', () => ({
  checkAbility: jest.fn(async () => true),
}));

const mockSyncOrgUnits = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('@/lib/v2/org-units', () => ({
  syncOrgUnitsForEmployees: (...args: unknown[]) => mockSyncOrgUnits(...args),
}));

type Range = { from: number; to: number };

const selectRanges: Range[] = [];
const insertBatches: Record<string, unknown>[][] = [];
const upsertBatches: Record<string, unknown>[][] = [];
let existingRows: Record<string, unknown>[] = [];

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      let range: Range = { from: 0, to: 0 };

      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        range: (from: number, to: number) => {
          range = { from, to };
          selectRanges.push(range);
          return Promise.resolve({
            data: existingRows.slice(from, to + 1),
            error: null,
          });
        },
        insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          const batch = Array.isArray(rows) ? rows : [rows];
          insertBatches.push(batch);
          return {
            select: () => ({
              then: (resolve: (v: unknown) => unknown) =>
                resolve({
                  // Echo the identity columns the real RETURNING carries, in a
                  // deliberately scrambled order: the write must match rows by
                  // key, never by position.
                  data: [...batch]
                    .map((row, i) => ({
                      id: i,
                      employee_id: row.employee_id ?? null,
                      email: row.email ?? null,
                      first_name: row.first_name,
                      last_name: row.last_name,
                    }))
                    .reverse(),
                  error: null,
                }),
              single: () => Promise.resolve({ data: { id: 1 }, error: null }),
            }),
          };
        },
        upsert: (rows: Record<string, unknown>[]) => {
          upsertBatches.push(rows);
          return {
            select: () =>
              Promise.resolve({
                data: rows.map((r) => ({ id: r.id })),
                error: null,
              }),
          };
        },
      });

      return builder;
    },
  }),
}));

import { addOrgEmployees } from '@/data/superuser/org-employees';

const employee = (i: number) => ({
  organization_id: 'org-1',
  first_name: `First${i}`,
  last_name: `Last${i}`,
  employee_id: `E${i}`,
});

beforeEach(() => {
  selectRanges.length = 0;
  insertBatches.length = 0;
  upsertBatches.length = 0;
  existingRows = [];
  mockSyncOrgUnits.mockClear();
});

describe('addOrgEmployees', () => {
  // PostgREST caps responses at max_rows (1000). Without pagination every
  // employee past the first page looks new on a re-import.
  it('pages through more than 1000 existing employees when deduping', async () => {
    existingRows = Array.from({ length: 1589 }, (_, i) => ({
      id: i + 1,
      employee_id: `E${i}`,
      email: null,
      first_name: `First${i}`,
      last_name: `Last${i}`,
    }));

    const result = await addOrgEmployees([employee(1200)]);

    expect(selectRanges).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
    // E1200 lives on the second page, so it must resolve as an update.
    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);
    expect(insertBatches).toHaveLength(0);
  });

  it('chunks inserts instead of issuing one call per row', async () => {
    const result = await addOrgEmployees(
      Array.from({ length: 1200 }, (_, i) => employee(i)),
    );

    expect(insertBatches.map((b) => b.length)).toEqual([500, 500, 200]);
    expect(result.inserted).toBe(1200);
  });

  it('chunks updates into batched upserts', async () => {
    existingRows = Array.from({ length: 1200 }, (_, i) => ({
      id: i + 1,
      employee_id: `E${i}`,
      email: null,
      first_name: `First${i}`,
      last_name: `Last${i}`,
    }));

    const result = await addOrgEmployees(
      Array.from({ length: 1200 }, (_, i) => employee(i)),
    );

    expect(upsertBatches.map((b) => b.length)).toEqual([500, 500, 200]);
    expect(result.updated).toBe(1200);
    expect(upsertBatches[0][0]).toHaveProperty('id');
  });

  it('walks org units once for every written employee, inserts and updates alike', async () => {
    existingRows = [
      {
        id: 1,
        employee_id: 'E0',
        email: null,
        first_name: 'First0',
        last_name: 'Last0',
      },
    ];

    await addOrgEmployees([employee(0), employee(1), employee(2)]);

    expect(mockSyncOrgUnits).toHaveBeenCalledTimes(1);
    const [orgId, ids] = mockSyncOrgUnits.mock.calls[0];
    expect(orgId).toBe('org-1');
    expect(ids).toHaveLength(3);
  });

  it('hands the walk each written row’s business-group node, keyed by the id the write produced', async () => {
    existingRows = [
      {
        id: 500,
        employee_id: 'E0',
        email: null,
        first_name: 'First0',
        last_name: 'Last0',
      },
    ];

    await addOrgEmployees([
      { ...employee(0), business_group_node_id: 9 },
      { ...employee(1), business_group_node_id: 7 },
      employee(2),
    ]);

    const [, ids, , overrides] = mockSyncOrgUnits.mock.calls[0] as [
      string,
      number[],
      unknown,
      Map<number, number | null>,
    ];
    // The insert mock assigns ids by batch position (E1 -> 0, E2 -> 1) but
    // returns them reversed, so this only holds if rows are matched by key.
    expect([...ids].sort((a, b) => a - b)).toEqual([0, 1, 500]);
    expect(overrides).toEqual(
      new Map([
        [500, 9],
        [0, 7],
      ]),
    );
    expect(
      insertBatches
        .flat()
        .concat(upsertBatches.flat())
        .filter((row) => 'group_id' in row || 'business_group_node_id' in row),
    ).toEqual([]);
  });

  // buildEmployeeRow omits absent keys; PostgREST would fill a missing key in a
  // heterogeneous batch with the column DEFAULT, resetting status to 'active'.
  it('keeps rows with and without a status in separate batches', async () => {
    await addOrgEmployees([
      { ...employee(1), status: 'inactive' as const },
      employee(2),
      { ...employee(3), status: 'inactive' as const },
    ]);

    expect(insertBatches).toHaveLength(2);
    for (const batch of insertBatches) {
      const signatures = new Set(
        batch.map((row) => Object.keys(row).sort().join(',')),
      );
      expect(signatures.size).toBe(1);
    }
    expect(insertBatches.flat().filter((row) => 'status' in row)).toHaveLength(
      2,
    );
  });
});
