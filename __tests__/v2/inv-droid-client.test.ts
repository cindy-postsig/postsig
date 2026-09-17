// __tests__/v2/inv-droid-client.test.ts
//
// Unit tests for the droid value-overrides client: payload/URL/auth header on
// the happy path, env + session preconditions, and error mapping (axios 4xx
// {error} body surfaced; status extracted).

import axios from 'axios';

import {
  createOverrideViaDroid,
  revertOverrideViaDroid,
} from '@/app/lib/investor/droid-client';
import { getSession } from '@/data/users';

jest.mock('server-only', () => ({}));
jest.mock('axios');
jest.mock('@/data/users', () => ({ getSession: jest.fn() }));

const mockPost = axios.post as jest.Mock;
const mockIsAxiosError = axios.isAxiosError as unknown as jest.Mock;
const mockGetSession = getSession as jest.Mock;

// Only objects we explicitly tag count as axios errors in these tests.
function taggedAxiosError(e: unknown): boolean {
  return Boolean(e) && (e as { isAxiosError?: boolean }).isAxiosError === true;
}

// A flat axios-error fixture (avoids deep inline object nesting).
function axiosErr(status: number, error: string) {
  return { isAxiosError: true, response: { status, data: { error } } };
}

const payload = {
  entityType: 'inv_transaction',
  entityId: 42,
  fieldKey: 'amount',
  originalValue: 1000000,
  overrideValue: 2000000,
  reason: 'Confirmed via wire receipt',
};

const ORIGINAL_ENV = process.env.DROID_APP_API_URL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DROID_APP_API_URL = 'http://droid.test';
  mockGetSession.mockResolvedValue({ session: { access_token: 'tok-123' } });
  mockPost.mockResolvedValue({ data: {} });
  mockIsAxiosError.mockImplementation(taggedAxiosError);
});

afterAll(() => {
  process.env.DROID_APP_API_URL = ORIGINAL_ENV;
});

describe('createOverrideViaDroid', () => {
  it('POSTs the payload to the value-overrides endpoint with a Bearer token', async () => {
    await createOverrideViaDroid(payload);

    expect(mockPost).toHaveBeenCalledWith(
      'http://droid.test/v1/value-overrides',
      payload,
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok-123' },
        timeout: 30_000,
      }),
    );
  });

  it('throws when DROID_APP_API_URL is unset', async () => {
    delete process.env.DROID_APP_API_URL;

    await expect(createOverrideViaDroid(payload)).rejects.toThrow(
      'DROID_APP_API_URL is not configured',
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('throws when there is no active session', async () => {
    mockGetSession.mockResolvedValue({ session: null });

    await expect(createOverrideViaDroid(payload)).rejects.toThrow(
      'No active session',
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('surfaces droid 4xx { error } body and status', async () => {
    mockPost.mockRejectedValue(axiosErr(400, 'Field is not editable'));

    await expect(createOverrideViaDroid(payload)).rejects.toThrow(
      'Failed to save override: Field is not editable (status=400)',
    );
  });

  it('falls back to status=500 for a non-axios error with no body', async () => {
    mockPost.mockRejectedValue(new Error('socket hang up'));

    await expect(createOverrideViaDroid(payload)).rejects.toThrow(
      'Failed to save override (status=500)',
    );
  });
});

describe('revertOverrideViaDroid', () => {
  it('POSTs to the per-id revert endpoint with a Bearer token', async () => {
    await revertOverrideViaDroid('ov-uuid-9');

    expect(mockPost).toHaveBeenCalledWith(
      'http://droid.test/v1/value-overrides/ov-uuid-9/revert',
      {},
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok-123' },
        timeout: 30_000,
      }),
    );
  });

  it('maps an axios 403 to a revert failure with status', async () => {
    mockPost.mockRejectedValue(
      axiosErr(403, 'Not permitted to revert this override'),
    );

    await expect(revertOverrideViaDroid('ov-uuid-9')).rejects.toThrow(
      'Failed to revert override: Not permitted to revert this override (status=403)',
    );
  });

  it('URL-encodes the overrideId path segment to prevent path injection', async () => {
    await revertOverrideViaDroid('../admin/9?x=1');

    expect(mockPost).toHaveBeenCalledWith(
      'http://droid.test/v1/value-overrides/..%2Fadmin%2F9%3Fx%3D1/revert',
      {},
      expect.anything(),
    );
  });
});
