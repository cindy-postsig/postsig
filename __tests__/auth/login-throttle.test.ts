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
jest.mock('@/app/lib/auth/mfa-actions', () => ({
  checkMFATrustStatus: jest.fn(),
  cleanupOrphanedMFAFactors: jest.fn(),
}));
jest.mock('@/app/lib/auth/trusted-device-utils', () => ({
  getServerDeviceContext: jest.fn(async () => ({
    ipAddress: '203.0.113.10',
    userAgent: 'jest',
  })),
}));
jest.mock('@/app/lib/auth/login-rate-limit', () => ({
  checkLoginRateLimit: jest.fn(),
  recordLoginFailure: jest.fn(),
  clearLoginFailures: jest.fn(),
  checkPasswordResetRateLimit: jest.fn(async () => ({ allowed: true })),
  recordPasswordResetFailure: jest.fn(),
  clearPasswordResetFailures: jest.fn(),
}));
jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/lib/audit', () => ({
  auditLogger: { logAuthenticationEvent: jest.fn(), logEvent: jest.fn() },
  extractAuditContext: jest.fn((_request, additional) => ({ ...additional })),
  AUDIT_ACTIONS: {
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_BLOCKED: 'LOGIN_BLOCKED',
    MFA_REQUIRED: 'MFA_REQUIRED',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  },
  AUDIT_RESOURCE_TYPES: { AUTHENTICATION: 'authentication' },
}));
jest.mock('@/utils/logging/alert', () => ({ logAlert: jest.fn() }));

import { signInWithPassword, verifyOTP } from '@/data/users';
import { createClient } from '@/utils/supabase/server';
import { checkMFATrustStatus } from '@/app/lib/auth/mfa-actions';
import {
  checkLoginRateLimit,
  checkPasswordResetRateLimit,
  clearLoginFailures,
  clearPasswordResetFailures,
  recordLoginFailure,
  recordPasswordResetFailure,
} from '@/app/lib/auth/login-rate-limit';
import { auditLogger } from '@/lib/audit';
import { logAlert } from '@/utils/logging/alert';
import { AuthorizationError } from '@/lib/errors';
import { userRoles } from '@/constants/data';

const mockCreateClient = createClient as jest.Mock;
const mockCheckMFATrustStatus = checkMFATrustStatus as jest.Mock;
const mockCheckLoginRateLimit = checkLoginRateLimit as jest.Mock;
const mockRecordLoginFailure = recordLoginFailure as jest.Mock;
const mockClearLoginFailures = clearLoginFailures as jest.Mock;
const mockCheckPasswordResetRateLimit =
  checkPasswordResetRateLimit as jest.Mock;
const mockRecordPasswordResetFailure = recordPasswordResetFailure as jest.Mock;
const mockClearPasswordResetFailures = clearPasswordResetFailures as jest.Mock;
const mockLogAuthenticationEvent =
  auditLogger.logAuthenticationEvent as jest.Mock;
const mockLogEvent = auditLogger.logEvent as jest.Mock;
const mockLogAlert = logAlert as jest.Mock;

const EMAIL = 'user@example.com';

const signInWithPasswordMock = jest.fn();
const signOut = jest.fn();

/** Stand-in for the chain getAccountAccess walks: from().select().eq().eq().single() */
function accessGate(orgStatus: 'active' | 'inactive') {
  const single = jest.fn().mockResolvedValue({
    data: {
      signed_up: true,
      user_roles2: [{ role_id: userRoles.clientAdmin }],
      organizations: {
        status: orgStatus,
        trial: false,
        organization_modules: [],
      },
      user_module_access: [
        {
          is_active: true,
          is_default: true,
          app_modules: {
            code: 'cpm',
            name: 'cpm',
            base_path: '/cpm',
            is_active: true,
          },
        },
      ],
    },
    error: null,
  });
  const chain: { eq: jest.Mock; single: jest.Mock } = {
    eq: jest.fn(() => chain),
    single,
  };
  return jest.fn(() => ({ select: jest.fn(() => chain) }));
}

