jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/utils/logging/alert', () => ({ logAlert: jest.fn() }));

const mockLoggerWarn = jest.fn();
jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { provisionSsoUser } from '@/app/lib/auth/sso-provisioning';
import { VIEWER_ROLE } from '@/constants/data';
import { logAlert } from '@/utils/logging/alert';

const mockLogAlert = logAlert as jest.Mock;

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

interface RecordedWrite {
  table: string;
  op: 'insert' | 'update';
  payload: unknown;
}

function stubClient(script: Record<string, QueryResult[]>) {
  const writes: RecordedWrite[] = [];
  const from = jest.fn((table: string) => {
    const queue = script[table] ?? [];
    const result: QueryResult = queue.shift() ?? { data: null, error: null };
    const resolved = { data: result.data ?? null, error: result.error ?? null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve(resolved),
      insert: (payload: unknown) => {
        writes.push({ table, op: 'insert', payload });
        return chain;
      },
      update: (payload: unknown) => {
        writes.push({ table, op: 'update', payload });
        return chain;
      },
      then: (
        onFulfilled: (r: QueryResult) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(resolved).then(onFulfilled, onRejected),
    };
    return chain;
  });
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    writes,
    from,
  };
}

const user = { id: 'user-1', email: 'jane@customer.com', user_metadata: {} };

const happyScript = (): Record<string, QueryResult[]> => ({
  users: [{ data: { organization_id: null, name: null } }, {}],
  organizations: [{ data: [{ id: 'org-1' }] }],
  user_roles2: [{ data: null }, {}],
  organization_modules: [
    {
      data: [
        {
          module_id: 7,
          is_enabled: true,
          app_modules: { code: 'investor', is_active: true },
        },
        {
          module_id: 3,
          is_enabled: true,
          app_modules: { code: 'cpm', is_active: true },
        },
      ],
    },
  ],
  user_module_access: [{ data: null }, {}],
});

