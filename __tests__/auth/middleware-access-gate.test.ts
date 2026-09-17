jest.mock('@/utils/supabase/middleware', () => ({ updateSession: jest.fn() }));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/app/lib/auth/mfa-actions', () => ({
  checkMFATrustStatus: jest.fn(),
}));
jest.mock('@/utils/middleware', () => ({
  generateCSPHeader: jest.fn(() => "default-src 'self'"),
}));

import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '@/proxy';
import { updateSession } from '@/utils/supabase/middleware';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { checkMFATrustStatus } from '@/app/lib/auth/mfa-actions';
import type { AccountAccessResult } from '@/constants/types';

const mockUpdateSession = updateSession as jest.Mock;
const mockCreateClient = createClient as jest.Mock;
const mockCookies = cookies as jest.Mock;
const mockCheckMFATrustStatus = checkMFATrustStatus as jest.Mock;

const signOut = jest.fn();

function setup(access: AccountAccessResult | null) {
  mockCookies.mockResolvedValue({
    get: jest.fn(() => undefined),
    delete: jest.fn(),
  });
  mockCreateClient.mockResolvedValue({ auth: { signOut } });
  // Trust is satisfied, so any MFA redirect we observe came from the gate
  // ordering being wrong rather than from a genuine re-verification.
  mockCheckMFATrustStatus.mockResolvedValue({
    needsMFAEnroll: false,
    needsVerification: false,
  });
  mockUpdateSession.mockResolvedValue({
    response: NextResponse.next(),
    user: { id: 'u1', email: 'user@client.com' },
    access,
    userMetadata: access?.status === 'ok' ? access.metadata : null,
    authenticated: true,
  });
}

const request = (path = '/dashboard') =>
  new NextRequest(new URL(path, 'https://app.postsig.com'));

const mfa = {
  mfa_enabled: true,
  mfa_type: 'totp',
  mfa_last_verified_at: null,
  email_mfa_session_verified_at: null,
  email_mfa_session_id: null,
};

const okAccess: AccountAccessResult = {
  status: 'ok',
  metadata: {
    userRole: 11,
    appModules: [{ code: 'cpm', name: 'CPM', basePath: '/dashboard' }],
    defaultModule: { code: 'cpm', name: 'CPM', basePath: '/dashboard' },
    isTrial: false,
    cpmTrialEnabled: false,
    investorTrialEnabled: false,
    userProfile: { signed_up: true },
    mfa,
  },
};

beforeEach(() => jest.clearAllMocks());

describe('middleware access gate', () => {
  it.each([
    ['no-role'],
    ['role-not-permitted'],
    ['modules-revoked'],
    ['org-inactive'],
  ] as const)(
    'signs out and redirects a denied session (%s)',
    async (reason) => {
      setup({ status: 'denied', reason });

      const response = await proxy(request());

      expect(signOut).toHaveBeenCalled();
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('message')).toBe(
        'User has no privileges for access',
      );
    },
  );

  // Regression: a denied session used to fall through every gate, because
  // null metadata left `signedUp` undefined and skipped the role check.
  it('does not let a denied session reach the app', async () => {
    setup({ status: 'denied', reason: 'modules-revoked' });

    const response = await proxy(request());

    expect(response.headers.get('location')).not.toBeNull();
  });

  it('does not sign out on an infrastructure error, which would log everyone out on a database blip', async () => {
    setup({ status: 'error' });

    await proxy(request());

    expect(signOut).not.toHaveBeenCalled();
  });

  it('lets a permitted session through', async () => {
    setup(okAccess);

    const response = await proxy(request());

    expect(signOut).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBeNull();
  });

  // The MFA gate must not re-authenticate or re-read what updateSession
  // already fetched — those are two extra edge-to-database round trips.
  it('hands the MFA gate the session user and MFA columns it already has', async () => {
    setup(okAccess);

    await proxy(request());

    expect(mockCheckMFATrustStatus).toHaveBeenCalledWith({
      user: { id: 'u1', email: 'user@client.com' },
      mfa,
    });
  });

  it('leaves the MFA gate to fetch the columns itself when metadata is missing', async () => {
    setup({ status: 'error' });

    await proxy(request());

    expect(mockCheckMFATrustStatus).toHaveBeenCalledWith({
      user: { id: 'u1', email: 'user@client.com' },
      mfa: undefined,
    });
  });
});