/** The auth calls plus the access-gate query, on one client. */
function supabaseDouble({
  signInError = null as { message: string; status?: number } | null,
  orgStatus = 'active' as 'active' | 'inactive',
  user = undefined as { id: string; user_metadata: object } | null | undefined,
} = {}) {
  signInWithPasswordMock.mockResolvedValue({
    error: signInError,
    data: {
      user:
        user !== undefined
          ? user
          : signInError
            ? null
            : { id: 'u1', user_metadata: {} },
      session: {},
    },
  });

  mockCreateClient.mockResolvedValue({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      mfa: {
        getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
          data: { nextLevel: 'aal1', currentLevel: 'aal1' },
          error: null,
        }),
      },
      signOut,
    },
    from: accessGate(orgStatus),
  });
}

describe('signInWithPassword throttling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLoginRateLimit.mockResolvedValue({ allowed: true });
    mockRecordLoginFailure.mockResolvedValue({
      emailLocked: false,
      ipLocked: false,
      failures: 1,
      attemptsRemaining: 9,
      lockedForSeconds: null,
    });
    mockCheckMFATrustStatus.mockResolvedValue({
      needsVerification: false,
      mfaType: null,
    });
  });

  // The whole point of the control: past the threshold the password is never
  // checked, so an attacker cannot test another guess.
  it('returns the throttled result without verifying the password', async () => {
    mockCheckLoginRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 1800,
    });
    supabaseDouble();

    await expect(
      signInWithPassword({ email: EMAIL, password: 'pw' }),
    ).resolves.toEqual({
      state: false,
      requiresMFA: false,
      rateLimited: { retryAfterSeconds: 1800 },
    });

    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  // Supabase answering 429 or 5xx says nothing about the password. Counting it
  // would let an upstream blip escalate real users up the lockout ladder, and
  // the lockouts would outlast the outage that caused them.
  it.each([
    [429, 'over_request_rate_limit'],
    [500, 'unexpected_failure'],
    [503, 'service unavailable'],
  ])(
    'does not spend an attempt when the auth service answers %i',
    async (status, message) => {
      supabaseDouble({ signInError: { message, status } });

      await expect(
        signInWithPassword({ email: EMAIL, password: 'pw' }),
      ).resolves.toEqual({
        state: false,
        requiresMFA: false,
        serviceError: true,
      });

      expect(mockRecordLoginFailure).not.toHaveBeenCalled();
    },
  );

  // A 400 is the credential rejection the control exists to count.
  it('spends an attempt on a rejected credential', async () => {
    supabaseDouble({
      signInError: { message: 'Invalid login credentials', status: 400 },
    });

    await expect(
      signInWithPassword({ email: EMAIL, password: 'wrong' }),
    ).resolves.toMatchObject({ invalidCredentials: { attemptsRemaining: 9 } });

    expect(mockRecordLoginFailure).toHaveBeenCalledWith(EMAIL);
  });

  // An unrecognised shape still counts: the alternative is a renamed field
  // silently switching the whole control off.
  it('still spends an attempt when the error carries no status', async () => {
    supabaseDouble({ signInError: { message: 'Invalid login credentials' } });

    await signInWithPassword({ email: EMAIL, password: 'wrong' });

    expect(mockRecordLoginFailure).toHaveBeenCalledWith(EMAIL);
  });

  it('does not spend an attempt when no user comes back without an error', async () => {
    supabaseDouble({ user: null });

    await expect(
      signInWithPassword({ email: EMAIL, password: 'pw' }),
    ).resolves.toEqual({
      state: false,
      requiresMFA: false,
      serviceError: true,
    });

    expect(mockRecordLoginFailure).not.toHaveBeenCalled();
  });

  it('audits a throttled attempt as blocked rather than failed', async () => {
    mockCheckLoginRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 10,
    });
    supabaseDouble();

    await signInWithPassword({ email: EMAIL, password: 'pw' });

    expect(mockLogAuthenticationEvent).toHaveBeenCalledWith(
      'LOGIN_BLOCKED',
      expect.objectContaining({ ipAddress: '203.0.113.10' }),
      expect.objectContaining({ email: EMAIL }),
    );
  });

  // Returned rather than thrown: Next.js redacts server-action errors in
  // production, so anything the form needs to render has to come back as data.
  it('records a failure and reports the attempts left when the password is wrong', async () => {
    supabaseDouble({ signInError: { message: 'Invalid login credentials' } });

    await expect(
      signInWithPassword({ email: EMAIL, password: 'wrong' }),
    ).resolves.toEqual({
      state: false,
      requiresMFA: false,
      invalidCredentials: {
        attemptsRemaining: 9,
        lockedForSeconds: null,
        nextAttemptInSeconds: null,
      },
    });

    expect(mockRecordLoginFailure).toHaveBeenCalledWith(EMAIL);
  });

  // The gate plants the cooldown on the attempt it lets through, so the wrong
  // password is the last moment we can warn before the next submission bounces.
  it('reports a wait the gate planted so the form can hold the next attempt', async () => {
    mockCheckLoginRateLimit.mockResolvedValue({
      allowed: true,
      nextAttemptInSeconds: 20,
    });
    supabaseDouble({ signInError: { message: 'Invalid login credentials' } });

    await expect(
      signInWithPassword({ email: EMAIL, password: 'wrong' }),
    ).resolves.toMatchObject({
      invalidCredentials: { nextAttemptInSeconds: 20 },
    });
    expect(mockClearLoginFailures).not.toHaveBeenCalled();
  });

  // The lock lands on this very attempt, so the wait has to come back with it
  // rather than waiting for the next attempt to be refused at the gate.
  it('reports the lock applied by the failure that crosses the threshold', async () => {
    supabaseDouble({ signInError: { message: 'Invalid login credentials' } });
    mockRecordLoginFailure.mockResolvedValue({
      emailLocked: true,
      ipLocked: false,
      failures: 10,
      attemptsRemaining: 0,
      lockedForSeconds: 900,
    });

    await expect(
      signInWithPassword({ email: EMAIL, password: 'wrong' }),
    ).resolves.toMatchObject({
      invalidCredentials: { attemptsRemaining: 0, lockedForSeconds: 900 },
    });
  });

  // A failure the limiter could not count has no figure behind it, and a 0
  // would read as "no attempts left" to a user who is not being throttled.
  it('passes an unknown attempt count through as null', async () => {
    supabaseDouble({ signInError: { message: 'Invalid login credentials' } });
    mockRecordLoginFailure.mockResolvedValue({
      emailLocked: false,
      ipLocked: false,
      failures: 0,
      attemptsRemaining: null,
      lockedForSeconds: null,
    });

    await expect(
      signInWithPassword({ email: EMAIL, password: 'wrong' }),
    ).resolves.toMatchObject({
      invalidCredentials: { attemptsRemaining: null, lockedForSeconds: null },
    });
  });

  it('clears the counters on a successful sign-in', async () => {
    supabaseDouble();

    await signInWithPassword({ email: EMAIL, password: 'pw' });

    expect(mockClearLoginFailures).toHaveBeenCalledWith(EMAIL);
    expect(mockRecordLoginFailure).not.toHaveBeenCalled();
  });

  it('clears the counters when the password is right but MFA is still owed', async () => {
    supabaseDouble();
    mockCheckMFATrustStatus.mockResolvedValue({
      needsVerification: true,
      mfaType: 'totp',
    });

    const result = await signInWithPassword({ email: EMAIL, password: 'pw' });

    expect(result.requiresMFA).toBe(true);
    expect(mockClearLoginFailures).toHaveBeenCalledWith(EMAIL);
  });

  // The password was correct, so a deactivated account is not a guessing
  // attempt and must not consume the lockout budget for that address.
  it('does not record a failure when a correct password is refused by the access gate', async () => {
    supabaseDouble({ orgStatus: 'inactive' });

    await expect(
      signInWithPassword({ email: EMAIL, password: 'pw' }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(mockRecordLoginFailure).not.toHaveBeenCalled();
  });

  it('attaches the client IP to failed-login audit rows', async () => {
    supabaseDouble({ signInError: { message: 'Invalid login credentials' } });

    await signInWithPassword({ email: EMAIL, password: 'wrong' });

    expect(mockLogAuthenticationEvent).toHaveBeenCalledWith(
      'LOGIN_FAILED',
      expect.objectContaining({ ipAddress: '203.0.113.10' }),
      expect.anything(),
    );
  });

  // The LOGIN_FAILED rows do not say when enforcement began, so the moment of
  // locking gets its own row.
  it('audits the lockout on the failure that crosses the threshold', async () => {
    supabaseDouble({ signInError: { message: 'Invalid login credentials' } });
    mockRecordLoginFailure.mockResolvedValue({
      emailLocked: true,
      ipLocked: false,
      failures: 10,
      attemptsRemaining: 0,
      lockedForSeconds: 900,
    });

    await signInWithPassword({ email: EMAIL, password: 'wrong' });

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ACCOUNT_LOCKED',
        resourceType: 'authentication',
        resourceId: EMAIL,
        newData: expect.objectContaining({ scope: 'email', failures: 10 }),
      }),
    );
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('does not audit a lockout on an ordinary failure', async () => {
    supabaseDouble({ signInError: { message: 'Invalid login credentials' } });

    await signInWithPassword({ email: EMAIL, password: 'wrong' });

    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  // An IP lock is either a spray in progress or a whole office shut out, so it
  // needs to page someone rather than sit in the audit table.
  it('alerts as well as audits when a source IP is locked', async () => {
    supabaseDouble({ signInError: { message: 'Invalid login credentials' } });
    mockRecordLoginFailure.mockResolvedValue({
      emailLocked: false,
      ipLocked: true,
      failures: 50,
      attemptsRemaining: 0,
      lockedForSeconds: 1800,
    });

    await signInWithPassword({ email: EMAIL, password: 'wrong' });

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUSPICIOUS_ACTIVITY',
        resourceType: 'authentication',
        resourceId: '203.0.113.10',
      }),
    );
    expect(mockLogAlert).toHaveBeenCalledWith(
      'login-ip-lockout-triggered',
      null,
      expect.objectContaining({ ipAddress: '203.0.113.10' }),
      expect.any(String),
    );
  });
});

