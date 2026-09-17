import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const scan = jest.fn<(...args: unknown[]) => Promise<[string, string[]]>>();
const unlink = jest.fn<(...keys: string[]) => Promise<number>>();
const keys = jest.fn<(pattern: string) => Promise<string[]>>();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    scan,
    unlink,
    keys,
    del: jest.fn(),
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

describe('clearOrganizationCache', () => {
  beforeEach(() => {
    scan.mockReset();
    unlink.mockReset();
    keys.mockReset();
  });

  it('walks the full SCAN cursor and UNLINKs each page', async () => {
    scan
      .mockResolvedValueOnce(['42', ['user:1:org:abc:x', 'user:2:org:abc:x']])
      .mockResolvedValueOnce(['0', ['org:abc:contracts:base:v3']]);
    unlink.mockResolvedValue(2);

    const service = await getRedisService();
    const ok = await service.clearOrganizationCache({ organizationId: 'abc' });

    expect(ok).toBe(true);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      '*org:abc:*',
      'COUNT',
      1000,
    );
    expect(scan).toHaveBeenNthCalledWith(
      2,
      '42',
      'MATCH',
      '*org:abc:*',
      'COUNT',
      1000,
    );
    expect(unlink).toHaveBeenCalledTimes(2);
    expect(unlink).toHaveBeenNthCalledWith(
      1,
      'user:1:org:abc:x',
      'user:2:org:abc:x',
    );
    expect(keys).not.toHaveBeenCalled();
  });

  it('skips UNLINK for empty pages and still succeeds', async () => {
    scan.mockResolvedValueOnce(['0', []]);

    const service = await getRedisService();
    const ok = await service.clearOrganizationCache({ organizationId: 'abc' });

    expect(ok).toBe(true);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('scopes clearUserCache to the user prefix', async () => {
    scan.mockResolvedValueOnce(['0', ['user:u1:session']]);
    unlink.mockResolvedValue(1);

    const service = await getRedisService();
    const ok = await service.clearUserCache({ userId: 'u1' });

    expect(ok).toBe(true);
    expect(scan).toHaveBeenCalledWith('0', 'MATCH', 'user:u1:*', 'COUNT', 1000);
  });
});
