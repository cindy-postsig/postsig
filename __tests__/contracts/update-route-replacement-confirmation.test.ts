/**
 * Archiving through the ordinary archive button must settle any open
 * replacement prompt on the same contract. The banner's "Yes" is not the only
 * route to an archived contract, so a prompt that survived a plain archive
 * would keep asking the customer to archive something already archived.
 */
import { POST } from '@/app/api/contracts/update/route';
import type { NextRequest } from 'next/server';

const mockRequireContractUpdateAbility = jest.fn();
const mockSelect = jest.fn();
const mockPriorSelect = jest.fn();
const mockBuildArchiveIdSet = jest.fn();
const mockConfirmReplacements = jest.fn();
const mockLogAlert = jest.fn();

jest.mock('@/app/api/contracts/_auth', () => ({
  requireContractUpdateAbility: () => mockRequireContractUpdateAbility(),
}));

jest.mock('@/utils/supabase/service_server', () => {
  // Built inside the factory because jest hoists mock factories above the
  // const declarations above; split across helpers to stay within the repo's
  // brace-depth cap.
  const updateEq = () => ({ select: () => mockSelect() });
  const priorIn = () => ({ eq: () => mockPriorSelect() });
  const table = () => ({
    update: () => ({ in: () => ({ eq: updateEq }) }),
    select: () => ({ in: priorIn }),
  });
  return { createClient: () => ({ rpc: jest.fn(), from: table }) };
});

jest.mock('@/app/lib/redis/cache-service', () => ({
  getCacheService: async () => ({ invalidateOrganizationData: jest.fn() }),
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
  logContractStatusChange: jest.fn(async () => true),
}));

jest.mock('@/data/superuser/contractReplacementResolution', () => ({
  confirmReplacementEventsForArchivedContracts: (...args: unknown[]) =>
    mockConfirmReplacements(...args),
}));

jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => mockLogAlert(...args),
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

/** Rows as they looked before and after the archive update. */
const statusRows = (rows: Array<[number, string]>) =>
  rows.map(([id, status]) => ({ id, status }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireContractUpdateAbility.mockResolvedValue({ userMetadata });
  mockBuildArchiveIdSet.mockImplementation((rootIds: number[]) => rootIds);
  mockPriorSelect.mockResolvedValue({
    data: statusRows([[1, 'active']]),
    error: null,
  });
  mockSelect.mockResolvedValue({
    data: statusRows([[1, 'inactive']]),
    error: null,
  });
  mockConfirmReplacements.mockResolvedValue({ confirmedCount: 1 });
});