// A locked address cannot clear itself by signing in — the gate refuses before
// the password is checked — so mailbox control is the only way back in.
describe('login lockout unlock via the password-reset code', () => {
  const verifyOtp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockResolvedValue({ auth: { verifyOtp } });
    // clearAllMocks leaves implementations in place, so a refusal set by one
    // test would otherwise carry into the next.
    mockCheckPasswordResetRateLimit.mockResolvedValue({ allowed: true });
  });

  it('clears the login counters once the reset code is accepted', async () => {
    verifyOtp.mockResolvedValue({ error: null, data: {} });

    await expect(verifyOTP(EMAIL, '123456')).resolves.toMatchObject({
      success: true,
    });
    expect(mockClearLoginFailures).toHaveBeenCalledWith(EMAIL);
  });

  // Otherwise an attacker could lift the lock they had just caused by guessing
  // reset codes at the same address.
  it('leaves the counters alone when the reset code is rejected', async () => {
    verifyOtp.mockResolvedValue({
      error: { message: 'Token has expired' },
      data: {},
    });

    await expect(verifyOTP(EMAIL, '000000')).resolves.toMatchObject({
      success: false,
    });
    expect(mockClearLoginFailures).not.toHaveBeenCalled();
  });

  // The code is checked before it reaches Supabase, for the same reason the
  // password is: a throttled attempt must not get to test a secret at all.
  it('refuses a throttled address without checking the code', async () => {
    mockCheckPasswordResetRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 30,
    });

    await expect(verifyOTP(EMAIL, '123456')).resolves.toMatchObject({
      success: false,
      error: 'Too many attempts. Please try again in 30 seconds.',
    });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('counts a rejected code so repeated guesses reach the lock', async () => {
    verifyOtp.mockResolvedValue({
      error: { message: 'Token has expired' },
      data: {},
    });

    await verifyOTP(EMAIL, '000000');

    expect(mockRecordPasswordResetFailure).toHaveBeenCalledWith(EMAIL);
  });

  it('clears the recovery counters too once the code is accepted', async () => {
    verifyOtp.mockResolvedValue({ error: null, data: {} });

    await verifyOTP(EMAIL, '123456');

    expect(mockClearPasswordResetFailures).toHaveBeenCalledWith(EMAIL);
  });
});