const finalUserUpdate = (writes: RecordedWrite[]) =>
  writes.find((w) => w.table === 'users' && w.op === 'update')?.payload;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('provisionSsoUser', () => {
  it('provisions a new user: viewer role, cpm module preferred, org set last', async () => {
    const { client, writes } = stubClient(happyScript());
    const outcome = await provisionSsoUser(user, client);

    expect(outcome).toEqual({ status: 'provisioned', organizationId: 'org-1' });
    expect(writes).toEqual([
      {
        table: 'user_roles2',
        op: 'insert',
        payload: { user_id: 'user-1', role_id: VIEWER_ROLE },
      },
      {
        table: 'user_module_access',
        op: 'insert',
        payload: {
          user_id: 'user-1',
          organization_id: 'org-1',
          module_id: 3,
          is_default: true,
        },
      },
      {
        table: 'users',
        op: 'update',
        payload: { organization_id: 'org-1', signed_up: true, name: 'Jane' },
      },
    ]);
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('names a first-time user from the SAML claims when present', async () => {
    const { client, writes } = stubClient(happyScript());
    await provisionSsoUser(
      {
        ...user,
        user_metadata: { given_name: 'Jane', family_name: 'Doe' },
      },
      client,
    );

    expect(finalUserUpdate(writes)).toMatchObject({ name: 'Jane Doe' });
  });

  it('keeps a name that is already set', async () => {
    const script = happyScript();
    script.users = [{ data: { organization_id: null, name: 'Jane Doe' } }, {}];
    const { client, writes } = stubClient(script);
    await provisionSsoUser(user, client);

    expect(finalUserUpdate(writes)).toEqual({
      organization_id: 'org-1',
      signed_up: true,
    });
  });

  it('replaces a UPN that the insert trigger stored as the name', async () => {
    const script = happyScript();
    script.users = [
      { data: { organization_id: null, name: 'jdoe@customer.com' } },
      {},
    ];
    const { client, writes } = stubClient(script);
    await provisionSsoUser(user, client);

    expect(finalUserUpdate(writes)).toMatchObject({ name: 'Jane' });
  });

  it('grants the first active module when the org has no cpm', async () => {
    const script = happyScript();
    script.organization_modules = [
      {
        data: [
          {
            module_id: 7,
            is_enabled: true,
            app_modules: { code: 'investor', is_active: true },
          },
          {
            module_id: 9,
            is_enabled: false,
            app_modules: { code: 'cpm', is_active: true },
          },
        ],
      },
    ];
    const { client, writes } = stubClient(script);
    await provisionSsoUser(user, client);

    const grant = writes.find((w) => w.table === 'user_module_access');
    expect(grant?.payload).toMatchObject({ module_id: 7 });
  });

  it('provisions without a module grant when the org has no active modules', async () => {
    const script = happyScript();
    script.organization_modules = [{ data: [] }];
    script.user_module_access = [];
    const { client, writes } = stubClient(script);
    const outcome = await provisionSsoUser(user, client);

    expect(outcome.status).toBe('provisioned');
    expect(writes.some((w) => w.table === 'user_module_access')).toBe(false);
    expect(writes.at(-1)).toMatchObject({ table: 'users', op: 'update' });
  });

  it('skips duplicate role/grant inserts on a retry after partial failure', async () => {
    const script = happyScript();
    script.user_roles2 = [{ data: { id: 42 } }];
    script.user_module_access = [{ data: { id: 'grant-1' } }];
    const { client, writes } = stubClient(script);
    const outcome = await provisionSsoUser(user, client);

    expect(outcome.status).toBe('provisioned');
    expect(writes).toEqual([
      {
        table: 'users',
        op: 'update',
        payload: { organization_id: 'org-1', signed_up: true, name: 'Jane' },
      },
    ]);
  });

  it('short-circuits for an already-provisioned user without writes', async () => {
    const { client, writes, from } = stubClient({
      users: [{ data: { organization_id: 'org-9', name: 'Jane Doe' } }],
    });
    const outcome = await provisionSsoUser(user, client);

    expect(outcome).toEqual({
      status: 'already-provisioned',
      organizationId: 'org-9',
    });
    expect(writes).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('backfills a blank name for an already-provisioned user', async () => {
    const { client, writes, from } = stubClient({
      users: [{ data: { organization_id: 'org-9', name: '  ' } }, {}],
    });
    const outcome = await provisionSsoUser(user, client);

    expect(outcome).toEqual({
      status: 'already-provisioned',
      organizationId: 'org-9',
    });
    expect(writes).toEqual([
      { table: 'users', op: 'update', payload: { name: 'Jane' } },
    ]);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('still admits a returning user when the name backfill fails', async () => {
    const { client } = stubClient({
      users: [
        { data: { organization_id: 'org-9', name: null } },
        { error: { message: 'boom' } },
      ],
    });
    const outcome = await provisionSsoUser(user, client);

    expect(outcome).toEqual({
      status: 'already-provisioned',
      organizationId: 'org-9',
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', action: 'ssoNameBackfill' }),
      expect.any(String),
    );
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('rejects when the email has no domain, before any query', async () => {
    const { client, from } = stubClient({});
    const outcome = await provisionSsoUser(
      { id: 'u', email: undefined, user_metadata: {} },
      client,
    );

    expect(outcome).toEqual({ status: 'rejected', reason: 'no-email-domain' });
    expect(from).not.toHaveBeenCalled();
    expect(mockLogAlert).toHaveBeenCalledWith(
      'sso-provision-failure',
      null,
      expect.objectContaining({ reason: 'no-email-domain' }),
      expect.any(String),
    );
  });

  it('rejects when the users row is missing', async () => {
    const { client } = stubClient({ users: [{ data: null }] });
    const outcome = await provisionSsoUser(user, client);
    expect(outcome).toEqual({ status: 'rejected', reason: 'missing-user-row' });
  });

  it('rejects when no org matches the domain', async () => {
    const script = happyScript();
    script.organizations = [{ data: [] }];
    const { client, writes } = stubClient(script);
    const outcome = await provisionSsoUser(user, client);

    expect(outcome).toEqual({ status: 'rejected', reason: 'no-matching-org' });
    expect(writes).toEqual([]);
  });

  it('rejects when multiple orgs share the domain', async () => {
    const script = happyScript();
    script.organizations = [{ data: [{ id: 'a' }, { id: 'b' }] }];
    const { client, writes } = stubClient(script);
    const outcome = await provisionSsoUser(user, client);

    expect(outcome).toEqual({ status: 'rejected', reason: 'ambiguous-org' });
    expect(writes).toEqual([]);
  });

  it('rejects and leaves organization_id unset when a write fails', async () => {
    const script = happyScript();
    script.user_roles2 = [{ data: null }, { error: { message: 'boom' } }];
    const { client, writes } = stubClient(script);
    const outcome = await provisionSsoUser(user, client);

    expect(outcome).toEqual({ status: 'rejected', reason: 'error' });
    expect(writes.some((w) => w.table === 'users' && w.op === 'update')).toBe(
      false,
    );
    expect(mockLogAlert).toHaveBeenCalledWith(
      'sso-provision-failure',
      { message: 'boom' },
      expect.objectContaining({ reason: 'error', userId: 'user-1' }),
      expect.any(String),
    );
  });
});
