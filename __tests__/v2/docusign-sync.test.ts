import { getDocuSignActiveConnections } from '@/lib/v2/integrations/docusign-sync/service';

const mockCreateServiceClient = jest.fn();

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockCreateServiceClient(),
}));

jest.mock('@/utils/inngest/client', () => ({
  inngest: {
    send: jest.fn(),
  },
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    })),
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
  query.then = jest.fn((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject),
  );

  return query;
}

describe('DocuSign sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('only loads healthy connected DocuSign connections for scheduled sync', async () => {
    const connectionsQuery = createQuery({ data: [], error: null });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => connectionsQuery),
    });

    await expect(getDocuSignActiveConnections({})).resolves.toEqual([]);

    expect(connectionsQuery.select).toHaveBeenCalledWith(
      'id, organization_id, user_id, provider, health_status, sync_enabled',
    );
    expect(connectionsQuery.eq).toHaveBeenCalledWith('status', 'connected');
    expect(connectionsQuery.eq).toHaveBeenCalledWith(
      'health_status',
      'healthy',
    );
    expect(connectionsQuery.eq).toHaveBeenCalledWith('provider', 'docusign');
    expect(connectionsQuery.eq).toHaveBeenCalledWith('sync_enabled', true);
  });

  it('still requires healthy connections for explicit DocuSign sync events', async () => {
    const connectionsQuery = createQuery({ data: [], error: null });
    mockCreateServiceClient.mockReturnValue({
      from: jest.fn(() => connectionsQuery),
    });

    await expect(
      getDocuSignActiveConnections({
        integrationConnectionId: 'connection-a',
        includeDisabled: true,
      }),
    ).resolves.toEqual([]);

    expect(connectionsQuery.eq).toHaveBeenCalledWith(
      'health_status',
      'healthy',
    );
    expect(connectionsQuery.eq).toHaveBeenCalledWith('id', 'connection-a');
    expect(connectionsQuery.eq).not.toHaveBeenCalledWith('sync_enabled', true);
  });
});
