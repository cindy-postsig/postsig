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
const reads: string[] = [];
const readMetadata: unknown[] = [];
const writes: string[] = [];
const writeMetadata: unknown[] = [];

jest.mock('@/app/lib/redis/service', () => ({
  getRedisService: async () => ({
    get: async (key: string, metadata?: unknown) => {
      reads.push(key);
      readMetadata.push(metadata);
      return store.get(key) ?? null;
    },
    set: async (key: string, value: unknown, metadata?: unknown) => {
      writes.push(key);
      writeMetadata.push(metadata);
      store.set(key, value);
      return true;
    },
    del: async (key: string) => store.delete(key),
    clearOrganizationCache: async () => true,
  }),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: async () => userMetadata,
}));

import { getCacheService } from '@/app/lib/redis/cache-service';
import type { UserMetadata } from '@/constants/types';

const userMetadata: UserMetadata = {
  userId: 'user-1',
  userProfile: null,
  userRole: 2,
  organizationId: 'org-1',
  organizationName: 'Acme',
  organizationFY: 1,
  dateFormat: 'dd/MM/yyyy',
  organizationDateFormat: 'dd/MM/yyyy',
  baseCurrency: 'USD',
  appModules: [],
  isTrial: false,
  cpmTrialEnabled: false,
  investorTrialEnabled: false,
  cpmMcpEnabled: false,
  investorMcpEnabled: false,
  cpmInvoicesEnabled: false,
  cpmExchangeAgreementsEnabled: false,
  portcoKpisEnabled: false,
};

/** The glob `clearOrganizationCache` deletes by. */
function matchesOrgPattern(key: string, organizationId: string): boolean {
  return key.includes(`org:${organizationId}:`);
}

beforeEach(() => {
  store.clear();
  reads.length = 0;
  readMetadata.length = 0;
  writes.length = 0;
  writeMetadata.length = 0;
});

describe('invoice-validations cache key', () => {
  it('is org-scoped, versioned, and free of any per-user segment', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheInvoiceValidations([[1, {}]], userMetadata);

    expect(writes).toEqual(['org:org-1:invoices:validations:v1:cur:USD']);
    expect(writes[0]).not.toContain('user:');
    // `clearOrganizationCache` deletes by `*org:<id>:*`, so the key must keep
    // an `org:<id>:` segment.
    expect(matchesOrgPattern(writes[0], 'org-1')).toBe(true);
  });

  it('never hands userMetadata to Redis, so getUserKey cannot prefix the key', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheInvoiceValidations([[1, {}]], userMetadata);
    await cacheService.getInvoiceValidationsCache();

    expect(writeMetadata).toEqual([undefined]);
    expect(readMetadata).toEqual([undefined]);
  });

  it('keeps the active and archived sets in separate cache entries', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheInvoiceValidations(
      [[1, { amountDifference: 10 }]],
      userMetadata,
      900,
      'active',
    );
    await cacheService.cacheInvoiceValidations(
      [[2, { amountDifference: 20 }]],
      userMetadata,
      900,
      'archived',
    );

    expect(await cacheService.getInvoiceValidationsCache('active')).toEqual([
      [1, { amountDifference: 10 }],
    ]);
    expect(await cacheService.getInvoiceValidationsCache('archived')).toEqual([
      [2, { amountDifference: 20 }],
    ]);
    expect(writes).toEqual([
      'org:org-1:invoices:validations:v1:active:cur:USD',
      'org:org-1:invoices:validations:v1:archived:cur:USD',
    ]);
  });

  it('stores the payload gzipped rather than as plain entries', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheInvoiceValidations(
      [[1, { note: 'x'.repeat(200) }]],
      userMetadata,
    );

    const stored = store.get(writes[0]) as {
      gz: string;
      count: number;
      entries?: unknown;
    };
    expect(stored.entries).toBeUndefined();
    expect(typeof stored.gz).toBe('string');
    expect(stored.count).toBe(1);
    expect(stored.gz.length).toBeLessThan(200);
  });

  it('misses cleanly when nothing has been cached yet', async () => {
    const cacheService = await getCacheService();

    expect(await cacheService.getInvoiceValidationsCache()).toBeNull();
  });
});
