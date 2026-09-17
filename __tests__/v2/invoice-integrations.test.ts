import {
  fetchRampInvoices,
  fetchRampInvoiceById,
  fetchXeroInvoiceById,
  fetchXeroInvoices,
  getActiveConnections,
  getImportedInvoiceStatusCandidates,
  getInvoiceContractsNeedingRepair,
  getLastSuccessfulSyncAt,
  logSyncResult,
  updateImportedInvoiceExternalStatus,
  upsertInvoiceAsContract,
} from '@/lib/v2/integrations/invoice-sync/service';
import {
  getRampExternalInvoiceStatus,
  mapRampStatusToInvoiceStatus,
  mapXeroStatusToInvoiceStatus,
} from '@/lib/v2/integrations/invoice-sync/transforms';
import { ContractActivityType } from '@/constants/types';
import {
  getConnectionForInvoice,
  pushStatusToXero,
} from '@/lib/v2/integrations/invoice-sync/outbound';
import type { MappedInvoiceContract } from '@/lib/v2/integrations/invoice-sync/types';

const mockCreateServiceClient = jest.fn();
const mockGetNangoClient = jest.fn();

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockCreateServiceClient(),
}));

jest.mock('@/lib/api/nango', () => ({
  getNangoClient: () => mockGetNangoClient(),
  NANGO_PROVIDER_IDS: {
    xero: 'xero',
    ramp: 'ramp',
  },
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

function createQuery(result: unknown = { data: null }) {
  const query: Record<string, jest.Mock> = {};
  const chain = () => jest.fn(() => query);

  query.select = chain();
  query.eq = chain();
  query.not = chain();
  query.ilike = chain();
  query.limit = chain();
  query.order = chain();
  query.update = chain();
  query.insert = chain();
  query.single = jest.fn(async () => result);
  query.maybeSingle = jest.fn(async () => result);
  query.then = jest.fn((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject),
  );

  return query;
}

describe('user-owned invoice integrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps Xero invoice statuses to PostSig invoice statuses', () => {
    expect(mapXeroStatusToInvoiceStatus('DRAFT')).toBe('incomplete');
    expect(mapXeroStatusToInvoiceStatus('SUBMITTED')).toBe('review');
    expect(mapXeroStatusToInvoiceStatus('AUTHORISED')).toBe('approved');
    expect(mapXeroStatusToInvoiceStatus('VOIDED')).toBe('void');
    expect(mapXeroStatusToInvoiceStatus('PAID')).toBe('paid');
    expect(mapXeroStatusToInvoiceStatus('DELETED')).toBe('declined');
  });

  it('maps Ramp bill statuses to PostSig invoice statuses', () => {
    expect(mapRampStatusToInvoiceStatus('INITIALIZED')).toBe('review');
    expect(mapRampStatusToInvoiceStatus('PENDING')).toBe('review');
    expect(mapRampStatusToInvoiceStatus('APPROVED')).toBe('approved');
    expect(mapRampStatusToInvoiceStatus('TERMINATED')).toBe('void');
    expect(mapRampStatusToInvoiceStatus('REJECTED')).toBe('declined');
    expect(mapRampStatusToInvoiceStatus('PAID')).toBe('paid');
  });

  it('uses paid Ramp bill status before approval status', () => {
    expect(
      getRampExternalInvoiceStatus({
        id: 'bill-a',
        status: 'PAID',
        approval_status: 'APPROVED',
        currency_code: 'USD',
        amount: 10,
      }),
    ).toBe('PAID');
  });

  it('fetches only submitted Xero accounts payable invoices', async () => {
    const nango = {
      getMetadata: jest.fn(async () => ({ xeroTenantId: 'tenant-a' })),
      proxy: jest.fn(async () => ({ data: { Invoices: [] } })),
    };
    mockGetNangoClient.mockReturnValue(nango);

    await expect(
      fetchXeroInvoices('nango-a', '2026-05-21T10:00:00.000Z'),
    ).resolves.toEqual([]);

    expect(nango.proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        endpoint: '/api.xro/2.0/Invoices',
        providerConfigKey: 'xero',
        connectionId: 'nango-a',
        headers: {
          'Xero-Tenant-Id': 'tenant-a',
          'If-Modified-Since': '2026-05-21T10:00:00.000Z',
        },
        params: {
          Statuses: 'SUBMITTED',
          where: 'Type=="ACCPAY"',
          page: 1,
        },
      }),
    );
  });

  it('fetches a Xero invoice by ID for status reconciliation', async () => {
    const nango = {
      getMetadata: jest.fn(async () => ({ xeroTenantId: 'tenant-a' })),
      proxy: jest.fn(async () => ({
        data: { Invoices: [{ InvoiceID: 'invoice-a', Status: 'PAID' }] },
      })),
    };
    mockGetNangoClient.mockReturnValue(nango);

    await expect(fetchXeroInvoiceById('nango-a', 'invoice-a')).resolves.toEqual(
      { InvoiceID: 'invoice-a', Status: 'PAID' },
    );

    expect(nango.proxy).toHaveBeenCalledWith({
      method: 'GET',
      endpoint: '/api.xro/2.0/Invoices/invoice-a',
      providerConfigKey: 'xero',
      connectionId: 'nango-a',
      headers: { 'Xero-Tenant-Id': 'tenant-a' },
    });
  });

  it.each(['approved', 'void', 'incomplete', 'declined', 'paid'])(
    'writes a Xero history note for local %s without changing Xero status',
    async (postsigStatus) => {
      const nango = {
        getMetadata: jest.fn(async () => ({ xeroTenantId: 'tenant-a' })),
        proxy: jest.fn(async () => ({ data: {} })),
      };
      mockGetNangoClient.mockReturnValue(nango);

      await expect(
        pushStatusToXero(
          'nango-a',
          'invoice-a',
          postsigStatus,
          'PostSig reason',
          'SUBMITTED',
          'Ada Lovelace',
        ),
      ).resolves.toBe('SUBMITTED');

      expect(nango.proxy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          endpoint: '/api.xro/2.0/Invoices',
        }),
      );
      expect(nango.proxy).toHaveBeenCalledWith({
        method: 'PUT',
        endpoint: '/api.xro/2.0/Invoices/invoice-a/History',
        providerConfigKey: 'xero',
        connectionId: 'nango-a',
        headers: { 'Xero-Tenant-Id': 'tenant-a' },
        data: {
          HistoryRecords: [
            {
              Details: `PostSig status: ${postsigStatus}\nPostSig user: Ada Lovelace\nReason: PostSig reason`,
            },
          ],
        },
      });
    },
  );

  it('fetches a Ramp bill by ID for status reconciliation', async () => {
    const nango = {
      proxy: jest.fn(async () => ({
        data: { id: 'bill-a', state: 'PAID' },
      })),
    };
    mockGetNangoClient.mockReturnValue(nango);

    await expect(fetchRampInvoiceById('nango-a', 'bill-a')).resolves.toEqual({
      id: 'bill-a',
      state: 'PAID',
    });

    expect(nango.proxy).toHaveBeenCalledWith({
      method: 'GET',
      endpoint: '/developer/v1/bills/bill-a',
      providerConfigKey: 'ramp',
      connectionId: 'nango-a',
    });
  });

  it('fetches only initialized and pending Ramp bills for initial invoice import', async () => {
    const nango = {
      proxy: jest.fn(async (request: any) => {
        if (
          request.params.approval_status === 'INITIALIZED' &&
          !request.params.next
        ) {
          return {
            data: {
              data: [{ id: 'bill-initialized-a' }],
              page: { next: 'cursor-a' },
            },
          };
        }

        if (request.params.next === 'cursor-a') {
          return {
            data: {
              data: [{ id: 'bill-initialized-b' }],
              page: {},
            },
          };
        }

        return { data: { data: [], page: {} } };
      }),
    };
    mockGetNangoClient.mockReturnValue(nango);

    await expect(
      fetchRampInvoices('nango-a', '2026-05-21T10:00:00.000Z'),
    ).resolves.toEqual([
      { id: 'bill-initialized-a' },
      { id: 'bill-initialized-b' },
    ]);

    expect(nango.proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        endpoint: '/developer/v1/bills',
        providerConfigKey: 'ramp',
        connectionId: 'nango-a',
        params: {
          approval_status: 'INITIALIZED',
          from_date: '2026-05-21T10:00:00.000Z',
        },
      }),
    );
    expect(nango.proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        endpoint: '/developer/v1/bills',
        providerConfigKey: 'ramp',
        connectionId: 'nango-a',
        params: {
          approval_status: 'INITIALIZED',
          from_date: '2026-05-21T10:00:00.000Z',
          next: 'cursor-a',
        },
      }),
    );
    expect(nango.proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        endpoint: '/developer/v1/bills',
        providerConfigKey: 'ramp',
        connectionId: 'nango-a',
        params: {
          approval_status: 'PENDING',
          from_date: '2026-05-21T10:00:00.000Z',
        },
      }),
    );
    expect(nango.proxy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
  });

  it('loads inbound sync watermarks for the integration connection', async () => {
    const logsQuery = createQuery({
      data: { completed_at: '2026-05-21T10:00:00.000Z' },
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => logsQuery),
    });

    await expect(getLastSuccessfulSyncAt('connection-a')).resolves.toBe(
      '2026-05-21T10:00:00.000Z',
    );

    expect(logsQuery.eq).toHaveBeenCalledWith(
      'integration_connection_id',
      'connection-a',
    );
    expect(logsQuery.eq).not.toHaveBeenCalledWith(
      'organization_id',
      expect.anything(),
    );
  });

  it('filters disabled connections from scheduled active connection lookup', async () => {
    const connectionsQuery = createQuery({ data: [] });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => connectionsQuery),
    });

    await expect(getActiveConnections()).resolves.toEqual([]);

    expect(connectionsQuery.eq).toHaveBeenCalledWith('status', 'connected');
    expect(connectionsQuery.eq).toHaveBeenCalledWith('sync_enabled', true);
  });

  it('can include disabled connections for manual active connection lookup', async () => {
    const connection = {
      id: 'connection-a',
      organization_id: 'org-a',
      user_id: 'user-a',
      provider: 'xero',
      nango_connection_id: 'nango-a',
      sync_enabled: false,
      import_new_invoices: true,
      track_unpaid_invoices: true,
    };
    const connectionsQuery = createQuery({ data: [connection] });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => connectionsQuery),
    });

    await expect(
      getActiveConnections({
        integrationConnectionId: 'connection-a',
        includeDisabled: true,
      }),
    ).resolves.toEqual([connection]);

    expect(connectionsQuery.eq).toHaveBeenCalledWith('status', 'connected');
    expect(connectionsQuery.eq).toHaveBeenCalledWith('id', 'connection-a');
    expect(connectionsQuery.eq).not.toHaveBeenCalledWith('sync_enabled', true);
  });

  it('excludes manual active connections without a Nango connection id', async () => {
    const connectionsQuery = createQuery({
      data: [
        {
          id: 'connection-a',
          organization_id: 'org-a',
          user_id: 'user-a',
          provider: 'xero',
          nango_connection_id: null,
          sync_enabled: false,
        },
      ],
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => connectionsQuery),
    });

    await expect(
      getActiveConnections({
        integrationConnectionId: 'connection-a',
        includeDisabled: true,
      }),
    ).resolves.toEqual([]);
  });

  it('writes structured sync log details separately from errors', async () => {
    const logsQuery = createQuery();
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => logsQuery),
    });

    await logSyncResult({
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
        external_status_old: 'AUTHORISED',
        external_status_new: 'VOIDED',
      },
      startedAt: new Date('2026-05-21T10:00:00.000Z'),
    });

    expect(logsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-a',
        user_id: 'user-a',
        integration_connection_id: 'connection-a',
        provider: 'xero',
        sync_type: 'outbound',
        status: 'success',
        records_processed: 1,
        details: {
          event: 'invoice_status_updated',
          contract_id: 1120,
          external_status_old: 'AUTHORISED',
          external_status_new: 'VOIDED',
        },
        error_details: null,
        started_at: '2026-05-21T10:00:00.000Z',
      }),
    );
  });

  it('loads repair candidates for the owning integration connection', async () => {
    const contractsQuery = createQuery({ data: [] });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => contractsQuery),
    });

    await expect(
      getInvoiceContractsNeedingRepair('connection-a', 'xero'),
    ).resolves.toEqual([]);

    expect(contractsQuery.eq).toHaveBeenCalledWith(
      'external_integration_connection_id',
      'connection-a',
    );
    expect(contractsQuery.eq).toHaveBeenCalledWith('external_source', 'xero');
  });

  it('loads imported invoice status reconciliation candidates', async () => {
    const contractsQuery = createQuery({
      data: [
        {
          id: 42,
          external_invoice_id: 'invoice-a',
          external_invoice_status: 'AUTHORISED',
          invoice_status: 'approved',
        },
      ],
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => contractsQuery),
    });

    await expect(
      getImportedInvoiceStatusCandidates('connection-a', 'xero'),
    ).resolves.toEqual([
      {
        contractId: 42,
        externalInvoiceId: 'invoice-a',
        externalInvoiceStatus: 'AUTHORISED',
        invoiceStatus: 'approved',
      },
    ]);

    expect(contractsQuery.eq).toHaveBeenCalledWith(
      'external_integration_connection_id',
      'connection-a',
    );
    expect(contractsQuery.eq).toHaveBeenCalledWith('external_source', 'xero');
    expect(contractsQuery.not).toHaveBeenCalledWith(
      'external_invoice_id',
      'is',
      null,
    );
  });

  it('updates imported invoice external status and logs the change', async () => {
    const contractsQuery = createQuery({
      data: {
        external_invoice_status: 'AUTHORISED',
        invoice_status: 'approved',
      },
    });
    const logsQuery = createQuery();
    const from = jest.fn((table: string) => {
      if (table === 'contracts') return contractsQuery;
      if (table === 'integration_sync_logs') return logsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    mockCreateServiceClient.mockReturnValue({ from });

    await expect(
      updateImportedInvoiceExternalStatus({
        contractId: 42,
        externalInvoiceId: 'invoice-a',
        externalStatusOld: 'AUTHORISED',
        externalStatusNew: 'PAID',
        invoiceStatusOld: 'approved',
        organizationId: 'org-a',
        userId: 'user-a',
        integrationConnectionId: 'connection-a',
        provider: 'xero',
        startedAt: new Date('2026-05-21T10:00:00.000Z'),
      }),
    ).resolves.toBe(true);

    expect(contractsQuery.update).toHaveBeenCalledWith({
      external_invoice_status: 'PAID',
      invoice_status: 'paid',
      last_synced_at: expect.any(String),
    });
    expect(contractsQuery.eq).toHaveBeenCalledWith('id', 42);
    expect(logsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-a',
        user_id: 'user-a',
        integration_connection_id: 'connection-a',
        provider: 'xero',
        sync_type: 'inbound',
        status: 'success',
        records_processed: 1,
        details: {
          event: 'external_invoice_status_changed',
          contract_id: 42,
          external_invoice_id: 'invoice-a',
          external_status_old: 'AUTHORISED',
          external_status_new: 'PAID',
          invoice_status_old: 'approved',
          invoice_status_new: 'paid',
        },
      }),
    );
  });

  it.each([
    {
      name: 'changes incomplete to approved when Xero becomes authorised',
      externalStatusOld: 'SUBMITTED',
      externalStatusNew: 'AUTHORISED',
      invoiceStatusOld: 'incomplete',
      expectedInvoiceStatusNew: 'approved',
      expectedUpdate: {
        external_invoice_status: 'AUTHORISED',
        invoice_status: 'approved',
        last_synced_at: expect.any(String),
      },
    },
    {
      name: 'changes declined to paid when Xero becomes paid',
      externalStatusOld: 'AUTHORISED',
      externalStatusNew: 'PAID',
      invoiceStatusOld: 'declined',
      expectedInvoiceStatusNew: 'paid',
      expectedUpdate: {
        external_invoice_status: 'PAID',
        invoice_status: 'paid',
        last_synced_at: expect.any(String),
      },
    },
    {
      name: 'changes paid to review when Xero moves back to submitted',
      externalStatusOld: 'PAID',
      externalStatusNew: 'SUBMITTED',
      invoiceStatusOld: 'paid',
      expectedInvoiceStatusNew: 'review',
      expectedUpdate: {
        external_invoice_status: 'SUBMITTED',
        invoice_status: 'review',
        last_synced_at: expect.any(String),
      },
    },
    {
      name: 'changes local void to review when Xero is submitted',
      externalStatusOld: 'VOIDED',
      externalStatusNew: 'SUBMITTED',
      invoiceStatusOld: 'void',
      expectedInvoiceStatusNew: 'review',
      expectedUpdate: {
        external_invoice_status: 'SUBMITTED',
        invoice_status: 'review',
        last_synced_at: expect.any(String),
      },
    },
    {
      name: 'changes review to void when Xero becomes voided',
      externalStatusOld: 'SUBMITTED',
      externalStatusNew: 'VOIDED',
      invoiceStatusOld: 'review',
      expectedInvoiceStatusNew: 'void',
      expectedUpdate: {
        external_invoice_status: 'VOIDED',
        invoice_status: 'void',
        last_synced_at: expect.any(String),
      },
    },
  ])(
    'reconciles changed Xero inbound status: $name',
    async ({
      externalStatusOld,
      externalStatusNew,
      invoiceStatusOld,
      expectedInvoiceStatusNew,
      expectedUpdate,
    }) => {
      const contractsQuery = createQuery({
        data: {
          external_invoice_status: externalStatusOld,
          invoice_status: invoiceStatusOld,
        },
      });
      const logsQuery = createQuery();
      const from = jest.fn((table: string) => {
        if (table === 'contracts') return contractsQuery;
        if (table === 'integration_sync_logs') return logsQuery;
        throw new Error(`Unexpected table ${table}`);
      });
      mockCreateServiceClient.mockReturnValue({ from });

      await expect(
        updateImportedInvoiceExternalStatus({
          contractId: 42,
          externalInvoiceId: 'invoice-a',
          externalStatusOld,
          externalStatusNew,
          invoiceStatusOld,
          organizationId: 'org-a',
          userId: 'user-a',
          integrationConnectionId: 'connection-a',
          provider: 'xero',
          startedAt: new Date('2026-05-21T10:00:00.000Z'),
        }),
      ).resolves.toBe(true);

      expect(contractsQuery.update).toHaveBeenCalledWith(expectedUpdate);
      expect(logsQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'xero',
          sync_type: 'inbound',
          details: expect.objectContaining({
            external_status_old: externalStatusOld,
            external_status_new: externalStatusNew,
            invoice_status_old: invoiceStatusOld,
            invoice_status_new: expectedInvoiceStatusNew,
          }),
        }),
      );
    },
  );

  it('updates imported Ramp bill status using paid bill status override', async () => {
    const contractsQuery = createQuery({
      data: {
        external_invoice_status: 'APPROVED',
        invoice_status: 'approved',
      },
    });
    const logsQuery = createQuery();
    const from = jest.fn((table: string) => {
      if (table === 'contracts') return contractsQuery;
      if (table === 'integration_sync_logs') return logsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    mockCreateServiceClient.mockReturnValue({ from });

    await expect(
      updateImportedInvoiceExternalStatus({
        contractId: 42,
        externalInvoiceId: 'bill-a',
        externalStatusOld: 'APPROVED',
        externalStatusNew: 'PAID',
        invoiceStatusOld: 'approved',
        organizationId: 'org-a',
        userId: 'user-a',
        integrationConnectionId: 'connection-a',
        provider: 'ramp',
        startedAt: new Date('2026-05-21T10:00:00.000Z'),
      }),
    ).resolves.toBe(true);

    expect(contractsQuery.update).toHaveBeenCalledWith({
      external_invoice_status: 'PAID',
      invoice_status: 'paid',
      last_synced_at: expect.any(String),
    });
    expect(logsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'ramp',
        sync_type: 'inbound',
        details: expect.objectContaining({
          external_invoice_id: 'bill-a',
          external_status_old: 'APPROVED',
          external_status_new: 'PAID',
          invoice_status_old: 'approved',
          invoice_status_new: 'paid',
        }),
      }),
    );
  });

  it('refreshes imported invoice last synced time without logging unchanged statuses', async () => {
    const contractsQuery = createQuery({
      data: {
        external_invoice_status: 'AUTHORISED',
        invoice_status: 'approved',
      },
    });
    const logsQuery = createQuery();
    const from = jest.fn((table: string) => {
      if (table === 'contracts') return contractsQuery;
      if (table === 'integration_sync_logs') return logsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    mockCreateServiceClient.mockReturnValue({ from });

    await expect(
      updateImportedInvoiceExternalStatus({
        contractId: 42,
        externalInvoiceId: 'invoice-a',
        externalStatusOld: 'AUTHORISED',
        externalStatusNew: 'AUTHORISED',
        invoiceStatusOld: 'approved',
        organizationId: 'org-a',
        userId: 'user-a',
        integrationConnectionId: 'connection-a',
        provider: 'xero',
      }),
    ).resolves.toBe(false);

    expect(contractsQuery.update).toHaveBeenCalledWith({
      last_synced_at: expect.any(String),
    });
    expect(logsQuery.insert).not.toHaveBeenCalled();
  });

  it('keeps overlapping invoices with the original user connection', async () => {
    const vendorQuery = createQuery({ data: null });
    const contractsQuery = createQuery({
      data: {
        id: 42,
        external_integration_connection_id: 'connection-a',
      },
    });
    const from = jest.fn((table: string) => {
      if (table === 'vendors') return vendorQuery;
      if (table === 'contracts') return contractsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    mockCreateServiceClient.mockReturnValue({ from });

    const mapped: MappedInvoiceContract = {
      external_source: 'xero',
      external_invoice_id: 'invoice-1',
      external_invoice_status: 'AUTHORISED',
      type_id: 6,
      invoice_status: 'approved',
      vendor_name: 'Acme',
      currency: 'USD',
      current_budget: 10,
      billing_frequency: 'One-Time',
      execution_date: null,
      due_date: null,
      term_start_date: null,
      term_end_date: null,
      summary: 'Xero Invoice invoice-1',
      last_synced_at: '2026-05-21T10:00:00.000Z',
      status_id: 1,
    };

    await expect(
      upsertInvoiceAsContract(mapped, 'org-a', 'user-b', 'connection-b'),
    ).resolves.toBeNull();

    expect(contractsQuery.update).not.toHaveBeenCalled();
    expect(contractsQuery.insert).not.toHaveBeenCalled();
  });

  it('logs an invoice imported activity for newly imported external invoices', async () => {
    const vendorQuery = createQuery({ data: null });
    const activitiesQuery = createQuery();

    const contractsQuery: Record<string, jest.Mock> = {};
    const chain = () => jest.fn(() => contractsQuery);
    contractsQuery.select = chain();
    contractsQuery.eq = chain();
    contractsQuery.insert = jest.fn(() => contractsQuery);
    contractsQuery.single = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 42 }, error: null });

    const from = jest.fn((table: string) => {
      if (table === 'vendors') return vendorQuery;
      if (table === 'contracts') return contractsQuery;
      if (table === 'activities') return activitiesQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    mockCreateServiceClient.mockReturnValue({ from });

    const mapped: MappedInvoiceContract = {
      external_source: 'xero',
      external_invoice_id: 'invoice-1',
      external_invoice_status: 'SUBMITTED',
      type_id: 6,
      invoice_status: 'review',
      vendor_name: 'Acme',
      currency: 'USD',
      current_budget: 10,
      billing_frequency: 'One-Time',
      execution_date: null,
      due_date: null,
      term_start_date: null,
      term_end_date: null,
      summary: 'Xero Invoice invoice-1',
      last_synced_at: '2026-05-21T10:00:00.000Z',
      status_id: 1,
    };

    await expect(
      upsertInvoiceAsContract(mapped, 'org-a', 'user-a', 'connection-a'),
    ).resolves.toEqual({ contractId: 42, isNew: true });

    expect(activitiesQuery.insert).toHaveBeenCalledWith({
      contract_id: 42,
      user_id: 'user-a',
      activity_type: ContractActivityType.INVOICE_IMPORTED,
      activity_data: {
        provider: 'xero',
        external_invoice_id: 'invoice-1',
        external_invoice_status: 'SUBMITTED',
      },
    });
  });

  it('logs inbound provider status changes for existing invoice contracts', async () => {
    const vendorQuery = createQuery({ data: null });
    const contractsQuery = createQuery({
      data: {
        id: 42,
        external_integration_connection_id: 'connection-a',
        external_invoice_status: 'SUBMITTED',
        invoice_status: 'review',
      },
    });
    const logsQuery = createQuery();
    const from = jest.fn((table: string) => {
      if (table === 'vendors') return vendorQuery;
      if (table === 'contracts') return contractsQuery;
      if (table === 'integration_sync_logs') return logsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    mockCreateServiceClient.mockReturnValue({ from });

    const mapped: MappedInvoiceContract = {
      external_source: 'xero',
      external_invoice_id: 'invoice-1',
      external_invoice_status: 'AUTHORISED',
      type_id: 6,
      invoice_status: 'approved',
      vendor_name: 'Acme',
      currency: 'USD',
      current_budget: 10,
      billing_frequency: 'One-Time',
      execution_date: null,
      due_date: null,
      term_start_date: null,
      term_end_date: null,
      summary: 'Xero Invoice invoice-1',
      last_synced_at: '2026-05-21T10:00:00.000Z',
      status_id: 1,
    };

    await expect(
      upsertInvoiceAsContract(mapped, 'org-a', 'user-a', 'connection-a'),
    ).resolves.toEqual({ contractId: 42, isNew: false });

    expect(contractsQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        external_invoice_status: 'AUTHORISED',
        invoice_status: 'approved',
      }),
    );
    expect(logsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-a',
        user_id: 'user-a',
        integration_connection_id: 'connection-a',
        provider: 'xero',
        sync_type: 'inbound',
        status: 'success',
        records_processed: 1,
        details: {
          event: 'external_invoice_status_changed',
          contract_id: 42,
          external_invoice_id: 'invoice-1',
          external_status_old: 'SUBMITTED',
          external_status_new: 'AUTHORISED',
          invoice_status_old: 'review',
          invoice_status_new: 'approved',
        },
      }),
    );
  });

  it('updates local Xero status during upsert when external status changed', async () => {
    const vendorQuery = createQuery({ data: null });
    const contractsQuery = createQuery({
      data: {
        id: 42,
        external_integration_connection_id: 'connection-a',
        external_invoice_status: 'AUTHORISED',
        invoice_status: 'incomplete',
      },
    });
    const logsQuery = createQuery();
    const from = jest.fn((table: string) => {
      if (table === 'vendors') return vendorQuery;
      if (table === 'contracts') return contractsQuery;
      if (table === 'integration_sync_logs') return logsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    mockCreateServiceClient.mockReturnValue({ from });

    const mapped: MappedInvoiceContract = {
      external_source: 'xero',
      external_invoice_id: 'invoice-1',
      external_invoice_status: 'SUBMITTED',
      type_id: 6,
      invoice_status: 'review',
      vendor_name: 'Acme',
      currency: 'USD',
      current_budget: 10,
      billing_frequency: 'One-Time',
      execution_date: null,
      due_date: null,
      term_start_date: null,
      term_end_date: null,
      summary: 'Xero Invoice invoice-1',
      last_synced_at: '2026-05-21T10:00:00.000Z',
      status_id: 1,
    };

    await expect(
      upsertInvoiceAsContract(mapped, 'org-a', 'user-a', 'connection-a'),
    ).resolves.toEqual({ contractId: 42, isNew: false });

    expect(contractsQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        external_invoice_status: 'SUBMITTED',
        invoice_status: 'review',
      }),
    );
    expect(logsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          external_status_old: 'AUTHORISED',
          external_status_new: 'SUBMITTED',
          invoice_status_old: 'incomplete',
          invoice_status_new: 'review',
        }),
      }),
    );
  });

  it('does not log inbound provider status details when status is unchanged', async () => {
    const vendorQuery = createQuery({ data: null });
    const contractsQuery = createQuery({
      data: {
        id: 42,
        external_integration_connection_id: 'connection-a',
        external_invoice_status: 'AUTHORISED',
        invoice_status: 'approved',
      },
    });
    const logsQuery = createQuery();
    const from = jest.fn((table: string) => {
      if (table === 'vendors') return vendorQuery;
      if (table === 'contracts') return contractsQuery;
      if (table === 'integration_sync_logs') return logsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    mockCreateServiceClient.mockReturnValue({ from });

    const mapped: MappedInvoiceContract = {
      external_source: 'xero',
      external_invoice_id: 'invoice-1',
      external_invoice_status: 'AUTHORISED',
      type_id: 6,
      invoice_status: 'approved',
      vendor_name: 'Acme',
      currency: 'USD',
      current_budget: 10,
      billing_frequency: 'One-Time',
      execution_date: null,
      due_date: null,
      term_start_date: null,
      term_end_date: null,
      summary: 'Xero Invoice invoice-1',
      last_synced_at: '2026-05-21T10:00:00.000Z',
      status_id: 1,
    };

    await expect(
      upsertInvoiceAsContract(mapped, 'org-a', 'user-a', 'connection-a'),
    ).resolves.toEqual({ contractId: 42, isNew: false });

    expect(logsQuery.insert).not.toHaveBeenCalled();
  });

  it('returns the contract-owned connection even when it is disconnected', async () => {
    const connectionsQuery = createQuery({
      data: {
        id: 'connection-a',
        nango_connection_id: 'nango-a',
        status: 'disconnected',
        user_id: 'user-a',
      },
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => connectionsQuery),
    });

    await expect(
      getConnectionForInvoice('connection-a', 'org-a', 'xero'),
    ).resolves.toEqual({
      id: 'connection-a',
      nango_connection_id: 'nango-a',
      status: 'disconnected',
      user_id: 'user-a',
    });

    expect(connectionsQuery.eq).toHaveBeenCalledWith('id', 'connection-a');
    expect(connectionsQuery.eq).toHaveBeenCalledWith(
      'organization_id',
      'org-a',
    );
    expect(connectionsQuery.eq).toHaveBeenCalledWith('provider', 'xero');
    expect(connectionsQuery.eq).not.toHaveBeenCalledWith('status', 'connected');
  });
});
