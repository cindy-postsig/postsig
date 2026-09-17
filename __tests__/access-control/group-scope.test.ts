jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockGetUserMetadata = jest.fn<Promise<unknown>, []>();
jest.mock('@/data/users', () => ({
  getUserMetadata: () => mockGetUserMetadata(),
}));

const mockGetContractIdsForGroup = jest.fn<Promise<number[]>, unknown[]>();
const mockGetGroupsWithContracts = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('@/data/superuser/contracts', () => ({
  getContractIdsForGroup: (...args: unknown[]) =>
    mockGetContractIdsForGroup(...args),
  getGroupsWithContracts: (...args: unknown[]) =>
    mockGetGroupsWithContracts(...args),
}));

const mockResolveVisibleContractIds = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('@/data/utils', () => ({
  resolveVisibleContractIds: (...args: unknown[]) =>
    mockResolveVisibleContractIds(...args),
}));

const mockAclGroupRows = jest.fn<{ data: unknown; error: null }, [string]>();
const mockRpc = jest.fn<
  Promise<{ data: unknown; error: unknown }>,
  unknown[]
>();
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          in: () => Promise.resolve(mockAclGroupRows(table)),
        }),
      }),
    }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              { id: 1, name: 'Sales', public_uuid: 'u1' },
              { id: 2, name: 'Compliance', public_uuid: 'u2' },
              { id: 3, name: 'Treasury', public_uuid: 'u3' },
            ],
            error: null,
          }),
      }),
    }),
  }),
}));

import {
  getContractIdsForGroup,
  getGroupsWithContracts,
  getOrgBusinessGroups,
} from '@/lib/v2/groups/service';
import { userRoles } from '@/constants/data';

const VIEWER = {
  userId: 'user-1',
  organizationId: 'org-1',
  userRole: userRoles.clientUser,
};
const MANAGER = { ...VIEWER, userRole: userRoles.clientAdmin };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserMetadata.mockResolvedValue(VIEWER);
  mockGetContractIdsForGroup.mockResolvedValue([10, 11, 12]);
  mockResolveVisibleContractIds.mockResolvedValue(new Set([11]));
  mockRpc.mockResolvedValue({ data: [], error: null });
  mockAclGroupRows.mockImplementation((table: string) =>
    table === 'contract_acl_group'
      ? { data: [{ group_id: 1 }], error: null }
      : { data: [], error: null },
  );
});

describe('getContractIdsForGroup', () => {
  it('narrows a group to the contracts a viewer may see', async () => {
    await expect(getContractIdsForGroup(7)).resolves.toEqual([11]);
  });

  it('leaves the group intact for a role that is not read-only', async () => {
    mockGetUserMetadata.mockResolvedValue(MANAGER);
    await expect(getContractIdsForGroup(7)).resolves.toEqual([10, 11, 12]);
    expect(mockResolveVisibleContractIds).not.toHaveBeenCalled();
  });

  it('returns nothing when the viewer can see no contract in the group', async () => {
    mockResolveVisibleContractIds.mockResolvedValue(new Set([99]));
    await expect(getContractIdsForGroup(7)).resolves.toEqual([]);
  });
});

describe('getGroupsWithContracts', () => {
  beforeEach(() => {
    mockGetGroupsWithContracts.mockResolvedValue([
      { id: 1, name: 'Sales', publicUuid: 'u1' },
      { id: 2, name: 'Compliance', publicUuid: 'u2' },
    ]);
  });

  it('narrows the filter list for a viewer', async () => {
    await expect(getGroupsWithContracts()).resolves.toEqual([
      { id: 1, name: 'Sales', publicUuid: 'u1' },
    ]);
  });

  it('leaves the list intact for a role that is not read-only', async () => {
    mockGetUserMetadata.mockResolvedValue(MANAGER);
    await expect(getGroupsWithContracts()).resolves.toHaveLength(2);
  });
});

describe('getOrgBusinessGroups', () => {
  it('returns only the groups reachable from a viewer contracts', async () => {
    await expect(getOrgBusinessGroups('org-1')).resolves.toEqual([
      { id: 1, name: 'Sales', publicUuid: 'u1' },
    ]);
  });

  it('includes groups reachable through a visible folder', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 5 }], error: null });
    mockAclGroupRows.mockImplementation((table: string) =>
      table === 'contract_acl_group'
        ? { data: [], error: null }
        : { data: [{ group_id: 2 }], error: null },
    );

    await expect(getOrgBusinessGroups('org-1')).resolves.toEqual([
      { id: 2, name: 'Compliance', publicUuid: 'u2' },
    ]);
  });

  it('returns the whole organization for a role that is not read-only', async () => {
    mockGetUserMetadata.mockResolvedValue(MANAGER);
    await expect(getOrgBusinessGroups('org-1')).resolves.toHaveLength(3);
  });

  it('returns nothing when there is no caller', async () => {
    mockGetUserMetadata.mockResolvedValue(null);
    await expect(getOrgBusinessGroups('org-1')).resolves.toEqual([]);
  });

  it('fails closed when folder visibility cannot be resolved', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getOrgBusinessGroups('org-1')).rejects.toBeDefined();
  });
});
