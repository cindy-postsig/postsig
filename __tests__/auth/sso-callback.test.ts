import { GET } from '@/app/auth/callback/route';
import type { NextRequest } from 'next/server';

const mockExchangeCodeForSession = jest.fn();
const mockSignOut = jest.fn();
const mockProvisionSsoUser = jest.fn();
const mockLogAlert = jest.fn();
const mockLoggerInfo = jest.fn();

jest.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) =>
        mockExchangeCodeForSession(...args),
      signOut: () => mockSignOut(),
    },
  }),
}));

jest.mock('@/app/lib/auth/sso-provisioning', () => ({
  provisionSsoUser: (...args: unknown[]) => mockProvisionSsoUser(...args),
}));

jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => mockLogAlert(...args),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: (...args: unknown[]) => mockLoggerInfo(...args),
  },
}));

const ORIGIN = 'https://dev.postsig.com';
const REJECTED_ASSERTION =
  '?error=server_error&error_description=SAML+Assertion+does+not+contain+an+email+address';

const requestFor = (query: string) =>
  ({
    url: `${ORIGIN}/auth/callback${query}`,
    nextUrl: { origin: ORIGIN },
  }) as unknown as NextRequest;

const locationOf = (response: Response) =>
  new URL(response.headers.get('location') as string);

const ssoUser = { id: 'user-1', identities: [{ provider: 'sso:abc' }] };

describe('GET /auth/callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: ssoUser },
      error: null,
    });
    mockProvisionSsoUser.mockResolvedValue({
      status: 'provisioned',
      organizationId: 'org-1',
    });
  });

  describe('when the IdP assertion is rejected', () => {
    it('alerts with the error description and skips the code exchange', async () => {
      await GET(requestFor(REJECTED_ASSERTION));

      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
      expect(mockLogAlert).toHaveBeenCalledWith(
        'sso-callback-failure',
        null,
        expect.objectContaining({
          idpError: 'server_error',
          idpErrorDescription:
            'SAML Assertion does not contain an email address',
        }),
        expect.any(String),
      );
    });

    it('keeps the IdP wording out of the user-facing message', async () => {
      const response = await GET(requestFor(REJECTED_ASSERTION));
      const location = locationOf(response);

      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('message')).toBe(
        'Sign-in failed. Please try again.',
      );
    });
  });

  it('alerts when the callback arrives with neither a code nor an error', async () => {
    const response = await GET(requestFor(''));

    expect(mockLogAlert).toHaveBeenCalledWith(
      'sso-callback-failure',
      null,
      expect.objectContaining({ action: 'ssoCallback' }),
      expect.any(String),
    );
    expect(locationOf(response).pathname).toBe('/login');
  });

  it('alerts when the code exchange fails', async () => {
    const exchangeError = new Error('invalid code verifier');
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: exchangeError,
    });

    const response = await GET(requestFor('?code=abc'));

    expect(mockLogAlert).toHaveBeenCalledWith(
      'sso-callback-failure',
      exchangeError,
      expect.objectContaining({ action: 'ssoCallback' }),
      expect.any(String),
    );
    expect(locationOf(response).pathname).toBe('/login');
  });

  describe('provisioning', () => {
    it('logs the organization a first-time SSO user landed in', async () => {
      await GET(requestFor('?code=abc'));

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          organizationId: 'org-1',
          action: 'ssoProvisioned',
        }),
        expect.any(String),
      );
    });

    it('stays quiet for a returning SSO user', async () => {
      mockProvisionSsoUser.mockResolvedValue({
        status: 'already-provisioned',
        organizationId: 'org-1',
      });

      await GET(requestFor('?code=abc'));

      expect(mockLoggerInfo).not.toHaveBeenCalled();
    });

    it('signs out a rejected user and tells them to contact an admin', async () => {
      mockProvisionSsoUser.mockResolvedValue({
        status: 'rejected',
        reason: 'no-matching-org',
      });

      const response = await GET(requestFor('?code=abc'));

      expect(mockSignOut).toHaveBeenCalled();
      expect(locationOf(response).searchParams.get('message')).toBe(
        'Your account is not set up yet. Please contact your administrator.',
      );
    });

    it('is skipped for a password user', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-2', identities: [{ provider: 'email' }] } },
        error: null,
      });

      await GET(requestFor('?code=abc'));

      expect(mockProvisionSsoUser).not.toHaveBeenCalled();
    });
  });

  describe('redirect target', () => {
    it('honours an internal next path', async () => {
      const response = await GET(requestFor('?code=abc&next=%2Fdashboard'));
      expect(locationOf(response).pathname).toBe('/dashboard');
    });

    it('falls back to the root for an external next path', async () => {
      const response = await GET(
        requestFor('?code=abc&next=https%3A%2F%2Fevil.example'),
      );
      const location = locationOf(response);

      expect(location.origin).toBe(ORIGIN);
      expect(location.pathname).toBe('/');
    });
  });
});
