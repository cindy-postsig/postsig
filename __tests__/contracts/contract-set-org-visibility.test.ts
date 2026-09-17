jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const store = new Map<string, unknown>();

jest.mock('@/app/lib/redis/service', () => ({
  getRedisService: async () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return true;
    },
    del: async (key: string) => store.delete(key),
    clearOrganizationCache: async () => true,
  }),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: async () => currentUser,
}));

const fetchContractsByUserRoles = jest.fn();

jest.mock('@/data/superuser/contracts', () => ({
  fetchContractsByUserRoles: (...args: unknown[]) =>
    fetchContractsByUserRoles(...args),
}));

const rpc = jest.fn();

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ rpc }),
}));

import { fetchContractsBase } from '@/app/lib/contracts/actions';
import { userRoles } from '@/constants/data';
import type { UserMetadata } from '@/constants/types';

const ORG_ID = 'org-1';

function metadataFor(userId: string, userRole: number): UserMetadata {
  return {
    userId,
    userProfile: null,
    userRole,
    organizationId: ORG_ID,
    organizationName: 'Acme',
    organizationFY: 1,
    dateFormat: 'dd/MM/yyyy',
    organizationDateFormat: 'dd/MM/yyyy',
    baseCurrency: 'USD',
    appModules: [],
    isTrial: false,
    cpmTrialEnabled: false,
    investorTrialEnabled: false,
    cpmMcpEnabled: false,
    investorMcpEnabled: false,
    cpmInvoicesEnabled: false,
    cpmExchangeAgreementsEnabled: false,
    portcoKpisEnabled: false,
  };
}

const ORG_CONTRACTS = [1, 2, 3, 4].map((id) => ({
  id,
  currency: 'USD',
  term_start_date: null,
}));

let currentUser: UserMetadata = metadataFor('user-1', userRoles.clientAdmin);

function grantVisibility(ids: number[]) {
  rpc.mockResolvedValue({ data: ids.map((id) => ({ id })), error: null });
}

beforeEach(() => {
  store.clear();
  rpc.mockReset();
  fetchContractsByUserRoles.mockReset();
  fetchContractsByUserRoles.mockResolvedValue(ORG_CONTRACTS);
});

describe('fetchContractsBase org-wide cache', () => {
  it('fetches the whole org, then returns only the requester’s visible ids', async () => {
    currentUser = metadataFor('user-1', userRoles.clientAdmin);
    grantVisibility([1, 2]);

    const contracts = await fetchContractsBase();

    expect(fetchContractsByUserRoles).toHaveBeenCalledTimes(1);
    expect(fetchContractsByUserRoles).toHaveBeenCalledWith(
      expect.objectContaining({ orgWide: true }),
    );
    expect(rpc).toHaveBeenCalledWith('contracts_visible_to', {
      p_organization_id: ORG_ID,
      p_user_id: 'user-1',
    });
    expect(contracts.map((contract) => contract.id)).toEqual([1, 2]);
    expect(store.size).toBe(1);
  });

  it('serves a second user in the same org from the first user’s cache entry', async () => {
    currentUser = metadataFor('user-1', userRoles.clientAdmin);
    grantVisibility([1, 2]);
    await fetchContractsBase();

    currentUser = metadataFor('user-2', userRoles.clientUser);
    grantVisibility([2, 3]);
    const contracts = await fetchContractsBase();

    expect(fetchContractsByUserRoles).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);
    expect(contracts.map((contract) => contract.id)).toEqual([2, 3]);
  });

  it('gives a reviewer the full org set without an ACL lookup', async () => {
    currentUser = metadataFor('user-1', userRoles.clientAdmin);
    grantVisibility([1]);
    await fetchContractsBase();

    currentUser = metadataFor('reviewer', userRoles.postsigReviewer);
    const contracts = await fetchContractsBase();

    expect(contracts.map((contract) => contract.id)).toEqual([1, 2, 3, 4]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('gives a role outside the ACL branches nothing', async () => {
    currentUser = metadataFor('user-1', userRoles.clientAdmin);
    grantVisibility([1]);
    await fetchContractsBase();

    currentUser = metadataFor('other', userRoles.clientReviewer);
    const contracts = await fetchContractsBase();

    expect(contracts).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('returns an empty slice when the ACL lookup yields no ids', async () => {
    currentUser = metadataFor('user-1', userRoles.clientUser);
    grantVisibility([]);

    const contracts = await fetchContractsBase();

    expect(contracts).toEqual([]);
    // The org set is still cached — only the requester's slice is empty.
    expect(store.size).toBe(1);
  });
});
