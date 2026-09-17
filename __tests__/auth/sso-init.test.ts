import { GET } from '@/app/login/sso/route';
import { PUBLIC_PATHS_EXACT } from '@/constants/auth';
import type { NextRequest } from 'next/server';

const mockSignInWithSSO = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithSSO: (...args: unknown[]) => mockSignInWithSSO(...args),
    },
  }),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
}));

const ORIGIN = 'https://app.postsig.com';
const IDP_URL = 'https://login.microsoftonline.com/tenant/saml2?SAMLRequest=x';

const requestFor = (query: string) =>
  ({
    nextUrl: new URL(`${ORIGIN}/login/sso${query}`),
  }) as unknown as NextRequest;

const locationOf = (response: Response) =>
  new URL(response.headers.get('location') as string);

describe('GET /login/sso', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignInWithSSO.mockResolvedValue({
      data: { url: IDP_URL },
      error: null,
    });
  });

  it('redirects to the IdP with the callback as the return URL', async () => {
    const response = await GET(requestFor('?domain=gardacp.com'));

    expect(mockSignInWithSSO).toHaveBeenCalledWith({
      domain: 'gardacp.com',
      options: { redirectTo: `${ORIGIN}/auth/callback` },
    });
    expect(locationOf(response).toString()).toBe(IDP_URL);
  });

  it('normalizes the domain so a tile URL is case and whitespace tolerant', async () => {
    await GET(requestFor('?domain=%20GardaCP.com%20'));

    expect(mockSignInWithSSO).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'gardacp.com' }),
    );
  });

  it('sends the user to the login form when the domain is missing', async () => {
    const response = await GET(requestFor(''));

    expect(mockSignInWithSSO).not.toHaveBeenCalled();
    expect(locationOf(response).pathname).toBe('/login');
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('sends the user to the login form when no provider matches the domain', async () => {
    mockSignInWithSSO.mockResolvedValue({
      data: null,
      error: { message: 'No SSO provider assigned for this domain' },
    });

    const response = await GET(requestFor('?domain=example.com'));

    expect(locationOf(response).pathname).toBe('/login');
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('never echoes the requested domain back to an unauthenticated visitor', async () => {
    mockSignInWithSSO.mockResolvedValue({
      data: null,
      error: { message: 'x' },
    });

    const response = await GET(requestFor('?domain=example.com'));

    expect(locationOf(response).searchParams.get('message')).not.toContain(
      'example.com',
    );
  });

  it('is public in middleware, so the tile is not bounced to the login form', () => {
    expect(PUBLIC_PATHS_EXACT).toContain('/login/sso');
  });
});