describe('POST /api/contracts/update replacement confirmation', () => {
  it('confirms replacement events for a contract archived through the normal flow', async () => {
    const response = await POST(
      request({ contractIds: [1], status: 'inactive' }),
    );

    expect(response.status).toBe(200);
    expect(mockConfirmReplacements).toHaveBeenCalledWith({
      organizationId: 'org-1',
      contractIds: [1],
      userId: 'user-1',
    });
  });

  it('passes every cascaded child, since a prompt can hang off a descendant', async () => {
    mockBuildArchiveIdSet.mockReturnValue([1, 2, 3]);
    mockPriorSelect.mockResolvedValue({
      data: statusRows([
        [1, 'active'],
        [2, 'active'],
        [3, 'active'],
      ]),
      error: null,
    });
    mockSelect.mockResolvedValue({
      data: statusRows([
        [1, 'inactive'],
        [2, 'inactive'],
        [3, 'inactive'],
      ]),
      error: null,
    });

    await POST(request({ contractIds: [1], status: 'inactive' }));

    expect(mockConfirmReplacements).toHaveBeenCalledWith(
      expect.objectContaining({ contractIds: [1, 2, 3] }),
    );
  });

  it('skips contracts that were already inactive, so a no-op archive resolves nothing', async () => {
    mockBuildArchiveIdSet.mockReturnValue([1, 2]);
    mockPriorSelect.mockResolvedValue({
      data: statusRows([
        [1, 'active'],
        [2, 'inactive'],
      ]),
      error: null,
    });
    mockSelect.mockResolvedValue({
      data: statusRows([
        [1, 'inactive'],
        [2, 'inactive'],
      ]),
      error: null,
    });

    await POST(request({ contractIds: [1], status: 'inactive' }));

    expect(mockConfirmReplacements).toHaveBeenCalledWith(
      expect.objectContaining({ contractIds: [1] }),
    );
  });

  it('does not touch replacement events when reactivating', async () => {
    // Unarchiving is not an answer to a replacement prompt.
    await POST(
      request({ contractIds: [1], status: 'active', updateStatusOnly: true }),
    );

    expect(mockConfirmReplacements).not.toHaveBeenCalled();
  });

  it('does not touch replacement events on the renewal path', async () => {
    await POST(
      request({ contractIds: [1], status: 'active', updateStatusOnly: false }),
    );

    expect(mockConfirmReplacements).not.toHaveBeenCalled();
  });

  it('still archives successfully when confirming the event fails', async () => {
    // The contract IS archived; failing the request would misreport that.
    mockConfirmReplacements.mockRejectedValue(new Error('boom'));

    const response = await POST(
      request({ contractIds: [1], status: 'inactive' }),
    );

    expect(response.status).toBe(200);
  });

  it('pages a monitor when confirming the event fails', async () => {
    mockConfirmReplacements.mockRejectedValue(new Error('boom'));

    await POST(request({ contractIds: [1], status: 'inactive' }));

    expect(mockLogAlert).toHaveBeenCalledWith(
      'contract-replacement-fetch-failure',
      expect.any(Error),
      expect.objectContaining({ organizationId: 'org-1' }),
      expect.any(String),
    );
  });

  it('does not confirm anything when the archive update itself fails', async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: { message: 'update failed' },
    });

    const response = await POST(
      request({ contractIds: [1], status: 'inactive' }),
    );

    expect(response.status).toBe(500);
    expect(mockConfirmReplacements).not.toHaveBeenCalled();
  });

  it('does not confirm anything when the prior-status baseline query fails', async () => {
    // Without the baseline every row looks newly archived, so a contract that
    // was ALREADY inactive would have its open prompt confirmed by an archive
    // the user never performed on it. Leaving the prompt open is recoverable;
    // a wrong confirm is not.
    mockPriorSelect.mockResolvedValue({
      data: null,
      error: { message: 'baseline query failed' },
    });

    await POST(request({ contractIds: [1], status: 'inactive' }));

    expect(mockConfirmReplacements).not.toHaveBeenCalled();
  });

  it('still archives successfully when the prior-status baseline query fails', async () => {
    mockPriorSelect.mockResolvedValue({
      data: null,
      error: { message: 'baseline query failed' },
    });

    const response = await POST(
      request({ contractIds: [1], status: 'inactive' }),
    );

    expect(response.status).toBe(200);
  });

  it('pages a monitor when the prior-status baseline is unavailable', async () => {
    mockPriorSelect.mockResolvedValue({
      data: null,
      error: { message: 'baseline query failed' },
    });

    await POST(request({ contractIds: [1], status: 'inactive' }));

    expect(mockLogAlert).toHaveBeenCalledWith(
      'contract-replacement-fetch-failure',
      expect.any(Error),
      expect.objectContaining({ organizationId: 'org-1' }),
      expect.stringContaining('prior contract statuses unavailable'),
    );
  });

  it('still confirms when the baseline query succeeds but matches no rows', async () => {
    // An empty result is not a failure — it must not be conflated with one.
    mockPriorSelect.mockResolvedValue({ data: [], error: null });

    await POST(request({ contractIds: [1], status: 'inactive' }));

    expect(mockConfirmReplacements).toHaveBeenCalled();
  });
});
