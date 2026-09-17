jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const CUSTOMER = 'ada@acme.com';
const SHADOW = 'support@postsig.com';

type UserRow = {
  id: string;
  name: string;
  email: string;
  signed_up?: boolean;
  user_roles2: Array<{ role_id: number }>;
};

let userRows: UserRow[] = [];
let inviteRows: Array<Record<string, unknown>> = [];
/** Null on most orgs; a set domain incidentally masks the shadow-user leak. */
let orgDomain: string | null = null;

let mockViewerEmail = CUSTOMER;

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn(async () => ({
    userId: 'viewer-1',
    organizationId: 'org-1',
    organizationName: 'Acme',
    userRole: 12,
    userProfile: { name: 'Ada', email: mockViewerEmail },
  })),
  getUserProfile: jest.fn(),
  getUser: jest.fn(),
}));

jest.mock('@/data/user-permissions', () => ({
  verifyAbility: jest.fn(async () => ({
    userId: 'viewer-1',
    organizationId: 'org-1',
    organizationName: 'Acme',
  })),
  checkAbility: jest.fn(async () => true),
}));

function tableBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const rowsFor = () => {
    if (table === 'users') return userRows;
    if (table === 'app_invites') return inviteRows;
    return [];
  };
  const result = () => Promise.resolve({ data: rowsFor(), error: null });

  Object.assign(builder, {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => result(),
    single: () => Promise.resolve({ data: { domain: orgDomain }, error: null }),
    then: (resolve: (v: unknown) => unknown) => result().then(resolve),
  });
  return builder;
}

const fakeClient = { from: (table: string) => tableBuilder(table) };

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => fakeClient,
}));
jest.mock('@/utils/supabase/server', () => ({
  createClient: () => fakeClient,
}));

import { fetchAllOrgUsersWithRoles } from '@/app/lib/sharing/actions';
import { getPendingInvites } from '@/app/lib/actions/organization-users';

beforeEach(() => {
  mockViewerEmail = CUSTOMER;
  orgDomain = null;
  userRows = [
    {
      id: 'u1',
      name: 'Ada',
      email: CUSTOMER,
      signed_up: true,
      user_roles2: [{ role_id: 12 }],
    },
    {
      id: 'u2',
      name: 'PostSig Support',
      email: SHADOW,
      signed_up: false,
      user_roles2: [{ role_id: 12 }],
    },
  ];
  inviteRows = [];
});

describe('share dialog admins list (PSK-1977)', () => {
  it('hides shadow users from the org admins section', async () => {
    const { adminsAndManagers, allUsers } = await fetchAllOrgUsersWithRoles();

    expect(adminsAndManagers.map((u) => u.email)).not.toContain(SHADOW);
    expect(allUsers.map((u) => u.email)).not.toContain(SHADOW);
  });

  it('still shows shadow users to a postsig viewer', async () => {
    mockViewerEmail = SHADOW;

    const { adminsAndManagers } = await fetchAllOrgUsersWithRoles();

    expect(adminsAndManagers.map((u) => u.email)).toContain(SHADOW);
  });
});

describe('pending users list (PSK-1977)', () => {
  it('hides shadow users that never signed up', async () => {
    const pending = await getPendingInvites({ currentUserEmail: CUSTOMER });

    expect(pending.map((p) => p.email)).not.toContain(SHADOW);
  });

  it('hides shadow users that have an outstanding invite', async () => {
    inviteRows = [
      {
        id: 7,
        invited_at: '2026-08-01T00:00:00Z',
        expires_at: '2099-01-01T00:00:00Z',
        users: {
          id: 'u2',
          name: 'PostSig Support',
          email: SHADOW,
          signed_up: false,
          user_roles2: [{ role_id: 12 }],
        },
      },
    ];

    const pending = await getPendingInvites({ currentUserEmail: CUSTOMER });

    expect(pending.map((p) => p.email)).not.toContain(SHADOW);
  });

  it('still shows shadow users to a postsig viewer', async () => {
    const pending = await getPendingInvites({ currentUserEmail: SHADOW });

    expect(pending.map((p) => p.email)).toContain(SHADOW);
  });
});
