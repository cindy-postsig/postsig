import { Hono } from 'hono';
import { callbackHandler } from '@/app/api/v2/handlers/integrations/callback';
import type { AppContext } from '@/app/api/v2/types/app';

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

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function buildApp() {
  const app = new Hono<AppContext>();
  app.use('*', async (c, next) => {
    c.set('userMetadata', {
      userId: 'user-a',
      userProfile: null,
      userRole: 11,
      organizationId: 'org-a',
      organizationName: 'Org A',
      organizationFY: 1,
      dateFormat: 'yyyy-MM-dd',
      organizationDateFormat: 'yyyy-MM-dd',
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
    });
    await next();
  });
  app.post('/callback', callbackHandler);
  return app;
}

describe('Nango integration callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('waits for the saved connection before returning after auto sync trigger', async () => {
    const upsert = deferred<{ data: { id: string }; error: null }>();
    const send = deferred<void>();
    const upsertStarted = deferred<void>();
    const sendStarted = deferred<void>();

    const connectionsQuery: Record<string, jest.Mock> = {};
    connectionsQuery.upsert = jest.fn(() => connectionsQuery);
    connectionsQuery.select = jest.fn(() => connectionsQuery);
    connectionsQuery.single = jest.fn(() => {
      upsertStarted.resolve();
      return upsert.promise;
    });

    mockCreateServiceClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'integration_connections') return connectionsQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });
    mockInngestSend.mockImplementation(() => {
      sendStarted.resolve();
      return send.promise;
    });

    const app = buildApp();
    const responsePromise = Promise.resolve(
      app.request('/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: 'nango-a', provider: 'xero' }),
      }),
    );
    let returned = false;
    void responsePromise.then(() => {
      returned = true;
    });

    await upsertStarted.promise;

    expect(mockInngestSend).not.toHaveBeenCalled();
    expect(returned).toBe(false);

    upsert.resolve({ data: { id: 'connection-a' }, error: null });
    await sendStarted.promise;

    expect(mockInngestSend).toHaveBeenCalledWith({
      name: 'integrations/sync-invoices',
      data: { integrationConnectionId: 'connection-a' },
    });
    expect(returned).toBe(false);

    send.resolve();

    const response = await responsePromise;
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
