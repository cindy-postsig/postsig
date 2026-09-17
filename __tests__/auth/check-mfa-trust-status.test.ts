jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/app/lib/actions', () => ({ sendResendEmail: jest.fn() }));
jest.mock('@/app/lib/auth/trusted-device-actions', () => ({
  validateDeviceTokenServer: jest.fn(),
}));

import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { cookies } from 'next/headers';
import { validateDeviceTokenServer } from '@/app/lib/auth/trusted-device-actions';
import { checkMFATrustStatus } from '@/app/lib/auth/mfa-actions';
import type { User } from '@supabase/supabase-js';

const mockCreateClient = createClient as jest.Mock;
const mockCreateServiceClient = createServiceClient as jest.Mock;
const mockCookies = cookies as jest.Mock;
const mockValidateDeviceToken = validateDeviceTokenServer as jest.Mock;

const recentIso = () => new Date(Date.now() - 60_000).toISOString();
const staleIso = () => new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();

function setup({
  user = { id: 'u1' },
  userData = undefined,
  userDataError = null,
  currentLevel = 'aal1',
  aalError = null,
  deviceToken = undefined,
  trusted = false,
  sessionId = 's-current',
  claimsError = false,
}: {
  user?: { id: string; identities?: Array<{ provider: string }> } | null;
  userData?: Record<string, unknown>;
  userDataError?: unknown;
  currentLevel?: string;
  aalError?: unknown;
  deviceToken?: string;
  trusted?: boolean;
  sessionId?: string | null;
  claimsError?: boolean;
}) {
  const getAuthenticatorAssuranceLevel = jest
    .fn()
    .mockResolvedValue({ data: { currentLevel }, error: aalError });
  const getClaims = jest.fn().mockImplementation(async () => {
    if (claimsError) throw new Error('claims unavailable');
    return { data: { claims: { session_id: sessionId } }, error: null };
  });
  const getUser = jest.fn().mockResolvedValue({ data: { user } });
  mockCreateClient.mockResolvedValue({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel },
      getClaims,
    },
  });
  const single = jest
    .fn()
    .mockResolvedValue({ data: userData ?? null, error: userDataError });
  mockCreateServiceClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  });
  mockCookies.mockResolvedValue({
    get: () => (deviceToken ? { value: deviceToken } : undefined),
  });
  mockValidateDeviceToken.mockResolvedValue(
    trusted ? { isValid: true } : { isValid: false, reason: 'no_matching_row' },
  );
  return { getAuthenticatorAssuranceLevel, getUser, single };
}

const asUser = (user: {
  id: string;
  identities?: Array<{ provider: string }>;
}): User => user as unknown as User;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DISABLE_MFA = 'false';
});

