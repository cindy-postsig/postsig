import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const incr = jest.fn<(key: string) => Promise<number>>();
const ttl = jest.fn<(key: string) => Promise<number>>();
const expire = jest.fn<(key: string, seconds: number) => Promise<number>>();
const set = jest.fn<(...args: unknown[]) => Promise<string | null>>();
const get = jest.fn<(key: string) => Promise<string | null>>();
const pipelineExec =
  jest.fn<() => Promise<Array<[Error | null, unknown]> | null>>();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    incr,
    ttl,
    expire,
    set,
    get,
    pipeline: () => ({
      incr: (key: string) => {
        incr(key);
        return { ttl: () => ({ exec: pipelineExec }) };
      },
    }),
    on: jest.fn(),
    connect: jest.fn(async () => undefined),
    ping: jest.fn(async () => 'PONG'),
    status: 'ready',
  })),
}));

jest.mock('@/app/lib/redis/config', () => ({
  getRedisConfig: jest.fn(async () => ({ url: 'redis://test', options: {} })),
}));

import { getRedisService } from '@/app/lib/redis/service';

const KEY = 'auth:fail:email:abc';

describe('rate-limiting Redis primitives', () => {
  beforeEach(() => {
    incr.mockReset();
    ttl.mockReset();
    expire.mockReset();
    set.mockReset();
    get.mockReset();
    pipelineExec.mockReset();
  });

  describe('incrementWithExpiry', () => {
    // A brand new key has no TTL, so the window is anchored to the first hit.
    it('applies the TTL when the key has just been created', async () => {
      pipelineExec.mockResolvedValue([
        [null, 1],
        [null, -1],
      ]);
      expire.mockResolvedValue(1);

      const service = await getRedisService();

      await expect(service.incrementWithExpiry(KEY, 900)).resolves.toBe(1);
      expect(expire).toHaveBeenCalledWith(KEY, 900);
    });

    // Re-applying it here would push the window forward on every attempt and
    // turn a fixed window into one that never closes.
    it('leaves an existing TTL alone so the window does not slide', async () => {
      pipelineExec.mockResolvedValue([
        [null, 4],
        [null, 620],
      ]);

      const service = await getRedisService();

      await expect(service.incrementWithExpiry(KEY, 900)).resolves.toBe(4);
      expect(expire).not.toHaveBeenCalled();
    });

    // Self-heals a counter whose EXPIRE was lost, which would otherwise hold a
    // caller down permanently.
    it('re-applies a TTL that has gone missing', async () => {
      pipelineExec.mockResolvedValue([
        [null, 7],
        [null, -1],
      ]);
      expire.mockResolvedValue(1);

      const service = await getRedisService();

      await service.incrementWithExpiry(KEY, 900);
      expect(expire).toHaveBeenCalledWith(KEY, 900);
    });

    it('throws when the counter cannot be read, rather than reporting a zero', async () => {
      pipelineExec.mockResolvedValue([
        [new Error('down'), null],
        [null, -1],
      ]);

      const service = await getRedisService();

      await expect(service.incrementWithExpiry(KEY, 900)).rejects.toThrow();
    });

    // Falling through to EXPIRE on a failed TTL read is what would silently
    // convert the fixed window into a sliding one.
    it('throws rather than guessing when the TTL read fails', async () => {
      pipelineExec.mockResolvedValue([
        [null, 3],
        [new Error('down'), null],
      ]);

      const service = await getRedisService();

      await expect(service.incrementWithExpiry(KEY, 900)).rejects.toThrow();
      expect(expire).not.toHaveBeenCalled();
    });

    it('throws when the pipeline returns nothing at all', async () => {
      pipelineExec.mockResolvedValue(null);

      const service = await getRedisService();

      await expect(service.incrementWithExpiry(KEY, 900)).rejects.toThrow();
    });
  });

  describe('getTtl', () => {
    it.each([
      [900, 'a live key'],
      [-1, 'a key with no expiry'],
      [-2, 'a missing key'],
    ])('passes through %i for %s', async (value) => {
      ttl.mockResolvedValue(value);

      const service = await getRedisService();

      await expect(service.getTtl(KEY)).resolves.toBe(value);
    });

    it('throws when the read fails instead of looking like a missing key', async () => {
      ttl.mockRejectedValue(new Error('down'));

      const service = await getRedisService();

      await expect(service.getTtl(KEY)).rejects.toThrow();
    });
  });

  describe('getCount', () => {
    it('reads the current value without incrementing it', async () => {
      get.mockResolvedValue('7');

      const service = await getRedisService();

      await expect(service.getCount(KEY)).resolves.toBe(7);
      expect(incr).not.toHaveBeenCalled();
    });

    it('reports zero for a missing key', async () => {
      get.mockResolvedValue(null);

      const service = await getRedisService();

      await expect(service.getCount(KEY)).resolves.toBe(0);
    });

    it('throws when the read fails instead of looking like zero', async () => {
      get.mockRejectedValue(new Error('down'));

      const service = await getRedisService();

      await expect(service.getCount(KEY)).rejects.toThrow();
    });

    it('throws on a non-numeric value instead of guessing', async () => {
      get.mockResolvedValue('not-a-number');

      const service = await getRedisService();

      await expect(service.getCount(KEY)).rejects.toThrow();
    });
  });

  describe('setIfAbsent', () => {
    it('claims the key with an expiry and reports success', async () => {
      set.mockResolvedValue('OK');

      const service = await getRedisService();

      await expect(service.setIfAbsent(KEY, 10)).resolves.toBe(true);
      expect(set).toHaveBeenCalledWith(KEY, '1', 'EX', 10, 'NX');
    });

    it('reports failure when the key is already held', async () => {
      set.mockResolvedValue(null);

      const service = await getRedisService();

      await expect(service.setIfAbsent(KEY, 10)).resolves.toBe(false);
    });

    it('throws when the write fails instead of looking like a lost race', async () => {
      set.mockRejectedValue(new Error('down'));

      const service = await getRedisService();

      await expect(service.setIfAbsent(KEY, 10)).rejects.toThrow();
    });
  });

  describe('setWithTtl', () => {
    it('writes the key with an expiry', async () => {
      set.mockResolvedValue('OK');

      const service = await getRedisService();

      await service.setWithTtl(KEY, 1800);
      expect(set).toHaveBeenCalledWith(KEY, '1', 'EX', 1800);
    });

    it('throws when the lock cannot be written', async () => {
      set.mockRejectedValue(new Error('down'));

      const service = await getRedisService();

      await expect(service.setWithTtl(KEY, 1800)).rejects.toThrow();
    });
  });
});
