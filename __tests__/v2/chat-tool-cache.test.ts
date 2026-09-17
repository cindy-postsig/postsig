import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ChatToolCache, createChatToolCache } from '@/lib/v2/chat/tools/cache';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('ChatToolCache', () => {
  let cache: ChatToolCache;

  beforeEach(() => {
    cache = createChatToolCache();
  });

  it('should call the fetcher on cache miss', async () => {
    const fetcher = jest
      .fn<() => Promise<string[]>>()
      .mockResolvedValue(['a', 'b']);

    const result = await cache.getOrFetch('contracts', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['a', 'b']);
  });

  it('should return cached value on cache hit without calling fetcher again', async () => {
    const fetcher = jest
      .fn<() => Promise<string[]>>()
      .mockResolvedValue(['a', 'b']);

    await cache.getOrFetch('contracts', fetcher);
    const result = await cache.getOrFetch('contracts', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['a', 'b']);
  });

  it('should cache different keys independently', async () => {
    const fetcherA = jest
      .fn<() => Promise<string>>()
      .mockResolvedValue('value-a');
    const fetcherB = jest
      .fn<() => Promise<string>>()
      .mockResolvedValue('value-b');

    const a = await cache.getOrFetch('key-a', fetcherA);
    const b = await cache.getOrFetch('key-b', fetcherB);

    expect(a).toBe('value-a');
    expect(b).toBe('value-b');
    expect(fetcherA).toHaveBeenCalledTimes(1);
    expect(fetcherB).toHaveBeenCalledTimes(1);
  });

  it('should track hit/miss stats correctly', async () => {
    const fetcher = jest.fn<() => Promise<number>>().mockResolvedValue(42);

    await cache.getOrFetch('k1', fetcher);
    await cache.getOrFetch('k1', fetcher);
    await cache.getOrFetch('k1', fetcher);
    await cache.getOrFetch('k2', fetcher);

    const stats = cache.getStats();
    expect(stats.misses).toBe(2);
    expect(stats.hits).toBe(2);
  });

  it('should return a fresh stats copy', async () => {
    const stats1 = cache.getStats();
    const fetcher = jest.fn<() => Promise<number>>().mockResolvedValue(1);
    await cache.getOrFetch('x', fetcher);
    const stats2 = cache.getStats();

    expect(stats1.misses).toBe(0);
    expect(stats2.misses).toBe(1);
  });

  it('should propagate fetcher errors without caching', async () => {
    const fetcher = jest
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error('db error'));

    await expect(cache.getOrFetch('failing', fetcher)).rejects.toThrow(
      'db error',
    );

    // The failed value should not be cached
    expect(cache.getStats().misses).toBe(1);

    // Retry should call fetcher again
    fetcher.mockResolvedValue('recovered');
    const result = await cache.getOrFetch('failing', fetcher);
    expect(result).toBe('recovered');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('ChatToolCache.buildKey', () => {
  it('should produce key with empty params when none provided', () => {
    expect(ChatToolCache.buildKey('getContractsListForLineageAI')).toBe(
      'getContractsListForLineageAI:{}',
    );
  });

  it('should serialise params into the key', () => {
    expect(
      ChatToolCache.buildKey('getContractsListForLineageAI', {
        contractFields: ['vendor', 'type'],
      }),
    ).toBe('getContractsListForLineageAI:{"contractFields":["vendor","type"]}');
  });

  it('should produce identical keys for identical params', () => {
    const key1 = ChatToolCache.buildKey('fn', { a: 1, b: 'x' });
    const key2 = ChatToolCache.buildKey('fn', { a: 1, b: 'x' });
    expect(key1).toBe(key2);
  });

  it('should produce different keys for different function names', () => {
    const key1 = ChatToolCache.buildKey('fnA');
    const key2 = ChatToolCache.buildKey('fnB');
    expect(key1).not.toBe(key2);
  });

  it('should produce different keys for different params', () => {
    const key1 = ChatToolCache.buildKey('fn', { status: 'active' });
    const key2 = ChatToolCache.buildKey('fn', { status: 'all' });
    expect(key1).not.toBe(key2);
  });
});

describe('createChatToolCache', () => {
  it('should return a new ChatToolCache instance', () => {
    const cache = createChatToolCache();
    expect(cache).toBeInstanceOf(ChatToolCache);
  });

  it('should return independent instances', async () => {
    const cache1 = createChatToolCache();
    const cache2 = createChatToolCache();
    const fetcher = jest.fn<() => Promise<string>>().mockResolvedValue('data');

    await cache1.getOrFetch('key', fetcher);

    expect(cache1.getStats().misses).toBe(1);
    expect(cache2.getStats().misses).toBe(0);
  });
});
