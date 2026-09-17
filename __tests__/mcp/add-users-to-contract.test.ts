import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockGetContract = jest.fn<() => Promise<unknown>>();
jest.mock('@/lib/v2', () => ({
  __esModule: true,
  getContract: () => mockGetContract(),
}));

const mockSyncOrgUnits = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('@/lib/v2/org-units', () => ({
  __esModule: true,
  syncOrgUnitsForEmployees: (...args: unknown[]) => mockSyncOrgUnits(...args),
}));

// Per-table query state. Each table's response is a sequence of values
// returned in order; tests configure them up front.
const tableResponses: Record<string, Array<unknown>> = {};
const tableInsertResults: Record<string, Array<unknown>> = {};

function nextResponse(table: string): unknown {
  const queue = tableResponses[table] ?? [];
  return queue.shift() ?? { data: [], error: null };
}
function nextInsert(table: string): unknown {
  const queue = tableInsertResults[table] ?? [];
  return queue.shift() ?? { data: [], error: null };
}

jest.mock('@/utils/supabase/service_server', () => ({
  __esModule: true,
  createClient: () => ({
    from: (table: string) => {
      const builder = {
        // SELECT chain — supports .eq().eq()/.is().maybeSingle() and
        // .eq().eq()/.is() resolving to a Promise on await.
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        in: () => builder,
        maybeSingle: () => Promise.resolve(nextResponse(table)),
        single: () => Promise.resolve(nextResponse(table)),
        // Make eq() chains awaitable as a promise resolving to the next response.
        // jest doesn't await our builder directly — Supabase chains end with
        // either .single/.maybeSingle or are awaited as a query result.
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(nextResponse(table)).then(resolve),
        insert: () => ({
          select: () => Promise.resolve(nextInsert(table)),
        }),
        update: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      };
      return builder;
    },
  }),
}));

import { runWithMcpContext, type McpScope } from '@/app/lib/mcp/context';
import { addUsersToContract } from '@/app/lib/mcp/add-users-to-contract';
import { createChatToolCache } from '@/lib/v2/chat/tools/cache';
import type { UserMetadata } from '@/constants/types';

const userMetadata = {
  userId: 'u1',
  userProfile: null,
  userRole: 12,
  organizationId: 'org-a',
  organizationName: 'Org A',
  organizationFY: 1,
  appModules: [],
  isTrial: false,
  cpmTrialEnabled: false,
  investorTrialEnabled: false,
  cpmMcpEnabled: false,
  investorMcpEnabled: false,
} as unknown as UserMetadata;

function withCtx<T>(scopes: McpScope[], fn: () => Promise<T>): Promise<T> {
  return runWithMcpContext(
    {
      userMetadata,
      scopes,
      tokenId: 't1',
      tokenSource: 'pat',
      cache: createChatToolCache(),
    },
    fn,
  );
}

function resetMocks() {
  for (const k of Object.keys(tableResponses)) delete tableResponses[k];
  for (const k of Object.keys(tableInsertResults)) delete tableInsertResults[k];
  mockGetContract.mockReset();
  mockSyncOrgUnits.mockClear();
}

const okContract = {
  id: 1,
  organization_id: 'org-a',
  contract_name: 'Bloomberg Terminal',
  vendor_id: 60,
  vendor: { name: 'Bloomberg' },
  term_start_date: [{ date: '2026-01-01' }],
  term_end_date: [{ date: '2027-01-01' }],
};

describe('addUsersToContract scope enforcement', () => {
  beforeEach(resetMocks);

  it('rejects dry-runs without the write scope', async () => {
    mockGetContract.mockResolvedValue(okContract);
    await expect(
      withCtx(['read'], () =>
        addUsersToContract({
          contractId: 1,
          users: [{ name: 'Alex Smith', email: 'a@x.com' }],
          dryRun: true,
          onEmployeeConflict: 'link_only',
        }),
      ),
    ).rejects.toThrow(/write/);
  });

  it('rejects writes without the write scope', async () => {
    mockGetContract.mockResolvedValue(okContract);
    await expect(
      withCtx(['read'], () =>
        addUsersToContract({
          contractId: 1,
          users: [{ name: 'Alex Smith', email: 'a@x.com' }],
          dryRun: false,
          onEmployeeConflict: 'link_only',
        }),
      ),
    ).rejects.toThrow(/write/);
  });
});

