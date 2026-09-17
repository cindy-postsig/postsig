const mockPushStatusToXero = jest.fn();
const mockPushStatusToRamp = jest.fn();
const mockGetConnectionForInvoice = jest.fn();
const mockLogSyncResult = jest.fn();
const mockCreateServiceClient = jest.fn();

jest.mock('@/lib/v2/integrations/invoice-sync/outbound', () => ({
  pushStatusToXero: (...args: unknown[]) => mockPushStatusToXero(...args),
  pushStatusToRamp: (...args: unknown[]) => mockPushStatusToRamp(...args),
  getConnectionForInvoice: (...args: unknown[]) =>
    mockGetConnectionForInvoice(...args),
}));

jest.mock('@/lib/v2/integrations/invoice-sync/service', () => ({
  logSyncResult: (...args: unknown[]) => mockLogSyncResult(...args),
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockCreateServiceClient(),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

let capturedHandler: any;

jest.mock('../../client', () => ({
  inngest: {
    createFunction: jest.fn((_config: any, _trigger: any, handler: any) => {
      capturedHandler = handler;
      return { handler };
    }),
  },
}));

require('../syncInvoiceStatusOutbound');

function createContractsQuery(contract: Record<string, unknown>) {
  const query: Record<string, jest.Mock> = {};
  const chain = () => jest.fn(() => query);

  query.select = chain();
  query.eq = chain();
  query.update = chain();
  query.single = jest.fn(async () => ({ data: contract, error: null }));

  return query;
}

describe('syncInvoiceStatusOutbound', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs structured old and new local and external status details', async () => {
    const contractsQuery = createContractsQuery({
      external_source: 'xero',
      external_invoice_id: 'invoice-a',
      external_invoice_status: 'AUTHORISED',
      external_integration_connection_id: 'connection-a',
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'contracts') return contractsQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });
    mockGetConnectionForInvoice.mockResolvedValue({
      id: 'connection-a',
      nango_connection_id: 'nango-a',
      status: 'connected',
      user_id: 'user-a',
    });
    mockPushStatusToXero.mockResolvedValue('AUTHORISED');

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await capturedHandler({
      event: {
        data: {
          contractId: 1120,
          organizationId: 'org-a',
          status: 'void',
          oldStatus: 'review',
          reason: 'Duplicate invoice',
          actorName: 'Ada Lovelace',
        },
      },
      step,
    });

    expect(mockPushStatusToXero).toHaveBeenCalledWith(
      'nango-a',
      'invoice-a',
      'void',
      'Duplicate invoice',
      'AUTHORISED',
      'Ada Lovelace',
    );
    expect(contractsQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        external_invoice_status: 'AUTHORISED',
      }),
    );
    expect(mockLogSyncResult).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        userId: 'user-a',
        integrationConnectionId: 'connection-a',
        provider: 'xero',
        syncType: 'outbound',
        status: 'success',
        recordsProcessed: 1,
        details: {
          event: 'invoice_status_updated',
          contract_id: 1120,
          invoice_status_old: 'review',
          invoice_status_new: 'void',
          external_status_old: 'AUTHORISED',
          external_status_new: 'AUTHORISED',
          reason: 'Duplicate invoice',
          actor_name: 'Ada Lovelace',
        },
      }),
    );
  });

  it('sends local-only Xero statuses for history-note sync', async () => {
    const contractsQuery = createContractsQuery({
      external_source: 'xero',
      external_invoice_id: 'invoice-a',
      external_invoice_status: 'SUBMITTED',
      external_integration_connection_id: 'connection-a',
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'contracts') return contractsQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });
    mockGetConnectionForInvoice.mockResolvedValue({
      id: 'connection-a',
      nango_connection_id: 'nango-a',
      status: 'connected',
      user_id: 'user-a',
    });
    mockPushStatusToXero.mockResolvedValue('SUBMITTED');

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await expect(
      capturedHandler({
        event: {
          data: {
            contractId: 1120,
            organizationId: 'org-a',
            status: 'declined',
            oldStatus: 'review',
            reason: 'Rejected in PostSig',
            actorName: 'Ada Lovelace',
          },
        },
        step,
      }),
    ).resolves.toEqual({
      contractId: 1120,
      provider: 'xero',
      status: 'declined',
    });

    expect(mockPushStatusToXero).toHaveBeenCalledWith(
      'nango-a',
      'invoice-a',
      'declined',
      'Rejected in PostSig',
      'SUBMITTED',
      'Ada Lovelace',
    );
    expect(contractsQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        external_invoice_status: 'SUBMITTED',
      }),
    );
    expect(mockLogSyncResult).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          invoice_status_new: 'declined',
          external_status_new: 'SUBMITTED',
          reason: 'Rejected in PostSig',
        }),
      }),
    );
  });

  it('still skips Xero review because it is inbound-reconciled only', async () => {
    const contractsQuery = createContractsQuery({
      external_source: 'xero',
      external_invoice_id: 'invoice-a',
      external_invoice_status: 'SUBMITTED',
      external_integration_connection_id: 'connection-a',
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'contracts') return contractsQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const step = {
      run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    await expect(
      capturedHandler({
        event: {
          data: {
            contractId: 1120,
            organizationId: 'org-a',
            status: 'review',
            oldStatus: 'declined',
            reason: null,
            actorName: 'Ada Lovelace',
          },
        },
        step,
      }),
    ).resolves.toEqual({ skipped: true });

    expect(mockGetConnectionForInvoice).not.toHaveBeenCalled();
    expect(mockPushStatusToXero).not.toHaveBeenCalled();
    expect(contractsQuery.update).not.toHaveBeenCalled();
  });
});
