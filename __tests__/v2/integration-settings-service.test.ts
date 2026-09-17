import {
  buildConnectionHealthUpdate,
  classifyIntegrationError,
  getIntegrationDetail,
  getIntegrationSummary,
  triggerIntegrationSync,
} from '@/lib/v2/integrations/settings-service';

const mockCreateServiceClient = jest.fn();
const mockInngestSend = jest.fn();

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockCreateServiceClient(),
}));

jest.mock('@/utils/inngest/client', () => ({
  inngest: {
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
}));

function createQuery(result: unknown = { data: null }) {
  const query: Record<string, jest.Mock> = {};
  const chain = () => jest.fn(() => query);

  query.select = chain();
  query.eq = chain();
  query.in = chain();
  query.order = chain();
  query.limit = chain();
  query.single = jest.fn(async () => result);
  query.then = jest.fn((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject),
  );

  return query;
}

describe('integration settings service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows manual sync when scheduled sync is disabled', async () => {
    const connectionsQuery = createQuery({
      data: {
        id: 'connection-a',
        status: 'connected',
        health_status: 'healthy',
        sync_enabled: false,
      },
      error: null,
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => connectionsQuery),
    });

    await expect(
      triggerIntegrationSync({ userId: 'user-a', provider: 'xero' }),
    ).resolves.toEqual({ triggered: true });

    expect(connectionsQuery.select).toHaveBeenCalledWith(
      'id, status, health_status',
    );
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'integrations/sync-invoices',
      data: { integrationConnectionId: 'connection-a' },
    });
  });

  it('still blocks manual sync when reconnect is required', async () => {
    const connectionsQuery = createQuery({
      data: {
        id: 'connection-a',
        status: 'connected',
        health_status: 'needs_reconnect',
      },
      error: null,
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => connectionsQuery),
    });

    await expect(
      triggerIntegrationSync({ userId: 'user-a', provider: 'xero' }),
    ).resolves.toEqual({
      triggered: false,
      reason: 'Reconnect required',
    });

    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it('classifies incomplete DocuSign OAuth data as reconnect required', () => {
    expect(classifyIntegrationError('User DocuSign data incomplete.')).toBe(
      'authentication',
    );
    expect(
      buildConnectionHealthUpdate({
        status: 'failed',
        errorDetails: 'User DocuSign data incomplete.',
        completedAt: '2026-06-25T15:21:52.000Z',
      }),
    ).toMatchObject({
      health_status: 'needs_reconnect',
      health_reason:
        'Access token expired or revoked. Reconnect the account to resume syncing.',
      health_detected_at: '2026-06-25T15:21:52.000Z',
    });
  });

  it('shows DocuSign as connected from legacy user fields when unified row is missing', async () => {
    const connectionsQuery = createQuery({ data: [], error: null });
    const usersQuery = createQuery({
      data: {
        id: 'user-a',
        organization_id: 'org-a',
        docusign_connected: true,
        docusign_account_id: 'docusign-account-a',
        updated_at: '2026-06-14T10:00:00.000Z',
      },
      error: null,
    });
    const logsQuery = createQuery({ data: [], error: null });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'integration_connections') return connectionsQuery;
        if (table === 'users') return usersQuery;
        if (table === 'integration_sync_logs') return logsQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const summary = await getIntegrationSummary('user-a');
    const docusign = summary.providers.find(
      (provider) => provider.provider === 'docusign',
    );
    const ramp = summary.providers.find(
      (provider) => provider.provider === 'ramp',
    );

    expect(docusign).toMatchObject({
      connectedBefore: true,
      listVisible: true,
      buttonMode: 'manage',
      status: 'connected',
      healthStatus: 'healthy',
    });
    expect(ramp).toMatchObject({
      listVisible: false,
      marketplaceVisible: false,
    });
  });

  it('uses connected legacy DocuSign state over a stale disconnected unified row', async () => {
    const connectionsQuery = createQuery({
      data: {
        id: 'connection-a',
        organization_id: 'org-a',
        user_id: 'user-a',
        provider: 'docusign',
        nango_connection_id: null,
        auth_provider: 'native_oauth',
        provider_account_id: null,
        account_name: null,
        status: 'disconnected',
        health_status: 'disconnected',
        health_reason: 'Disconnected',
        health_detected_at: '2026-06-14T09:00:00.000Z',
        connected_at: null,
        disconnected_at: '2026-06-14T09:00:00.000Z',
        sync_enabled: true,
        sync_interval_minutes: 60,
      },
      error: null,
    });
    const usersQuery = createQuery({
      data: {
        id: 'user-a',
        organization_id: 'org-a',
        docusign_connected: true,
        docusign_account_id: 'docusign-account-a',
        updated_at: '2026-06-14T10:00:00.000Z',
      },
      error: null,
    });
    const logsQuery = createQuery({ data: [], error: null });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'integration_connections') return connectionsQuery;
        if (table === 'users') return usersQuery;
        if (table === 'integration_sync_logs') return logsQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const detail = await getIntegrationDetail({
      userId: 'user-a',
      provider: 'docusign',
    });

    expect(detail).toMatchObject({
      provider: 'docusign',
      status: 'connected',
      healthStatus: 'healthy',
      providerAccountId: 'docusign-account-a',
    });
    expect(logsQuery.in).toHaveBeenCalledWith('integration_connection_id', [
      'connection-a',
    ]);
  });

  it('dedupes repeated action required cards for the same integration error', async () => {
    const connectionQuery = createQuery({
      data: {
        id: 'connection-a',
        organization_id: 'org-a',
        user_id: 'user-a',
        provider: 'docusign',
        nango_connection_id: null,
        auth_provider: 'native_oauth',
        provider_account_id: 'docusign-account-a',
        account_name: 'DocuSign Account',
        status: 'connected',
        health_status: 'needs_reconnect',
        health_reason:
          'Access token expired or revoked. Reconnect the account to resume syncing.',
        health_detected_at: '2026-06-25T15:00:00.000Z',
        connected_at: '2026-06-25T14:00:00.000Z',
        disconnected_at: null,
        sync_enabled: true,
        sync_interval_minutes: 60,
        import_new_invoices: true,
        track_unpaid_invoices: true,
        last_successful_sync_at: null,
      },
      error: null,
    });
    const usersQuery = createQuery({
      data: {
        docusign_connected: false,
      },
      error: null,
    });
    const logsQuery = createQuery({
      data: [
        {
          id: 2,
          integration_connection_id: 'connection-a',
          provider: 'docusign',
          sync_type: 'inbound',
          status: 'failed',
          records_processed: 0,
          error_details: 'User DocuSign data incomplete.',
          started_at: '2026-06-25T15:20:00.000Z',
          completed_at: '2026-06-25T15:21:00.000Z',
          created_at: '2026-06-25T15:21:00.000Z',
        },
        {
          id: 1,
          integration_connection_id: 'connection-a',
          provider: 'docusign',
          sync_type: 'inbound',
          status: 'failed',
          records_processed: 0,
          error_details: 'User DocuSign data incomplete.',
          started_at: '2026-06-25T15:00:00.000Z',
          completed_at: '2026-06-25T15:01:00.000Z',
          created_at: '2026-06-25T15:01:00.000Z',
        },
      ],
      error: null,
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'integration_connections') return connectionQuery;
        if (table === 'users') return usersQuery;
        if (table === 'integration_sync_logs') return logsQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const detail = await getIntegrationDetail({
      userId: 'user-a',
      provider: 'docusign',
    });

    expect(detail?.actionRequired).toHaveLength(1);
    expect(detail?.actionRequired[0]).toMatchObject({
      type: 'authentication',
      title: 'Authentication',
      occurredAt: '2026-06-25T15:21:00.000Z',
    });
  });

  it('does not show stale action required cards after a successful latest run', async () => {
    const connectionQuery = createQuery({
      data: {
        id: 'connection-a',
        organization_id: 'org-a',
        user_id: 'user-a',
        provider: 'docusign',
        nango_connection_id: null,
        auth_provider: 'native_oauth',
        provider_account_id: 'docusign-account-a',
        account_name: 'DocuSign Account',
        status: 'connected',
        health_status: 'healthy',
        health_reason: null,
        health_detected_at: null,
        connected_at: '2026-06-25T14:00:00.000Z',
        disconnected_at: null,
        sync_enabled: true,
        sync_interval_minutes: 60,
        import_new_invoices: true,
        track_unpaid_invoices: true,
        last_successful_sync_at: '2026-06-25T16:00:00.000Z',
      },
      error: null,
    });
    const usersQuery = createQuery({
      data: {
        docusign_connected: true,
        docusign_account_id: 'docusign-account-a',
      },
      error: null,
    });
    const logsQuery = createQuery({
      data: [
        {
          id: 3,
          integration_connection_id: 'connection-a',
          provider: 'docusign',
          sync_type: 'inbound',
          status: 'success',
          records_processed: 0,
          error_details: null,
          started_at: '2026-06-25T16:00:00.000Z',
          completed_at: '2026-06-25T16:00:01.000Z',
          created_at: '2026-06-25T16:00:01.000Z',
        },
        {
          id: 2,
          integration_connection_id: 'connection-a',
          provider: 'docusign',
          sync_type: 'inbound',
          status: 'failed',
          records_processed: 0,
          error_details: 'User DocuSign data incomplete.',
          started_at: '2026-06-25T15:20:00.000Z',
          completed_at: '2026-06-25T15:21:00.000Z',
          created_at: '2026-06-25T15:21:00.000Z',
        },
      ],
      error: null,
    });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'integration_connections') return connectionQuery;
        if (table === 'users') return usersQuery;
        if (table === 'integration_sync_logs') return logsQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const detail = await getIntegrationDetail({
      userId: 'user-a',
      provider: 'docusign',
    });

    expect(detail?.actionRequired).toEqual([]);
  });
});