describe('addUsersToContract cross-org safety', () => {
  beforeEach(resetMocks);

  it("throws 'not found' for a contract from another org", async () => {
    mockGetContract.mockResolvedValue({
      ...okContract,
      organization_id: 'org-b',
    });
    await expect(
      withCtx(['read', 'write'], () =>
        addUsersToContract({
          contractId: 1,
          users: [{ name: 'Alex Smith', email: 'a@x.com' }],
          dryRun: true,
          onEmployeeConflict: 'link_only',
        }),
      ),
    ).rejects.toThrow(/not found/);
  });

  it("throws 'not found' for a contract with null organization_id (fail closed)", async () => {
    mockGetContract.mockResolvedValue({ ...okContract, organization_id: null });
    await expect(
      withCtx(['read', 'write'], () =>
        addUsersToContract({
          contractId: 1,
          users: [{ name: 'Alex', email: 'a@x.com' }],
          dryRun: true,
          onEmployeeConflict: 'link_only',
        }),
      ),
    ).rejects.toThrow(/not found/);
  });
});

describe('addUsersToContract plan categorization', () => {
  beforeEach(resetMocks);

  it('skips rows missing both name and first_name+last_name', async () => {
    mockGetContract.mockResolvedValue(okContract);
    tableResponses.org_employees = [{ data: [], error: null }];
    tableResponses.contract_users = [{ data: [], error: null }];

    const result = await withCtx(['read', 'write'], () =>
      addUsersToContract({
        contractId: 1,
        users: [
          { email: 'a@x.com' }, // no name → skipped
          { name: 'Alex Smith', email: 'a@x.com' }, // valid
        ],
        dryRun: true,
        onEmployeeConflict: 'link_only',
      }),
    );

    expect(result.parsedRowCount).toBe(2);
    expect(result.validRowCount).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.summary.newEmployees).toBe(1);
  });

  it('classifies a row as new_employee when no org_employees match', async () => {
    mockGetContract.mockResolvedValue(okContract);
    tableResponses.org_employees = [{ data: [], error: null }];
    tableResponses.contract_users = [{ data: [], error: null }];

    const result = await withCtx(['read', 'write'], () =>
      addUsersToContract({
        contractId: 1,
        users: [
          {
            name: 'Alex Smith',
            email: 'alex@x.com',
            employee_id: 'EMP01',
          },
        ],
        dryRun: true,
        onEmployeeConflict: 'link_only',
      }),
    );

    expect(result.summary.newEmployees).toBe(1);
    expect(result.plan[0].category).toBe('new_employee');
  });

  it('classifies a row as existing_match_clean when org_employees row is identical', async () => {
    mockGetContract.mockResolvedValue(okContract);
    tableResponses.org_employees = [
      {
        data: [
          {
            id: 99,
            organization_id: 'org-a',
            first_name: 'Alex',
            last_name: 'Smith',
            email: 'alex@x.com',
            employee_id: 'EMP01',
            cost_center: null,
            country: null,
            region: null,
            department: null,
            division: null,
            start_date: null,
            leave_date: null,
          },
        ],
        error: null,
      },
    ];
    tableResponses.contract_users = [{ data: [], error: null }];

    const result = await withCtx(['read', 'write'], () =>
      addUsersToContract({
        contractId: 1,
        users: [
          {
            name: 'Alex Smith',
            email: 'alex@x.com',
            employee_id: 'EMP01',
          },
        ],
        dryRun: true,
        onEmployeeConflict: 'link_only',
      }),
    );

    expect(result.summary.existingMatchesClean).toBe(1);
    expect(result.plan[0].category).toBe('existing_match_clean');
    expect(result.plan[0].matchedBy).toBe('employee_id');
    expect(result.plan[0].orgEmployeeId).toBe(99);
  });

  it('classifies as existing_match_with_diffs and surfaces the differences', async () => {
    mockGetContract.mockResolvedValue(okContract);
    tableResponses.org_employees = [
      {
        data: [
          {
            id: 99,
            organization_id: 'org-a',
            first_name: 'Alex',
            last_name: 'Smith',
            email: 'alex@x.com',
            employee_id: 'EMP01',
            cost_center: 'CC-100',
            country: null,
            region: null,
            department: null,
            division: null,
            start_date: null,
            leave_date: null,
          },
        ],
        error: null,
      },
    ];
    tableResponses.contract_users = [{ data: [], error: null }];

    const result = await withCtx(['read', 'write'], () =>
      addUsersToContract({
        contractId: 1,
        users: [
          {
            name: 'Alex Smith',
            email: 'alex@x.com',
            employee_id: 'EMP01',
            cost_center: 'CC-200', // changed
            country: 'USA', // new
          },
        ],
        dryRun: true,
        onEmployeeConflict: 'link_only',
      }),
    );

    expect(result.summary.existingMatchesWithDiffs).toBe(1);
    const planRow = result.plan[0];
    expect(planRow.category).toBe('existing_match_with_diffs');
    expect(planRow.differences?.cost_center).toEqual({
      from: 'CC-100',
      to: 'CC-200',
    });
    expect(planRow.differences?.country).toEqual({
      from: null,
      to: 'USA',
    });
  });

  it('classifies as already_linked when the user is already on the contract', async () => {
    mockGetContract.mockResolvedValue(okContract);
    tableResponses.org_employees = [
      {
        data: [
          {
            id: 99,
            organization_id: 'org-a',
            first_name: 'Alex',
            last_name: 'Smith',
            email: 'alex@x.com',
            employee_id: 'EMP01',
            cost_center: null,
            country: null,
            region: null,
            department: null,
            division: null,
            start_date: null,
            leave_date: null,
          },
        ],
        error: null,
      },
    ];
    tableResponses.contract_users = [
      {
        data: [
          {
            id: 7,
            contract_id: 1,
            product_id: null,
            org_employee_id: 99,
            name: 'Alex Smith',
            email: 'alex@x.com',
            employee_id: 'EMP01',
            cost_center: null,
            country: null,
            region: null,
            department: null,
            division: null,
            start_date: null,
            leave_date: null,
          },
        ],
        error: null,
      },
    ];

    const result = await withCtx(['read', 'write'], () =>
      addUsersToContract({
        contractId: 1,
        users: [
          {
            name: 'Alex Smith',
            email: 'alex@x.com',
            employee_id: 'EMP01',
          },
        ],
        dryRun: true,
        onEmployeeConflict: 'link_only',
      }),
    );

    expect(result.summary.alreadyLinked).toBe(1);
    expect(result.plan[0].category).toBe('already_linked');
    expect(result.plan[0].contractUserId).toBe(7);
  });
});

