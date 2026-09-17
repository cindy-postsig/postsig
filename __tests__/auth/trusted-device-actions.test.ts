jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/app/lib/actions', () => ({ sendResendEmail: jest.fn() }));
jest.mock('@/data/users', () => ({
  getEffectiveDateFormat: jest.fn().mockResolvedValue('MM/dd/yyyy'),
}));
jest.mock('@/lib/audit', () => ({ logTrustedDeviceEvent: jest.fn() }));
jest.mock('@/emails/TrustedDeviceAddedEmail', () => ({
  TrustedDeviceAddedEmail: jest.fn(),
}));

import { cookies, headers } from 'next/headers';
import logger from '@/utils/pino';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import {
  trustDevice,
  validateDeviceTokenServer,
} from '@/app/lib/auth/trusted-device-actions';
import {
  TRUSTED_DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_TTL_MS,
} from '@/constants/security';

const mockCookies = cookies as jest.Mock;
const mockHeaders = headers as jest.Mock;
const mockCreateClient = createClient as jest.Mock;
const mockCreateServiceClient = createServiceClient as jest.Mock;

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

function mockRequestHeaders(userAgent: string | null = CHROME_MAC) {
  mockHeaders.mockResolvedValue({
    get: (name: string) => {
      if (name === 'user-agent') return userAgent;
      if (name === 'x-forwarded-for') return '203.0.113.10';
      return null;
    },
  });
}

function mockCookieStore() {
  const set = jest.fn();
  mockCookies.mockResolvedValue({ set, get: jest.fn() });
  return set;
}

/**
 * Runs `fn` under an explicit NODE_ENV and always restores the previous value,
 * so neither case depends on the ambient env or leaks into later tests.
 */
async function withNodeEnv<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.NODE_ENV;
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
  });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: original,
      configurable: true,
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestHeaders();
});

const DEFAULT_USER = { id: 'u1', email: 'seth@example.com' };

describe('trustDevice', () => {
  function setupInsert(
    user: { id: string; email?: string } | null = DEFAULT_USER,
  ) {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    });
    const single = jest.fn().mockResolvedValue({
      data: {
        id: 'device-1',
        trusted_at: '2026-07-28T00:00:00.000Z',
        expires_at: '2026-08-27T00:00:00.000Z',
      },
      error: null,
    });
    mockCreateServiceClient.mockReturnValue({
      from: () => ({ insert: () => ({ select: () => ({ single }) }) }),
    });
  }

  it('sets the trust token as an HttpOnly cookie', async () => {
    setupInsert();
    const set = mockCookieStore();

    const result = await trustDevice();

    expect(result.success).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);
    const [name, value, options] = set.mock.calls[0];
    expect(name).toBe(TRUSTED_DEVICE_COOKIE_NAME);
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(TRUSTED_DEVICE_TTL_MS / 1000),
    });
  });

  it('marks the cookie Secure in production', async () => {
    const set = await withNodeEnv('production', async () => {
      setupInsert();
      const cookieSet = mockCookieStore();
      await trustDevice();
      return cookieSet;
    });

    expect(set.mock.calls[0][2]).toMatchObject({
      secure: true,
      httpOnly: true,
    });
  });

  it('leaves the cookie non-Secure outside production so local http works', async () => {
    const set = await withNodeEnv('test', async () => {
      setupInsert();
      const cookieSet = mockCookieStore();
      await trustDevice();
      return cookieSet;
    });

    expect(set.mock.calls[0][2]).toMatchObject({ secure: false });
  });

  it('never returns the raw token to the client', async () => {
    setupInsert();
    mockCookieStore();

    const result = await trustDevice();

    expect(result).toEqual({ success: true });
    expect(Object.keys(result)).not.toContain('deviceToken');
  });

  it('stores a hash of the token, not the raw token', async () => {
    setupInsert();
    const set = mockCookieStore();
    const insert = jest.fn().mockReturnValue({
      select: () => ({
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'device-1',
            trusted_at: '2026-07-28T00:00:00.000Z',
            expires_at: '2026-08-27T00:00:00.000Z',
          },
          error: null,
        }),
      }),
    });
    mockCreateServiceClient.mockReturnValue({ from: () => ({ insert }) });

    await trustDevice();

    const rawToken = set.mock.calls[0][1];
    const stored = insert.mock.calls[0][0].device_token;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(rawToken);
  });

  it('does not set a cookie when the user is unauthenticated', async () => {
    setupInsert(null);
    const set = mockCookieStore();

    const result = await trustDevice();

    expect(result.success).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
});

describe('validateDeviceTokenServer', () => {
  function setupLookup(
    row: Record<string, unknown> | null,
    error: unknown = null,
  ) {
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error });
    mockCreateServiceClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ gt: () => ({ maybeSingle }) }) }),
        }),
      }),
    });
  }

  it('validates a device whose browser family and OS still match', async () => {
    setupLookup({
      user_agent: CHROME_MAC,
      ip_address: '198.51.100.4',
      expires_at: '2026-08-27T00:00:00.000Z',
    });

    await expect(validateDeviceTokenServer('u1', 'tok')).resolves.toEqual({
      isValid: true,
    });
  });

  it('ignores a changed IP address', async () => {
    setupLookup({
      user_agent: CHROME_MAC,
      ip_address: '10.0.0.1',
      expires_at: '2026-08-27T00:00:00.000Z',
    });

    const result = await validateDeviceTokenServer('u1', 'tok');
    expect(result.isValid).toBe(true);
  });

  it('reports no_matching_row when the token matches no live row', async () => {
    setupLookup(null);

    await expect(validateDeviceTokenServer('u1', 'tok')).resolves.toEqual({
      isValid: false,
      reason: 'no_matching_row',
    });
  });

  it('reports user_agent_changed when the browser family differs', async () => {
    setupLookup({
      user_agent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      ip_address: '198.51.100.4',
      expires_at: '2026-08-27T00:00:00.000Z',
    });

    await expect(validateDeviceTokenServer('u1', 'tok')).resolves.toEqual({
      isValid: false,
      reason: 'user_agent_changed',
    });
  });

  it('reports lookup_error and fails closed when the lookup throws', async () => {
    mockCreateServiceClient.mockImplementation(() => {
      throw new Error('service client unavailable');
    });

    await expect(validateDeviceTokenServer('u1', 'tok')).resolves.toEqual({
      isValid: false,
      reason: 'lookup_error',
    });
  });

  it('distinguishes a failed query from a genuinely absent row', async () => {
    setupLookup(null, { message: 'connection reset', code: '08006' });

    await expect(validateDeviceTokenServer('u1', 'tok')).resolves.toEqual({
      isValid: false,
      reason: 'lookup_error',
    });
  });

  it('does not log expected rejections; the caller logs once at the redirect', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    setupLookup(null);

    await validateDeviceTokenServer('u1', 'tok');

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
