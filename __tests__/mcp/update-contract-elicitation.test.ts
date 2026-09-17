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

const mockUpdate = jest.fn<(id: number, input: unknown) => Promise<unknown>>();
jest.mock('@/app/lib/mcp/update-contract', () => ({
  __esModule: true,
  updateContractFromMcp: (id: number, input: unknown) => mockUpdate(id, input),
}));

// extractBudgetFromPriceHistory is pulled in by contracts.ts → keep the import
// graph minimal by stubbing the modules it transitively imports.
jest.mock('@/lib/v2', () => ({
  __esModule: true,
  getContractsList: jest.fn(),
  getContract: jest.fn(),
}));
jest.mock('@/lib/v2/core/budget', () => ({
  __esModule: true,
  getUSDValue: () => 0,
}));
jest.mock('@/app/lib/budget', () => ({
  __esModule: true,
  extractBudgetFromPriceHistory: () => null,
}));

import { contractsTools } from '@/app/lib/mcp/tools/cpm/contracts';
import { runWithMcpContext, type McpScope } from '@/app/lib/mcp/context';
import { createChatToolCache } from '@/lib/v2/chat/tools/cache';
import type { UserMetadata } from '@/constants/types';
import type { ElicitInput } from '@/app/lib/mcp/tools/types';

const updateTool = contractsTools.find((t) => t.name === 'update_contract')!;

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

describe('update_contract tool elicitation', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
  });

  it('proceeds without elicitation when the host does not advertise it', async () => {
    mockUpdate.mockResolvedValue({
      contractId: 1,
      updatedFields: ['business_sponsor'],
    });

    const result = await withCtx(['read', 'write'], () =>
      updateTool.handler({ id: 1, business_sponsor: 'Alex' }, {}),
    );

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ applied: true, contractId: 1 });
  });

  it('skips the mutation when elicitInput returns decline', async () => {
    const elicitInput = jest.fn(async () => ({
      action: 'decline' as const,
    })) as unknown as ElicitInput;

    const result = await withCtx(['read', 'write'], () =>
      updateTool.handler({ id: 1, business_sponsor: 'Alex' }, { elicitInput }),
    );

    expect(elicitInput).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      applied: false,
      contractId: 1,
      reason: 'decline',
    });
  });

  it('skips the mutation when elicitInput accepts but confirmed is false', async () => {
    const elicitInput = jest.fn(async () => ({
      action: 'accept' as const,
      content: { confirmed: false },
    })) as unknown as ElicitInput;

    const result = await withCtx(['read', 'write'], () =>
      updateTool.handler({ id: 1, business_sponsor: 'Alex' }, { elicitInput }),
    );

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      applied: false,
      contractId: 1,
      reason: 'declined',
    });
  });

  it('proceeds when elicitInput accepts with confirmed:true', async () => {
    mockUpdate.mockResolvedValue({
      contractId: 1,
      updatedFields: ['business_sponsor'],
    });
    const elicitInput = jest.fn(async () => ({
      action: 'accept' as const,
      content: { confirmed: true },
    })) as unknown as ElicitInput;

    const result = await withCtx(['read', 'write'], () =>
      updateTool.handler({ id: 1, business_sponsor: 'Alex' }, { elicitInput }),
    );

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ applied: true, contractId: 1 });
  });
});

describe('update_contract whitelist', () => {
  it('strips business_group: the column is frozen (psk-1846)', async () => {
    const parsed = updateTool.inputSchema.parse({
      id: 1,
      business_group: 'Trading',
    });
    expect(parsed).toEqual({ id: 1 });

    mockUpdate.mockResolvedValue({ contractId: 1, updatedFields: [] });
    await withCtx(['read', 'write'], () => updateTool.handler(parsed, {}));
    expect(mockUpdate).toHaveBeenCalledWith(1, {});
  });
});
