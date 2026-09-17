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
const mockGetBusinessGroupsByLeaf = jest.fn(
  async (..._args: unknown[]) =>
    new Map<number, { id: number; name: string }>(),
);
jest.mock('@/lib/v2/org-units', () => ({
  syncOrgUnitsForEmployees: (...args: unknown[]) => mockSyncOrgUnits(...args),
  getBusinessGroupsByLeaf: (...args: unknown[]) =>
    mockGetBusinessGroupsByLeaf(...args),
}));

const singleResponses: unknown[] = [];

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        insert: () => builder,
        update: () => builder,
        eq: () => builder,
        is: () => builder,
        single: () =>
          Promise.resolve(
            singleResponses.shift() ?? {
              data: null,
              error: { message: 'no response queued' },
            },
          ),
      });
      return builder;
    },
  }),
}));

import {
  addOrgEmployee,
  updateOrgEmployee,
} from '@/data/superuser/org-employees';

beforeEach(() => {
  singleResponses.length = 0;
  mockSyncOrgUnits.mockClear();
  mockGetBusinessGroupsByLeaf.mockClear();
});

describe('org unit sync wiring', () => {
  it('addOrgEmployee walks the inserted employee with no override when no group was submitted', async () => {
    singleResponses.push({ data: { id: 42 }, error: null });
    singleResponses.push({ data: { id: 42, org_unit_id: null }, error: null });

    await addOrgEmployee({
      organizationId: 'org-1',
      first_name: 'Alex',
      last_name: 'Smith',
    });

    expect(mockSyncOrgUnits).toHaveBeenCalledTimes(1);
    expect(mockSyncOrgUnits).toHaveBeenCalledWith(
      'org-1',
      [42],
      expect.anything(),
      undefined,
    );
  });

  it('addOrgEmployee hands the submitted business-group node to the walk', async () => {
    singleResponses.push({ data: { id: 42 }, error: null });
    singleResponses.push({ data: { id: 42, org_unit_id: 5 }, error: null });

    await addOrgEmployee({
      organizationId: 'org-1',
      first_name: 'Alex',
      last_name: 'Smith',
      business_group_node_id: 9,
    });

    expect(mockSyncOrgUnits).toHaveBeenCalledWith(
      'org-1',
      [42],
      expect.anything(),
      new Map([[42, 9]]),
    );
  });

  it('addOrgEmployee does not walk when the insert fails', async () => {
    singleResponses.push({ data: null, error: { message: 'boom' } });

    await expect(
      addOrgEmployee({
        organizationId: 'org-1',
        first_name: 'Alex',
        last_name: 'Smith',
      }),
    ).rejects.toBeTruthy();
    expect(mockSyncOrgUnits).not.toHaveBeenCalled();
  });

  // The recorded contract: a walk failure after the row landed propagates and
  // the row keeps org_unit_id null. Retrying this call would insert again, so
  // recovery is the bulk import (which matches the existing row by id, email,
  // or name and updates it) or the backfill script.
  it('addOrgEmployee surfaces a sync failure after the insert succeeded', async () => {
    singleResponses.push({ data: { id: 42 }, error: null });
    mockSyncOrgUnits.mockRejectedValueOnce(new Error('walk failed'));

    await expect(
      addOrgEmployee({
        organizationId: 'org-1',
        first_name: 'Alex',
        last_name: 'Smith',
      }),
    ).rejects.toThrow('walk failed');
  });

  it('updateOrgEmployee walks with an explicit null override when the group is cleared', async () => {
    singleResponses.push({
      data: { organization_id: 'org-1', deleted_at: null },
      error: null,
    });
    singleResponses.push({ data: { id: 7, org_unit_id: null }, error: null });

    await updateOrgEmployee({
      employeeId: 7,
      first_name: 'Alex',
      last_name: 'Smith',
      business_group_node_id: null,
    });

    expect(mockSyncOrgUnits).toHaveBeenCalledTimes(1);
    expect(mockSyncOrgUnits).toHaveBeenCalledWith(
      'org-1',
      [7],
      expect.anything(),
      new Map([[7, null]]),
    );
  });

  it('updateOrgEmployee walks with no override when the group field was not submitted', async () => {
    singleResponses.push({
      data: { organization_id: 'org-1', deleted_at: null },
      error: null,
    });
    singleResponses.push({ data: { id: 7, org_unit_id: null }, error: null });

    await updateOrgEmployee({
      employeeId: 7,
      first_name: 'Alex',
      last_name: 'Smith',
    });

    expect(mockSyncOrgUnits).toHaveBeenCalledWith(
      'org-1',
      [7],
      expect.anything(),
      undefined,
    );
  });
});
