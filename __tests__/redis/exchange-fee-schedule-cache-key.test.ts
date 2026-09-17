jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const store = new Map<string, unknown>();
const writes: string[] = [];
const writeMetadata: unknown[] = [];
const writeTtls: unknown[] = [];
const deletes: string[] = [];

jest.mock('@/app/lib/redis/service', () => ({
  getRedisService: async () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (
      key: string,
      value: unknown,
      metadata?: unknown,
      ttl?: number,
    ) => {
      writes.push(key);
      writeMetadata.push(metadata);
      writeTtls.push(ttl);
      store.set(key, value);
      return true;
    },
    del: async (key: string) => {
      deletes.push(key);
      return store.delete(key);
    },
  }),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: async () => null,
}));

import { getCacheService } from '@/app/lib/redis/cache-service';
import type { FeeScheduleDataset } from '@/lib/exchange-agreement/feeScheduleQueries';

const dataset: FeeScheduleDataset = {
  exchange: { code: 'euronext', name: 'Euronext', currency: '€' },
  rawVersions: [],
  versions: [
    {
      id: '1:Cash',
      exchangeCode: 'euronext',
      productLine: 'Cash',
      version: '2026.1',
      label: 'January 2026',
      effectiveDate: '2026-01-01',
      invalidatedDate: null,
      sourceDocumentUrl: null,
    },
  ],
  lineItems: [
    {
      id: '1',
      versionId: '1:Cash',
      productId: 'abc123',
      title: 'Trading fee'.repeat(20),
      assetClass: null,
      useType: '',
      level: null,
      fee: 1.5,
      currency: 'EUR',
      productCode: null,
      page: null,
    },
  ],
};

beforeEach(() => {
  store.clear();
  writes.length = 0;
  writeMetadata.length = 0;
  writeTtls.length = 0;
  deletes.length = 0;
});

describe('exchange fee schedule cache', () => {
  it('is a single global key per exchange, versioned, with no org/user prefix', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheExchangeFeeScheduleDataset('euronext', dataset);

    expect(writes).toEqual(['exchange-agreements:fee-schedule:v1:euronext']);
    expect(writeMetadata).toEqual([undefined]);
  });

  it('reads back what it wrote, gzipped rather than as plain JSON', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheExchangeFeeScheduleDataset('euronext', dataset);

    const stored = store.get(writes[0]) as {
      gz: string;
      versionCount: number;
      lineItemCount: number;
    };
    expect(typeof stored.gz).toBe('string');
    expect(stored.gz.length).toBeLessThan(JSON.stringify(dataset).length);
    expect(stored.versionCount).toBe(1);
    expect(stored.lineItemCount).toBe(1);

    expect(
      await cacheService.getExchangeFeeScheduleDataset('euronext'),
    ).toEqual(dataset);
  });

  it('misses cleanly for an exchange that was never cached', async () => {
    const cacheService = await getCacheService();

    expect(await cacheService.getExchangeFeeScheduleDataset('nyse')).toBeNull();
  });

  it('keeps the default TTL under the 1-hour signed source-doc URL TTL', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheExchangeFeeScheduleDataset('euronext', dataset);

    expect(writeTtls[0]).toBeLessThan(60 * 60);
  });

  it('invalidates only the given exchange', async () => {
    const cacheService = await getCacheService();
    await cacheService.cacheExchangeFeeScheduleDataset('euronext', dataset);
    await cacheService.cacheExchangeFeeScheduleDataset('nyse', dataset);

    await cacheService.invalidateExchangeFeeScheduleDataset('euronext');

    expect(deletes).toEqual(['exchange-agreements:fee-schedule:v1:euronext']);
    expect(
      await cacheService.getExchangeFeeScheduleDataset('euronext'),
    ).toBeNull();
    expect(await cacheService.getExchangeFeeScheduleDataset('nyse')).toEqual(
      dataset,
    );
  });
});