describe('checkMFATrustStatus', () => {
  it('exempts SSO sessions from app MFA without consulting the users table', async () => {
    setup({
      user: { id: 'u1', identities: [{ provider: 'sso:8a4f0e12' }] },
      userData: {
        mfa_enabled: true,
        mfa_type: 'totp',
        mfa_last_verified_at: staleIso(),
      },
    });
    const result = await checkMFATrustStatus();
    expect(result).toMatchObject({
      needsVerification: false,
      needsMFAEnroll: false,
    });
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it('does not treat non-SSO identity providers as SSO', async () => {
    setup({
      user: { id: 'u1', identities: [{ provider: 'email' }] },
      userData: { mfa_enabled: false },
    });
    const result = await checkMFATrustStatus();
    expect(result.needsMFAEnroll).toBe(true);
  });

  it('requires enrollment when MFA is not enabled', async () => {
    setup({ userData: { mfa_enabled: false } });
    const result = await checkMFATrustStatus();
    expect(result).toMatchObject({
      needsMFAEnroll: true,
      needsVerification: false,
    });
  });

  it('fails closed (requires verification) when the user query errors', async () => {
    setup({ userDataError: { message: 'db down' } });
    const result = await checkMFATrustStatus();
    expect(result.needsVerification).toBe(true);
    expect(result.needsMFAEnroll).toBe(false);
  });

  it('trusts a valid device without consulting AAL or recency', async () => {
    const { getAuthenticatorAssuranceLevel } = setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'totp',
        mfa_last_verified_at: null,
      },
      deviceToken: 'tok',
      trusted: true,
      currentLevel: 'aal1',
    });
    const result = await checkMFATrustStatus();
    expect(result.needsVerification).toBe(false);
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it('allows recent TOTP only when the session is AAL2', async () => {
    setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'totp',
        mfa_last_verified_at: recentIso(),
      },
      currentLevel: 'aal2',
    });
    expect((await checkMFATrustStatus()).needsVerification).toBe(false);
  });

  it('re-prompts recent TOTP when the session is not AAL2', async () => {
    setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'totp',
        mfa_last_verified_at: recentIso(),
      },
      currentLevel: 'aal1',
    });
    expect((await checkMFATrustStatus()).needsVerification).toBe(true);
  });

  it('re-prompts TOTP once the recency window has elapsed even with AAL2', async () => {
    setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'totp',
        mfa_last_verified_at: staleIso(),
      },
      currentLevel: 'aal2',
    });
    expect((await checkMFATrustStatus()).needsVerification).toBe(true);
  });

  it('fails closed for TOTP when the AAL lookup errors', async () => {
    setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'totp',
        mfa_last_verified_at: recentIso(),
      },
      aalError: { message: 'aal down' },
      currentLevel: 'aal2',
    });
    expect((await checkMFATrustStatus()).needsVerification).toBe(true);
  });

  it('allows recent email MFA when the stored session_id matches, without consulting AAL', async () => {
    const { getAuthenticatorAssuranceLevel } = setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'email',
        email_mfa_session_verified_at: recentIso(),
        email_mfa_session_id: 's-current',
      },
      sessionId: 's-current',
      currentLevel: 'aal1',
    });
    expect((await checkMFATrustStatus()).needsVerification).toBe(false);
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it('re-prompts an untrusted device whose recent email verification came from a different session', async () => {
    setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'email',
        email_mfa_session_verified_at: recentIso(),
        email_mfa_session_id: 's-other-device',
      },
      sessionId: 's-current',
      trusted: false,
    });
    expect((await checkMFATrustStatus()).needsVerification).toBe(true);
  });

  it('re-prompts email MFA when the stored session_id is null (verified before the column existed)', async () => {
    setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'email',
        email_mfa_session_verified_at: recentIso(),
        email_mfa_session_id: null,
      },
      sessionId: 's-current',
    });
    expect((await checkMFATrustStatus()).needsVerification).toBe(true);
  });

  it('fails closed for email MFA when session_id cannot be read', async () => {
    setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'email',
        email_mfa_session_verified_at: recentIso(),
        email_mfa_session_id: 's-current',
      },
      claimsError: true,
    });
    expect((await checkMFATrustStatus()).needsVerification).toBe(true);
  });

  it('re-prompts stale email MFA even when the session_id matches', async () => {
    setup({
      userData: {
        mfa_enabled: true,
        mfa_type: 'email',
        email_mfa_session_verified_at: staleIso(),
        email_mfa_session_id: 's-current',
      },
      sessionId: 's-current',
    });
    expect((await checkMFATrustStatus()).needsVerification).toBe(true);
  });

  describe('trustFailureReason', () => {
    it('reports no_cookie when no trust cookie was presented', async () => {
      setup({
        userData: {
          mfa_enabled: true,
          mfa_type: 'totp',
          mfa_last_verified_at: staleIso(),
        },
        deviceToken: undefined,
      });
      const result = await checkMFATrustStatus();
      expect(result.needsVerification).toBe(true);
      expect(result.trustFailureReason).toBe('no_cookie');
    });

    it('does not call the validator when there is no cookie', async () => {
      setup({
        userData: {
          mfa_enabled: true,
          mfa_type: 'totp',
          mfa_last_verified_at: staleIso(),
        },
        deviceToken: undefined,
      });
      await checkMFATrustStatus();
      expect(mockValidateDeviceToken).not.toHaveBeenCalled();
    });

    it('surfaces the validator reason when a cookie was presented but rejected', async () => {
      setup({
        userData: {
          mfa_enabled: true,
          mfa_type: 'totp',
          mfa_last_verified_at: staleIso(),
        },
        deviceToken: 'tok',
        trusted: false,
      });
      mockValidateDeviceToken.mockResolvedValue({
        isValid: false,
        reason: 'user_agent_changed',
      });
      const result = await checkMFATrustStatus();
      expect(result.needsVerification).toBe(true);
      expect(result.trustFailureReason).toBe('user_agent_changed');
    });

    it('omits a reason when the device is trusted', async () => {
      setup({
        userData: {
          mfa_enabled: true,
          mfa_type: 'totp',
          mfa_last_verified_at: null,
        },
        deviceToken: 'tok',
        trusted: true,
      });
      const result = await checkMFATrustStatus();
      expect(result.needsVerification).toBe(false);
      expect(result.trustFailureReason).toBeUndefined();
    });
  });

  describe('caller-supplied session', () => {
    const totpRow = {
      mfa_enabled: true,
      mfa_type: 'totp',
      mfa_last_verified_at: null,
      email_mfa_session_verified_at: null,
      email_mfa_session_id: null,
    };

    it('fetches the user and the users row when nothing is supplied', async () => {
      const { getUser, single } = setup({ userData: totpRow });

      await checkMFATrustStatus();

      expect(getUser).toHaveBeenCalled();
      expect(single).toHaveBeenCalled();
    });

    // setup's session has no user, so reaching the users read at all proves
    // the supplied one was used rather than a fetched null.
    it('skips auth.getUser when the user is supplied', async () => {
      const { getUser, single } = setup({ user: null, userData: totpRow });

      await checkMFATrustStatus({ user: asUser({ id: 'u1' }) });

      expect(getUser).not.toHaveBeenCalled();
      expect(single).toHaveBeenCalled();
    });

    it('skips the users read when the MFA columns are supplied', async () => {
      setup({ deviceToken: 'tok', trusted: true });

      const result = await checkMFATrustStatus({
        user: asUser({ id: 'u1' }),
        mfa: totpRow,
      });

      expect(mockCreateServiceClient).not.toHaveBeenCalled();
      expect(result.needsVerification).toBe(false);
    });

    it('exempts a supplied SSO user without consulting the users table', async () => {
      setup({ user: null });

      const result = await checkMFATrustStatus({
        user: asUser({
          id: 'u1',
          identities: [{ provider: 'sso:8a4f0e12' }],
        }),
        mfa: { ...totpRow, mfa_last_verified_at: staleIso() },
      });

      expect(result).toMatchObject({
        needsVerification: false,
        needsMFAEnroll: false,
      });
      expect(mockCreateServiceClient).not.toHaveBeenCalled();
    });

    it('falls back to the users read, failing closed, when only the user is supplied', async () => {
      const { single } = setup({
        user: null,
        userDataError: { message: 'db down' },
      });

      const result = await checkMFATrustStatus({ user: asUser({ id: 'u1' }) });

      expect(single).toHaveBeenCalled();
      expect(result.needsVerification).toBe(true);
      expect(result.needsMFAEnroll).toBe(false);
    });

    it('reaches the email MFA verdict from the supplied columns', async () => {
      setup({ user: null, sessionId: 's-current' });

      const result = await checkMFATrustStatus({
        user: asUser({ id: 'u1' }),
        mfa: {
          mfa_enabled: true,
          mfa_type: 'email',
          mfa_last_verified_at: null,
          email_mfa_session_verified_at: recentIso(),
          email_mfa_session_id: 's-current',
        },
      });

      expect(result.needsVerification).toBe(false);
      expect(mockCreateServiceClient).not.toHaveBeenCalled();
    });
  });
});
