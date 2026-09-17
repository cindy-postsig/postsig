jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/lib/config/edge-config', () => ({
  isAssistantEnabled: jest.fn(),
}));
jest.mock('@/lib/date-format-server', () => ({
  getOrgDateFormatPattern: jest.fn(),
  getUserDateFormatPattern: jest.fn(),
}));
jest.mock('@/app/lib/auth/actions', () => ({
  sendPasswordResetEmail: jest.fn(),
}));
jest.mock('@/app/lib/auth/resetSession', () => ({
  createResetState: jest.fn(),
  getResetState: jest.fn(),
  setResetEmailCookie: jest.fn(),
}));
jest.mock('@/app/lib/mcp/context', () => ({ getMcpContext: jest.fn() }));
jest.mock('@/app/lib/auth/trusted-device-utils', () => ({
  getServerDeviceContext: jest.fn(async () => ({})),
}));
jest.mock('@/app/lib/auth/login-rate-limit', () => ({
  checkLoginRateLimit: jest.fn(async () => ({ allowed: true })),
  // Must resolve the real shape: the caller reads the lock flags off it, so a
  // bare jest.fn() would throw a TypeError the sign-in catch block swallows,
  // leaving these tests green while exercising a broken path.
  recordLoginFailure: jest.fn(async () => ({
    emailLocked: false,
    ipLocked: false,
    failures: 1,
  })),
  clearLoginFailures: jest.fn(),
}));
jest.mock('@/app/lib/auth/mfa-actions', () => ({
  checkMFATrustStatus: jest.fn(),
  cleanupOrphanedMFAFactors: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({
  auditLogger: { logAuthenticationEvent: jest.fn(), logEvent: jest.fn() },
  extractAuditContext: jest.fn(() => ({})),
  AUDIT_ACTIONS: {
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  },
  AUDIT_RESOURCE_TYPES: { AUTHENTICATION: 'authentication' },
}));
jest.mock('@/utils/logging/alert', () => ({ logAlert: jest.fn() }));

import { getAccountAccess, signInWithPassword } from '@/data/users';
import { logAlert } from '@/utils/logging/alert';
import { userRoles } from '@/constants/data';
import { createClient } from '@/utils/supabase/server';
import { checkMFATrustStatus } from '@/app/lib/auth/mfa-actions';
import { AuthorizationError } from '@/lib/errors';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';

const mockLogAlert = logAlert as jest.Mock;
const mockCreateClient = createClient as jest.Mock;
const mockCheckMFATrustStatus = checkMFATrustStatus as jest.Mock;

type Row = {
  signed_up?: boolean | null;
  roleIds?: number[];
  orgStatus?: 'active' | 'inactive' | null;
  hasOrg?: boolean;
  modules?: Array<{
    code: string;
    isDefault?: boolean;
    isActive?: boolean;
    /** The grant itself; false is what admin-app revocation writes. */
    granted?: boolean;
  }>;
};

/**
 * Minimal stand-in for the PostgREST builder chain used by getAccountAccess:
 * .from().select().eq().eq().single()
 */
function client({
  row,
  error = null,
}: {
  row?: Row;
  error?: { message: string; code: string } | null;
}) {
  const data =
    row === undefined
      ? null
      : {
          signed_up: row.signed_up ?? true,
          user_roles2: (row.roleIds ?? []).map((role_id) => ({ role_id })),
          organizations:
            row.hasOrg === false
              ? null
              : {
                  status: row.orgStatus ?? 'active',
                  trial: false,
                  organization_modules: [],
                },
          user_module_access: (row.modules ?? []).map((m) => ({
            is_active: m.granted ?? true,
            is_default: m.isDefault ?? false,
            app_modules: {
              code: m.code,
              name: m.code,
              base_path: `/${m.code}`,
              is_active: m.isActive ?? true,
            },
          })),
        };

  const single = jest.fn().mockResolvedValue({ data, error });
  const chain: { eq: jest.Mock; single: jest.Mock } = {
    eq: jest.fn(() => chain),
    single,
  };
  return {
    from: jest.fn(() => ({ select: jest.fn(() => chain) })),
  } as unknown as SupabaseClient<Database>;
}

beforeEach(() => jest.clearAllMocks());

describe('getAccountAccess', () => {
  it('denies a user holding no roles at all', async () => {
    const result = await getAccountAccess(
      client({ row: { roleIds: [] } }),
      'u1',
    );

    expect(result).toEqual({ status: 'denied', reason: 'no-role' });
  });

  it('denies a user whose only role is not an accepted one', async () => {
    const result = await getAccountAccess(
      client({ row: { roleIds: [userRoles.clientReviewer] } }),
      'u1',
    );

    expect(result).toEqual({ status: 'denied', reason: 'role-not-permitted' });
  });

  it('denies a fully-roled user in a deactivated organization', async () => {
    const result = await getAccountAccess(
      client({
        row: { roleIds: [userRoles.clientAdmin], orgStatus: 'inactive' },
      }),
      'u1',
    );

    expect(result).toEqual({ status: 'denied', reason: 'org-inactive' });
  });

  // The mechanism the admin app actually uses to disable a user: every module
  // grant is flipped to is_active=false. The app used to synthesize CPM access
  // for these accounts, which is how a disabled user reached an empty CPM nav.
  it('denies a user whose module grants have all been revoked', async () => {
    const result = await getAccountAccess(
      client({
        row: {
          roleIds: [userRoles.clientSupervisor],
          modules: [{ code: 'cpm', granted: false, isDefault: true }],
        },
      }),
      'u1',
    );

    expect(result).toEqual({ status: 'denied', reason: 'modules-revoked' });
  });

  it('admits a user with one revoked grant and one still live', async () => {
    const result = await getAccountAccess(
      client({
        row: {
          roleIds: [userRoles.clientAdmin],
          modules: [
            { code: 'cpm', granted: false, isDefault: true },
            { code: 'investor', granted: true },
          ],
        },
      }),
      'u1',
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.metadata.appModules.map((m) => m.code)).toEqual(['investor']);
    // A revoked row must not supply the default module.
    expect(result.metadata.defaultModule?.code).toBe('investor');
  });

  // Never provisioned into the module system is not the same as revoked;
  // denying these would lock out legitimate accounts that predate it.
  it('admits a user with no module grant rows at all, via the CPM fallback', async () => {
    const result = await getAccountAccess(
      client({ row: { roleIds: [userRoles.clientAdmin], modules: [] } }),
      'u1',
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.metadata.appModules.map((m) => m.code)).toEqual(['cpm']);
  });

  it('admits a fully-roled user in an active organization', async () => {
    const result = await getAccountAccess(
      client({
        row: {
          roleIds: [userRoles.clientAdmin],
          modules: [{ code: 'cpm', isDefault: true }],
        },
      }),
      'u1',
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.metadata.userRole).toBe(userRoles.clientAdmin);
    expect(result.metadata.appModules.map((m) => m.code)).toEqual(['cpm']);
  });

  // resolveTopRole must cover every accepted role: one it omits resolves to
  // null, which reads as "deactivated" and locks a legitimate user out.
  it.each([
    ['clientTrialUser', userRoles.clientTrialUser],
    ['postsigSuperAdmin', userRoles.postsigSuperAdmin],
  ])('admits a user holding only %s', async (_name, roleId) => {
    const result = await getAccountAccess(
      client({ row: { roleIds: [roleId] } }),
      'u1',
    );

    expect(result.status).toBe('ok');
  });

  // The MFA columns ride along on this query so the middleware's MFA gate does
  // not read the same row again from the edge.
  it('selects the MFA columns and returns them on the metadata', async () => {
    const mfa = {
      mfa_enabled: true,
      mfa_type: 'email',
      mfa_last_verified_at: null,
      email_mfa_session_verified_at: '2026-08-27T00:00:00.000Z',
      email_mfa_session_id: 's-current',
    };
    const single = jest.fn().mockResolvedValue({
      data: {
        signed_up: true,
        user_roles2: [{ role_id: userRoles.clientAdmin }],
        organizations: {
          status: 'active',
          trial: false,
          organization_modules: [],
        },
        user_module_access: [],
        ...mfa,
      },
      error: null,
    });
    const chain: { eq: jest.Mock; single: jest.Mock } = {
      eq: jest.fn(() => chain),
      single,
    };
    const select = jest.fn((_columns: string) => chain);
    const supabase = {
      from: jest.fn(() => ({ select })),
    } as unknown as SupabaseClient<Database>;

    const result = await getAccountAccess(supabase, 'u1');

    const selected = select.mock.calls[0][0];
    for (const column of Object.keys(mfa)) {
      expect(selected).toContain(column);
    }
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.metadata.mfa).toEqual(mfa);
  });

  it('reports a query failure as error, not as a denial, so a database blip does not sign everyone out', async () => {
    const result = await getAccountAccess(
      client({ error: { message: 'column does not exist', code: '42703' } }),
      'u1',
    );

    expect(result).toEqual({ status: 'error' });
    expect(mockLogAlert).toHaveBeenCalledWith(
      'account-access-lookup-failure',
      expect.objectContaining({ code: '42703' }),
      expect.objectContaining({ userId: 'u1' }),
      expect.any(String),
    );
  });
});

describe('signInWithPassword authorization', () => {
  const getAuthenticatorAssuranceLevel = jest.fn();
  const signOut = jest.fn();

  /** One client serving both the auth calls and the access-gate query. */
  function signInClient(row: Row) {
    const gate = client({ row }) as unknown as {
      from: jest.Mock;
    };
    mockCreateClient.mockResolvedValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          error: null,
          data: { user: { id: 'u1', user_metadata: {} }, session: {} },
        }),
        mfa: { getAuthenticatorAssuranceLevel },
        signOut,
      },
      from: gate.from,
    });
  }

  beforeEach(() => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { nextLevel: 'aal1', currentLevel: 'aal1' },
      error: null,
    });
    mockCheckMFATrustStatus.mockResolvedValue({
      needsVerification: false,
      mfaType: null,
    });
  });

  // The bug this PR fixes: the MFA branch returns early, so an authorization
  // check placed after it never runs for an MFA-enabled account. A denied
  // account must be turned away before MFA is even consulted.
  it('rejects a denied account without evaluating MFA', async () => {
    signInClient({ roleIds: [userRoles.clientAdmin], orgStatus: 'inactive' });

    await expect(
      signInWithPassword({ email: 'a@b.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
    expect(mockCheckMFATrustStatus).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
  });

  it('preserves AuthorizationError rather than remapping it to AuthenticationError', async () => {
    signInClient({ roleIds: [] });

    await expect(
      signInWithPassword({ email: 'a@b.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('proceeds to MFA evaluation for a permitted account', async () => {
    signInClient({
      roleIds: [userRoles.clientAdmin],
      modules: [{ code: 'cpm', isDefault: true }],
    });

    await expect(
      signInWithPassword({ email: 'a@b.com', password: 'pw' }),
    ).resolves.toEqual(expect.objectContaining({ state: true }));

    // Both, not just the AAL call: skipping checkMFATrustStatus would still
    // return { state: true } and would otherwise slip past this test.
    expect(getAuthenticatorAssuranceLevel).toHaveBeenCalled();
    expect(mockCheckMFATrustStatus).toHaveBeenCalled();
  });
});
