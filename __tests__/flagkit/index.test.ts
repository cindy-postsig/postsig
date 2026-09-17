import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const createFeatureClient = jest.fn();
const createSupabaseAdapter = jest.fn(() => 'mock-adapter');
const createServiceClient = jest.fn(() => 'mock-supabase-client');

jest.mock('@postsig/flagkit-sdk', () => ({ createFeatureClient }), {
  virtual: true,
});
jest.mock('@postsig/flagkit-supabase', () => ({ createSupabaseAdapter }), {
  virtual: true,
});
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: createServiceClient,
}));

// React.cache is a passthrough outside a server-components render, so the
// real one dedupes nothing under Jest. This stand-in memoizes on the same
// thing React does — the argument list — and records it, so the tests can
// assert both the dedupe and the primitive key the context is mapped onto.
const mockCacheStore = new Map<string, unknown>();
const mockCacheCallArgs: unknown[][] = [];

jest.mock('react', () => {
  const actual = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    cache:
      <Args extends unknown[], Result>(fn: (...args: Args) => Result) =>
      (...args: Args): Result => {
        mockCacheCallArgs.push(args);
        const key = JSON.stringify(args);
        if (!mockCacheStore.has(key)) {
          mockCacheStore.set(key, fn(...args));
        }
        return mockCacheStore.get(key) as Result;
      },
  };
});

import {
  normalizeEnv,
  createFlagClient,
  isFeatureEnabled,
} from '@/lib/flagkit';

describe('normalizeEnv', () => {
  it.each([
    ['local', 'development'],
    ['dev', 'development'],
    ['development', 'development'],
    ['staging', 'staging'],
    ['prod', 'production'],
    ['production', 'production'],
  ])('maps %s -> %s', (raw, expected) => {
    expect(normalizeEnv(raw)).toBe(expected);
  });

  it('defaults unknown values to development', () => {
    expect(normalizeEnv('something-else')).toBe('development');
  });

  it('defaults undefined to development', () => {
    expect(normalizeEnv(undefined)).toBe('development');
  });
});

describe('createFlagClient', () => {
  const originalEnv = process.env.ENV;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.ENV = originalEnv;
  });

  it('passes the normalized ENV value into createFeatureClient', async () => {
    process.env.ENV = 'prod';
    createFeatureClient.mockReturnValue('mock-flag-client');

    const client = await createFlagClient();

    expect(createFeatureClient).toHaveBeenCalledWith({
      environment: 'production',
      adapter: 'mock-adapter',
    });
    expect(createSupabaseAdapter).toHaveBeenCalledWith('mock-supabase-client');
    expect(client).toBe('mock-flag-client');
  });
});

describe('isFeatureEnabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheStore.clear();
    mockCacheCallArgs.length = 0;
  });

  it('delegates to flagClient.isEnabled with the featureKey and context', async () => {
    const isEnabled = jest.fn(() => Promise.resolve(true));
    createFeatureClient.mockReturnValue({ isEnabled });

    const context = { userId: 'user-123' };
    const result = await isFeatureEnabled('beta-sign', context);

    expect(isEnabled).toHaveBeenCalledWith('beta-sign', context);
    expect(result).toBe(true);
  });

  it('evaluates once when the same key and context are requested twice', async () => {
    const isEnabled = jest.fn(() => Promise.resolve(true));
    createFeatureClient.mockReturnValue({ isEnabled });

    const first = await isFeatureEnabled('cost-allocation', {
      organizationId: 'org-1',
      userId: 'user-1',
    });
    const second = await isFeatureEnabled('cost-allocation', {
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(createFeatureClient).toHaveBeenCalledTimes(1);
    expect(isEnabled).toHaveBeenCalledTimes(1);
  });

  it('evaluates twice when a context field differs', async () => {
    const isEnabled = jest.fn(() => Promise.resolve(true));
    createFeatureClient.mockReturnValue({ isEnabled });

    await isFeatureEnabled('cost-allocation', {
      organizationId: 'org-1',
      userId: 'user-1',
    });
    await isFeatureEnabled('cost-allocation', {
      organizationId: 'org-1',
      userId: 'user-2',
    });

    expect(isEnabled).toHaveBeenCalledTimes(2);
    expect(isEnabled).toHaveBeenNthCalledWith(1, 'cost-allocation', {
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(isEnabled).toHaveBeenNthCalledWith(2, 'cost-allocation', {
      organizationId: 'org-1',
      userId: 'user-2',
    });
  });

  it('evaluates twice when the feature key differs', async () => {
    const isEnabled = jest.fn(() => Promise.resolve(true));
    createFeatureClient.mockReturnValue({ isEnabled });

    await isFeatureEnabled('cost-allocation', { organizationId: 'org-1' });
    await isFeatureEnabled('hide-portfolio', { organizationId: 'org-1' });

    expect(isEnabled).toHaveBeenCalledTimes(2);
  });

  it('keys the cached evaluation on primitives covering every context field', async () => {
    const isEnabled = jest.fn(() => Promise.resolve(false));
    createFeatureClient.mockReturnValue({ isEnabled });

    await isFeatureEnabled('cost-allocation', {
      userId: 'user-1',
      organizationId: 'org-1',
      betaTester: true,
      seats: 5,
    });

    expect(mockCacheCallArgs).toEqual([
      [
        'cost-allocation',
        JSON.stringify([
          ['betaTester', true],
          ['organizationId', 'org-1'],
          ['seats', 5],
          ['userId', 'user-1'],
        ]),
      ],
    ]);
  });

  it('shares one evaluation across contexts that differ only in key order', async () => {
    const isEnabled = jest.fn(() => Promise.resolve(true));
    createFeatureClient.mockReturnValue({ isEnabled });

    await isFeatureEnabled('cost-allocation', {
      organizationId: 'org-1',
      userId: 'user-1',
    });
    await isFeatureEnabled('cost-allocation', {
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(isEnabled).toHaveBeenCalledTimes(1);
  });
});
