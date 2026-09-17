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
const orgClears: unknown[] = [];

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
    clearOrganizationCache: async (metadata: unknown) => {
      orgClears.push(metadata);
      return true;
    },
  }),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: async () => userMetadata,
}));

import { getCacheService } from '@/app/lib/redis/cache-service';
import { SUPPORTED_BASE_CURRENCIES } from '@/lib/base-currency';
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

const V2_KEY = 'contracts:base:v2:org:org-1:user:user-1:role:2:cur:USD';

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
  orgClears.length = 0;
});

describe('contract-set cache key', () => {
  it('is org-scoped, versioned, and free of any per-user segment', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheContractSet([{ id: 1 }], userMetadata);

    expect(writes).toEqual(['org:org-1:contracts:base:v5:cur:USD']);
    expect(writes[0]).not.toContain('user:');
    expect(writes[0]).not.toContain('role:');
    // `clearOrganizationCache` deletes by `*org:<id>:*`, so the key must keep
    // an `org:<id>:` segment.
    expect(matchesOrgPattern(writes[0], 'org-1')).toBe(true);
  });

  it('never hands userMetadata to Redis, so getUserKey cannot prefix the key', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheContractSet([{ id: 1 }], userMetadata);
    await cacheService.getContractSet();

    expect(writeMetadata).toEqual([undefined]);
    expect(readMetadata).toEqual([undefined]);
  });

  it('reads back what it wrote, with and without a supplemental key', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheContractSet([{ id: 1 }], userMetadata);
    await cacheService.cacheContractSet([{ id: 2 }], userMetadata, 900, 'abc');

    expect(await cacheService.getContractSet()).toEqual([{ id: 1 }]);
    expect(await cacheService.getContractSet('abc')).toEqual([{ id: 2 }]);
    expect(reads).toEqual(writes);
  });

  it('stores the payload gzipped rather than as plain rows', async () => {
    const cacheService = await getCacheService();

    await cacheService.cacheContractSet(
      [{ id: 1, name: 'a'.repeat(200) }],
      userMetadata,
    );

    const stored = store.get(writes[0]) as {
      gz: string;
      count: number;
      contracts?: unknown;
    };
    expect(stored.contracts).toBeUndefined();
    expect(typeof stored.gz).toBe('string');
    expect(stored.count).toBe(1);
    expect(stored.gz.length).toBeLessThan(200);
    expect(await cacheService.getContractSet()).toEqual([
      { id: 1, name: 'a'.repeat(200) },
    ]);
  });

  it('ignores a contract set cached under the previous version key', async () => {
    store.set(V2_KEY, {
      contracts: [{ id: 1 }],
      timestamp: new Date().toISOString(),
      userRole: '2',
      count: 1,
    });

    const cacheService = await getCacheService();

    expect(await cacheService.getContractSet()).toBeNull();
  });

  it('leaves every base-currency partition reachable by the org-wide clear', async () => {
    const cacheService = await getCacheService();

    for (const baseCurrency of SUPPORTED_BASE_CURRENCIES) {
      await cacheService.cacheContractSet([{ id: 1 }], {
        ...userMetadata,
        baseCurrency,
      });
    }

    expect(writes).toEqual([
      'org:org-1:contracts:base:v5:cur:USD',
      'org:org-1:contracts:base:v5:cur:EUR',
    ]);
    expect(writes.every((key) => matchesOrgPattern(key, 'org-1'))).toBe(true);

    await cacheService.invalidateContractSetForOrg(userMetadata);

    expect(orgClears).toEqual([userMetadata]);
  });
});
