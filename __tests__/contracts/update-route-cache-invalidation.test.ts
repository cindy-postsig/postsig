import { POST } from '@/app/api/contracts/update/route';
import type { NextRequest } from 'next/server';

const mockRequireContractUpdateAbility = jest.fn();
const mockInvalidateOrganizationData = jest.fn();
const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockPriorSelect = jest.fn();
const mockBuildArchiveIdSet = jest.fn();
const mockLogContractStatusChange = jest.fn();

jest.mock('@/app/api/contracts/_auth', () => ({
  requireContractUpdateAbility: () => mockRequireContractUpdateAbility(),
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({
      update: () => ({
        in: () => ({
          eq: () => ({
            select: () => mockSelect(),
          }),
        }),
      }),
      select: () => ({
        in: () => ({
          eq: () => mockPriorSelect(),
        }),
      }),
    }),
  }),
}));

jest.mock('@/app/lib/redis/cache-service', () => ({
  getCacheService: async () => ({
    invalidateOrganizationData: (...args: unknown[]) =>
      mockInvalidateOrganizationData(...args),
  }),
}));

jest.mock('@/lib/v2/contracts/archive', () => ({
  normalizeContractIds: (ids: unknown[]) => ids.map(Number),
  resolveArchiveDescendants: async () => ({
    invoiceDescendantIds: [],
    nonInvoiceDescendants: [],
  }),
  buildArchiveIdSet: (...args: unknown[]) => mockBuildArchiveIdSet(...args),
}));

jest.mock('@/data/superuser/activities', () => ({
  logContractStatusChange: (...args: unknown[]) =>
    mockLogContractStatusChange(...args),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const userMetadata = {
  organizationId: 'org-1',
  userId: 'user-1',
  userRole: 11,
};

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireContractUpdateAbility.mockResolvedValue({ userMetadata });
  mockRpc.mockResolvedValue({ data: [{ id: 1 }], error: null });
  mockSelect.mockResolvedValue({ data: [{ id: 1 }], error: null });
  mockPriorSelect.mockResolvedValue({ data: [], error: null });
  mockBuildArchiveIdSet.mockImplementation((rootIds: number[]) => rootIds);
  mockLogContractStatusChange.mockResolvedValue(true);
});

describe('POST /api/contracts/update cache invalidation', () => {
  it('invalidates the org cache on the renewal path (activating an expired contract)', async () => {
    const response = await POST(
      request({ contractIds: [1], status: 'active', updateStatusOnly: false }),
    );

    expect(mockRpc).toHaveBeenCalledWith('renew_expired_contracts', {
      p_contract_ids: [1],
      p_new_status: 'active',
    });
    expect(mockInvalidateOrganizationData).toHaveBeenCalledWith(userMetadata);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'Contracts updated successfully',
      data: [{ id: 1 }],
    });
  });

  it('invalidates the org cache on the plain status update path', async () => {
    const response = await POST(
      request({ contractIds: [1], status: 'active', updateStatusOnly: true }),
    );

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInvalidateOrganizationData).toHaveBeenCalledWith(userMetadata);
    expect(response.status).toBe(200);
  });

  it('invalidates the org cache on the archive path', async () => {
    const response = await POST(
      request({ contractIds: [1], status: 'inactive' }),
    );

    expect(mockInvalidateOrganizationData).toHaveBeenCalledWith(userMetadata);
    expect(response.status).toBe(200);
  });

  it('does not invalidate when the renewal RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const response = await POST(
      request({ contractIds: [1], status: 'active', updateStatusOnly: false }),
    );

    expect(response.status).toBe(500);
    expect(mockInvalidateOrganizationData).not.toHaveBeenCalled();
  });
});

describe('POST /api/contracts/update archive audit logging', () => {
  it('logs an archive activity for every archived contract, including cascaded children', async () => {
    mockBuildArchiveIdSet.mockReturnValue([1, 2, 3]);
    mockPriorSelect.mockResolvedValue({
      data: [
        { id: 1, status: 'active' },
        { id: 2, status: 'active' },
        { id: 3, status: 'unconfirmed' },
      ],
      error: null,
    });
    mockSelect.mockResolvedValue({
      data: [
        { id: 1, status: 'inactive' },
        { id: 2, status: 'inactive' },
        { id: 3, status: 'inactive' },
      ],
      error: null,
    });

    const response = await POST(
      request({ contractIds: [1], status: 'inactive' }),
    );

    expect(response.status).toBe(200);
    expect(mockLogContractStatusChange).toHaveBeenCalledTimes(3);
    expect(mockLogContractStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 2,
        oldStatus: 'active',
        newStatus: 'inactive',
        userId: 'user-1',
      }),
    );
    expect(mockLogContractStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 3, oldStatus: 'unconfirmed' }),
    );
  });

  it('does not log a no-op archive of an already-inactive contract', async () => {
    mockBuildArchiveIdSet.mockReturnValue([1, 2]);
    mockPriorSelect.mockResolvedValue({
      data: [
        { id: 1, status: 'active' },
        { id: 2, status: 'inactive' },
      ],
      error: null,
    });
    mockSelect.mockResolvedValue({
      data: [
        { id: 1, status: 'inactive' },
        { id: 2, status: 'inactive' },
      ],
      error: null,
    });

    await POST(request({ contractIds: [1], status: 'inactive' }));

    expect(mockLogContractStatusChange).toHaveBeenCalledTimes(1);
    expect(mockLogContractStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 1 }),
    );
  });

  it('does not log status changes on the renewal path', async () => {
    await POST(
      request({ contractIds: [1], status: 'active', updateStatusOnly: false }),
    );

    expect(mockPriorSelect).not.toHaveBeenCalled();
    expect(mockLogContractStatusChange).not.toHaveBeenCalled();
  });
});

describe('POST /api/contracts/update reactivation audit logging', () => {
  it('logs an unarchive activity for every reactivated contract, including cascaded children', async () => {
    mockPriorSelect.mockResolvedValue({
      data: [
        { id: 1, status: 'inactive' },
        { id: 2, status: 'inactive' },
      ],
      error: null,
    });
    mockSelect.mockResolvedValue({
      data: [
        { id: 1, status: 'active' },
        { id: 2, status: 'active' },
      ],
      error: null,
    });

    const response = await POST(
      request({
        contractIds: [1, 2],
        status: 'active',
        updateStatusOnly: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockLogContractStatusChange).toHaveBeenCalledTimes(2);
    expect(mockLogContractStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 2,
        oldStatus: 'inactive',
        newStatus: 'active',
        userId: 'user-1',
      }),
    );
  });

  it('does not log a no-op reactivation of an already-active contract', async () => {
    mockPriorSelect.mockResolvedValue({
      data: [
        { id: 1, status: 'inactive' },
        { id: 2, status: 'active' },
      ],
      error: null,
    });
    mockSelect.mockResolvedValue({
      data: [
        { id: 1, status: 'active' },
        { id: 2, status: 'active' },
      ],
      error: null,
    });

    await POST(
      request({
        contractIds: [1, 2],
        status: 'active',
        updateStatusOnly: true,
      }),
    );

    expect(mockLogContractStatusChange).toHaveBeenCalledTimes(1);
    expect(mockLogContractStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 1, oldStatus: 'inactive' }),
    );
  });
});
