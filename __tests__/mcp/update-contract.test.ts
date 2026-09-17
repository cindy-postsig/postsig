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

const mockSelectSingle = jest.fn<() => Promise<unknown>>();
const mockUpdate = jest.fn<() => Promise<{ error: unknown }>>();
const mockUpdatePayload = jest.fn<(payload: unknown) => void>();
const mockOrgTagsResponse = jest.fn<() => Promise<unknown>>();
const mockExistingTagsResponse = jest.fn<() => Promise<unknown>>();
const mockOwnerGroupRows = jest.fn<() => Promise<unknown>>();
const mockReplaceContractOwners =
  jest.fn<(input: unknown) => Promise<{ added: number; removed: number }>>();

jest.mock('@/lib/v2/owners/match', () => ({
  __esModule: true,
  loadSponsorMatchCatalog: async () => ({
    users: [{ id: 'u-alex', name: 'Alex', email: 'alex@example.com' }],
    employees: [],
  }),
  matchSponsorNames: (
    names: string[],
    catalog: { users: Array<{ id: string; name: string }> },
  ) =>
    names.map((name) => {
      const user = catalog.users.find((u) => u.name === name);
      return user ? { kind: 'user', id: user.id } : { kind: 'label', name };
    }),
}));

jest.mock('@/lib/v2/owners/service', () => ({
  __esModule: true,
  replaceContractOwners: (input: unknown) => mockReplaceContractOwners(input),
  readGroupUnitIds: async () =>
    (
      (await mockOwnerGroupRows()) as { data: Array<{ org_unit_id: number }> }
    ).data.map((row) => row.org_unit_id),
}));

jest.mock('@/utils/supabase/service_server', () => {
  return {
    __esModule: true,
    createClient: () => ({
      from: (table: string) => {
        if (table === 'contracts') {
          return {
            select: () => ({
              eq: () => ({ single: mockSelectSingle }),
            }),
            update: (payload: unknown) => {
              mockUpdatePayload(payload);
              return {
                eq: () => ({
                  eq: () => mockUpdate(),
                }),
              };
            },
          };
        }
        if (table === 'user_tags') {
          return {
            select: () => ({
              eq: () => ({
                in: () => mockOrgTagsResponse(),
              }),
            }),
          };
        }
        if (table === 'contract_owners') {
          return {
            select: () => ({
              eq: () => ({ eq: () => ({ eq: () => mockOwnerGroupRows() }) }),
            }),
          };
        }
        if (table === 'contract_tags') {
          return {
            select: () => ({
              eq: () => ({ eq: () => mockExistingTagsResponse() }),
            }),
            insert: () => Promise.resolve({ error: null }),
            delete: () => ({
              eq: () => ({ in: () => Promise.resolve({ error: null }) }),
            }),
          };
        }
        return {};
      },
    }),
  };
});

import { runWithMcpContext, type McpScope } from '@/app/lib/mcp/context';
import { updateContractFromMcp } from '@/app/lib/mcp/update-contract';
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

describe('updateContractFromMcp', () => {
  beforeEach(() => {
    mockSelectSingle.mockReset();
    mockUpdate.mockReset();
    mockUpdatePayload.mockReset();
    mockOrgTagsResponse.mockReset();
    mockExistingTagsResponse.mockReset();
    mockOwnerGroupRows.mockReset();
    mockReplaceContractOwners.mockReset();
    mockReplaceContractOwners.mockResolvedValue({ added: 1, removed: 0 });
  });

  it('requires the write scope', async () => {
    await expect(
      withCtx(['read'], () =>
        updateContractFromMcp(1, { business_sponsor: { name: 'Alex' } }),
      ),
    ).rejects.toThrow(/write/);
    expect(mockSelectSingle).not.toHaveBeenCalled();
  });

  it("throws 'not found' when contract belongs to a different org", async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 1, organization_id: 'org-b' },
      error: null,
    });
    await expect(
      withCtx(['read', 'write'], () =>
        updateContractFromMcp(1, { business_sponsor: { name: 'Alex' } }),
      ),
    ).rejects.toThrow(/not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("throws 'not found' when contract row has no organization_id (fail closed)", async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 1, organization_id: null },
      error: null,
    });
    await expect(
      withCtx(['read', 'write'], () =>
        updateContractFromMcp(1, { business_sponsor: { name: 'Alex' } }),
      ),
    ).rejects.toThrow(/not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects tag ids that do not belong to the org', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 1, organization_id: 'org-a' },
      error: null,
    });
    // user_tags lookup returns nothing → no requested tag was in this org
    mockOrgTagsResponse.mockResolvedValue({ data: [], error: null });
    mockExistingTagsResponse.mockResolvedValue({ data: [], error: null });

    await expect(
      withCtx(['read', 'write'], () =>
        updateContractFromMcp(1, { tags: [9999] }),
      ),
    ).rejects.toThrow(/Tag 9999 not in organization/);
  });

  it('writes sponsors as owner rows, keeps the owner groups, and never touches the contracts row', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 1, organization_id: 'org-a' },
      error: null,
    });
    mockOwnerGroupRows.mockResolvedValue({
      data: [{ org_unit_id: 11 }, { org_unit_id: 12 }],
      error: null,
    });

    const result = await withCtx(['read', 'write'], () =>
      updateContractFromMcp(1, {
        business_sponsor: [{ name: 'Alex' }, 'External Co'],
        // Not on the whitelist: contracts.business_group is frozen, so a stale
        // caller's value must never reach the row.
        ...({ business_group: 'Trading' } as object),
      }),
    );

    expect(result.contractId).toBe(1);
    expect(result.updatedFields).toEqual(['business_sponsor']);
    expect(mockReplaceContractOwners).toHaveBeenCalledTimes(1);
    expect(mockReplaceContractOwners).toHaveBeenCalledWith({
      organizationId: 'org-a',
      contractId: 1,
      sponsors: [
        { kind: 'user', id: 'u-alex' },
        { kind: 'label', name: 'External Co' },
      ],
      groupUnitIds: [11, 12],
      actorUserId: 'u1',
      actorName: undefined,
    });
    // contracts.business_sponsor is frozen (psk-1975): no writer.
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUpdatePayload).not.toHaveBeenCalled();
  });

  it.each([
    ['an object with no name', { role: 'owner' }],
    ['an object whose name is not a string', { name: 42 }],
    ['a list holding a nameless object', [{ name: 'Alex' }, {}]],
    ['an empty string', ''],
    ['a blank string', '   '],
    ['an object with a blank name', { name: '  ' }],
    ['a list holding null', [null]],
    ['a list holding a blank string', ['Alex', ' ']],
  ])('rejects %s instead of clearing the sponsors', async (_label, value) => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 1, organization_id: 'org-a' },
      error: null,
    });
    mockOwnerGroupRows.mockResolvedValue({ data: [], error: null });

    await expect(
      withCtx(['read', 'write'], () =>
        updateContractFromMcp(1, { business_sponsor: value }),
      ),
    ).rejects.toThrow(/business_sponsor/);
    expect(mockReplaceContractOwners).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['an empty list', []],
  ])('treats %s as a deliberate clear', async (_label, value) => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 1, organization_id: 'org-a' },
      error: null,
    });
    mockOwnerGroupRows.mockResolvedValue({ data: [], error: null });

    const result = await withCtx(['read', 'write'], () =>
      updateContractFromMcp(1, { business_sponsor: value }),
    );

    expect(result.updatedFields).toEqual(['business_sponsor']);
    expect(mockReplaceContractOwners).toHaveBeenCalledWith(
      expect.objectContaining({ sponsors: [] }),
    );
  });
});
