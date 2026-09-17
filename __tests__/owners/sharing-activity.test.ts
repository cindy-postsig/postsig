import * as fs from 'fs';
import * as path from 'path';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }),
  }),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: async () => ({
    userId: 'user-1',
    userRole: 11,
    organizationId: 'org-1',
    userProfile: { name: 'Cindy', email: 'cindy@acme.com' },
  }),
}));

jest.mock('@postsig/toolkit', () => ({
  defineAbilitiesFor: () => ({ can: () => true }),
  isPostsigUser: () => false,
}));

const getContractACL = jest.fn();
const addGroupToContract = jest.fn();
const removeGroupFromContract = jest.fn();
jest.mock('@/data/superuser/contracts', () => ({
  getContractACL: (...args: unknown[]) => getContractACL(...args),
  addUserToContract: jest.fn(),
  removeUserFromContract: jest.fn(),
  addGroupToContract: (...args: unknown[]) => addGroupToContract(...args),
  removeGroupFromContract: (...args: unknown[]) =>
    removeGroupFromContract(...args),
  getBulkContractACLs: jest.fn(),
  bulkAddUserToContracts: jest.fn(),
  bulkRemoveUserFromContracts: jest.fn(),
  bulkAddGroupToContracts: jest.fn(),
  bulkRemoveGroupFromContracts: jest.fn(),
}));

jest.mock('@/data/superuser/folders', () => ({
  getFolderACL: jest.fn(),
  addUserToFolder: jest.fn(),
  removeUserFromFolder: jest.fn(),
  addGroupToFolder: jest.fn(),
  removeGroupFromFolder: jest.fn(),
}));

jest.mock('@/data/superuser/groups', () => ({
  getOrgUsers: jest.fn(),
  getOrgGroups: jest.fn(),
  getGroupMembers: jest.fn(),
}));

const logContractShared = jest.fn();
const logContractUnshared = jest.fn();
const logOwnerChanged = jest.fn();
jest.mock('@/data/superuser/activities', () => ({
  logContractShared: (...args: unknown[]) => logContractShared(...args),
  logContractUnshared: (...args: unknown[]) => logContractUnshared(...args),
  logFolderShared: jest.fn(),
  logFolderUnshared: jest.fn(),
  logOwnerChanged: (...args: unknown[]) => logOwnerChanged(...args),
}));

jest.mock('@/lib/audit', () => ({
  AUDIT_ACTIONS: {
    CONTRACT_SHARED: 'contract_shared',
    CONTRACT_ACCESS_GRANTED: 'contract_access_granted',
    CONTRACT_ACCESS_REVOKED: 'contract_access_revoked',
  },
  auditLogger: {
    logEvent: jest.fn(),
    logContractAccessEvent: jest.fn(),
  },
  getUserAuditContext: async () => ({}),
}));

import { updateContractACL } from '@/app/lib/sharing/actions';

beforeEach(() => {
  jest.clearAllMocks();
  getContractACL.mockResolvedValue({
    users: [],
    groups: [{ id: 5, name: 'Data Science' }],
  });
});

describe('sharing a contract with a group (psk-1975 decision 11)', () => {
  it('writes one contract_shared activity and no owner_changed', async () => {
    await updateContractACL(1, { addGroups: [{ groupId: 5, perm: 'read' }] });

    expect(addGroupToContract).toHaveBeenCalledWith(1, 5, 'read');
    expect(logContractShared).toHaveBeenCalledTimes(1);
    expect(logContractShared).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 1,
        sharedWith: [
          {
            type: 'group',
            id: 5,
            name: 'Data Science',
            permissionLevel: 'read',
          },
        ],
      }),
    );
    expect(logContractUnshared).not.toHaveBeenCalled();
    expect(logOwnerChanged).not.toHaveBeenCalled();
  });

  it('unsharing writes one contract_unshared activity and no owner_changed', async () => {
    await updateContractACL(1, { removeGroups: [5] });

    expect(removeGroupFromContract).toHaveBeenCalledWith(1, 5);
    expect(logContractUnshared).toHaveBeenCalledTimes(1);
    expect(logContractShared).not.toHaveBeenCalled();
    expect(logOwnerChanged).not.toHaveBeenCalled();
  });

  it('the ACL writers themselves no longer log ownership', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'data/superuser/contracts.ts'),
      'utf8',
    );
    const start = source.indexOf('export async function addGroupToContract');
    expect(start).toBeGreaterThanOrEqual(0);
    const aclWriters = source.slice(start);
    expect(aclWriters).not.toContain('logOwnerChanged');
  });
});