describe('addUsersToContract org unit sync', () => {
  beforeEach(resetMocks);

  it('walks org units for employees it inserts', async () => {
    mockGetContract.mockResolvedValue(okContract);
    tableResponses.org_employees = [{ data: [], error: null }];
    tableResponses.contract_users = [{ data: [], error: null }];
    tableInsertResults.org_employees = [{ data: [{ id: 501 }], error: null }];
    tableInsertResults.contract_users = [{ data: [{ id: 9 }], error: null }];

    await withCtx(['read', 'write'], () =>
      addUsersToContract({
        contractId: 1,
        users: [{ name: 'Alex Smith', email: 'alex@x.com' }],
        dryRun: false,
        onEmployeeConflict: 'link_only',
      }),
    );

    expect(mockSyncOrgUnits).toHaveBeenCalledTimes(1);
    expect(mockSyncOrgUnits).toHaveBeenCalledWith(
      'org-a',
      [501],
      expect.anything(),
    );
  });

  // The walk runs last: a hierarchy failure must not strand employees the tool
  // just created without their contract linkage.
  it('links contract users before walking org units', async () => {
    mockGetContract.mockResolvedValue(okContract);
    tableResponses.org_employees = [{ data: [], error: null }];
    tableResponses.contract_users = [{ data: [], error: null }];
    tableInsertResults.org_employees = [{ data: [{ id: 501 }], error: null }];
    tableInsertResults.contract_users = [{ data: [{ id: 9 }], error: null }];
    mockSyncOrgUnits.mockRejectedValueOnce(new Error('walk failed'));

    await expect(
      withCtx(['read', 'write'], () =>
        addUsersToContract({
          contractId: 1,
          users: [{ name: 'Alex Smith', email: 'alex@x.com' }],
          dryRun: false,
          onEmployeeConflict: 'link_only',
        }),
      ),
    ).rejects.toThrow('walk failed');

    // The queued contract_users insert result was consumed before the walk ran.
    expect(tableInsertResults.contract_users).toHaveLength(0);
  });

  it('does not walk org units on a dry run', async () => {
    mockGetContract.mockResolvedValue(okContract);
    tableResponses.org_employees = [{ data: [], error: null }];
    tableResponses.contract_users = [{ data: [], error: null }];

    await withCtx(['read', 'write'], () =>
      addUsersToContract({
        contractId: 1,
        users: [{ name: 'Alex Smith', email: 'alex@x.com' }],
        dryRun: true,
        onEmployeeConflict: 'link_only',
      }),
    );

    expect(mockSyncOrgUnits).not.toHaveBeenCalled();
  });
});
