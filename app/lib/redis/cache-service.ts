'use server';

import { gunzipSync, gzipSync } from 'node:zlib';
import { RedisServiceInterface, ContractCache, VendorCache } from './types';
import { getRedisService } from './service';
import { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { getUserMetadata } from '@/data/users';
import { getHash } from '@/app/lib/utils';
import type { FeeScheduleDataset } from '@/lib/exchange-agreement/feeScheduleQueries';

/**
 * Bumped whenever the cached contract shape changes: entries live for an hour,
 * so without a new key a deploy keeps serving rows built by the old select.
 * v2 = the `contract_owners` embed (psk-1975).
 * v3 = one org-wide entry (ACL resolved per request) holding a gzipped payload.
 * v4 = the invoice-side `vendor_products_eafs_fees` embed.
 * v5 = that embed selects `period_months` instead of `eafs_pub_date`.
 */
const CONTRACT_SET_CACHE_VERSION = 'v5';

/**
 * The one contract-set key builder. The set is stored once per org, so the key
 * leads with `org:<id>:` — which `clearOrganizationCache`'s `*org:<id>:*`
 * pattern still reaches. It must never be handed userMetadata on the way to
 * Redis either, or `getUserKey` would prepend a `user:<id>:` copy per user.
 */
function contractSetCacheKey(
  userMetadata: Pick<UserMetadata, 'organizationId' | 'baseCurrency'>,
  supplementalKey: string = '',
): string {
  const supplemental = supplementalKey ? `:${supplementalKey}` : '';
  return `org:${userMetadata.organizationId}:contracts:base:${CONTRACT_SET_CACHE_VERSION}${supplemental}:cur:${userMetadata.baseCurrency}`;
}

type CachedContractRow = { id: number } & Record<string, unknown>;

type ContractSetCacheEntry = {
  gz: string;
  timestamp: string;
  count: number;
};

/** Bumped whenever the cached dataset shape changes. */
const EXCHANGE_FEE_SCHEDULE_CACHE_VERSION = 'v1';

/**
 * Shared, non-org-scoped: exchange fee schedules are the same for every org,
 * so this is one global entry per exchange rather than an org:<id>: entry --
 * userMetadata is never passed through to Redis for it.
 */
function exchangeFeeScheduleCacheKey(exchangeCode: string): string {
  return `exchange-agreements:fee-schedule:${EXCHANGE_FEE_SCHEDULE_CACHE_VERSION}:${exchangeCode}`;
}

type ExchangeFeeScheduleCacheEntry = {
  gz: string;
  timestamp: string;
  versionCount: number;
  lineItemCount: number;
};

/** Bumped whenever the cached shape changes. */
const INVOICE_VALIDATIONS_CACHE_VERSION = 'v1';

/**
 * One entry per invoice-validation set ('active' vs. 'archived', via
 * `supplementalKey`) — same `org:<id>:` prefix as the contract set, so
 * `clearOrganizationCache`'s `*org:<id>:*` pattern reaches it too, and the
 * same never-hand-userMetadata-to-Redis rule so it stays one shared
 * org-wide entry instead of a per-user copy.
 */
function invoiceValidationsCacheKey(
  userMetadata: Pick<UserMetadata, 'organizationId' | 'baseCurrency'>,
  supplementalKey: string = '',
): string {
  const supplemental = supplementalKey ? `:${supplementalKey}` : '';
  return `org:${userMetadata.organizationId}:invoices:validations:${INVOICE_VALIDATIONS_CACHE_VERSION}${supplemental}:cur:${userMetadata.baseCurrency}`;
}

/** [contractId, InvoiceValidation] — typed loosely here so this cache layer
 * stays decoupled from the invoices domain module, same as CachedContractRow. */
type CachedInvoiceValidationEntry = [number, unknown];

type InvoiceValidationsCacheEntry = {
  gz: string;
  timestamp: string;
  count: number;
};

class CacheService {
  private static instance: CacheService;
  private service: RedisServiceInterface;

  private constructor() {
    const redisServiceInstance = getRedisService();
    this.service = {
      get: async <T>(key: string, userMetadata?: UserMetadata) => {
        const service = await redisServiceInstance;
        return service.get<T>(key, userMetadata);
      },
      set: async <T>(
        key: string,
        value: T,
        userMetadata?: UserMetadata,
        ttl?: number,
      ) => {
        const service = await redisServiceInstance;
        return service.set(key, value, userMetadata, ttl);
      },
      del: async (key: string, userMetadata?: UserMetadata) => {
        const service = await redisServiceInstance;
        return service.del(key, userMetadata);
      },
      exists: async (key: string, userMetadata?: UserMetadata) => {
        const service = await redisServiceInstance;
        return service.exists(key, userMetadata);
      },
      mget: async <T>(keys: string[], userMetadata?: UserMetadata) => {
        const service = await redisServiceInstance;
        return service.mget<T>(keys, userMetadata);
      },
      mset: async (
        pairs: Array<{ key: string; value: any }>,
        userMetadata?: UserMetadata,
        ttl?: number,
      ) => {
        const service = await redisServiceInstance;
        return service.mset(pairs, userMetadata, ttl);
      },
      clearUserCache: async (userMetadata: UserMetadata) => {
        const service = await redisServiceInstance;
        return service.clearUserCache(userMetadata);
      },
      clearOrganizationCache: async (userMetadata: UserMetadata) => {
        const service = await redisServiceInstance;
        return service.clearOrganizationCache(userMetadata);
      },
      getHealth: async () => {
        const service = await redisServiceInstance;
        return service.getHealth();
      },
    };
  }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  async cacheContract(
    contract: ContractCache,
    userMetadata: UserMetadata,
    ttl: number = 900, // 15 minutes,
  ): Promise<boolean> {
    const key = `contract:${contract.id}`;
    return await this.service.set(key, contract, userMetadata, ttl);
  }

  async cacheContractSet(
    contracts: any[],
    userMetadata: Pick<UserMetadata, 'organizationId' | 'baseCurrency'>,
    ttl: number = 900, // 15 minutes,
    supplementalKey: string = '',
  ): Promise<boolean> {
    try {
      const key = contractSetCacheKey(userMetadata, supplementalKey);
      const cacheData: ContractSetCacheEntry = {
        gz: gzipSync(Buffer.from(JSON.stringify(contracts))).toString('base64'),
        timestamp: new Date().toISOString(),
        count: contracts.length,
      };

      logger.info(
        {
          key,
          contractCount: contracts.length,
          ttl,
          organizationId: userMetadata.organizationId,
        },
        'Caching contract set',
      );

      return await this.service.set(key, cacheData, undefined, ttl);
    } catch (error) {
      logger.error(error, 'Error caching contract set');
      return false;
    }
  }

  async getContractSet(
    supplementalKey: string = '',
  ): Promise<CachedContractRow[] | null> {
    try {
      const userMetadata = await getUserMetadata();
      if (!userMetadata) {
        logger.warn('No user metadata available for cache retrieval');
        return null;
      }
      const key = contractSetCacheKey(userMetadata, supplementalKey);
      const cacheData = await this.service.get<ContractSetCacheEntry>(key);

      if (!cacheData) {
        logger.debug({ key }, 'Cache miss for contract set');
        return null;
      }

      const contracts = JSON.parse(
        gunzipSync(Buffer.from(cacheData.gz, 'base64')).toString('utf8'),
      ) as CachedContractRow[];

      logger.info(
        {
          key,
          contractCount: cacheData.count,
          cacheAge: Date.now() - new Date(cacheData.timestamp).getTime(),
          organizationId: userMetadata.organizationId,
        },
        'Cache hit for contract set',
      );

      return contracts;
    } catch (error) {
      logger.error(error, 'Error retrieving contract set from cache');
      return null;
    }
  }

  /**
   * Caches the discrepancy computation (Service Order matching, FX
   * crossover lookups) the same way `cacheContractSet` caches contract rows —
   * a separate, self-contained method (not sharing code with it) so the two
   * caches stay independent to read, test, and change.
   */
  async cacheInvoiceValidations(
    entries: CachedInvoiceValidationEntry[],
    userMetadata: Pick<UserMetadata, 'organizationId' | 'baseCurrency'>,
    ttl: number = 3600, // 1 hour — matches the base contract set's real TTL (app/lib/contracts/actions.ts's calls, not that method's own unused 900s default).
    supplementalKey: string = '',
  ): Promise<boolean> {
    try {
      const key = invoiceValidationsCacheKey(userMetadata, supplementalKey);
      const cacheData: InvoiceValidationsCacheEntry = {
        gz: gzipSync(Buffer.from(JSON.stringify(entries))).toString('base64'),
        timestamp: new Date().toISOString(),
        count: entries.length,
      };

      logger.info(
        {
          key,
          invoiceCount: entries.length,
          ttl,
          organizationId: userMetadata.organizationId,
        },
        'Caching invoice validations',
      );

      return await this.service.set(key, cacheData, undefined, ttl);
    } catch (error) {
      logger.error(error, 'Error caching invoice validations');
      return false;
    }
  }

  async getInvoiceValidationsCache(
    supplementalKey: string = '',
  ): Promise<CachedInvoiceValidationEntry[] | null> {
    try {
      const userMetadata = await getUserMetadata();
      if (!userMetadata) {
        logger.warn('No user metadata available for cache retrieval');
        return null;
      }
      const key = invoiceValidationsCacheKey(userMetadata, supplementalKey);
      const cacheData =
        await this.service.get<InvoiceValidationsCacheEntry>(key);

      if (!cacheData) {
        logger.debug({ key }, 'Cache miss for invoice validations');
        return null;
      }

      const entries = JSON.parse(
        gunzipSync(Buffer.from(cacheData.gz, 'base64')).toString('utf8'),
      ) as CachedInvoiceValidationEntry[];

      logger.info(
        {
          key,
          invoiceCount: cacheData.count,
          cacheAge: Date.now() - new Date(cacheData.timestamp).getTime(),
          organizationId: userMetadata.organizationId,
        },
        'Cache hit for invoice validations',
      );

      return entries;
    } catch (error) {
      logger.error(error, 'Error retrieving invoice validations from cache');
      return null;
    }
  }

  async getContract(contractId: number): Promise<ContractCache | null> {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      logger.warn('No user metadata available for cache retrieval');
      return null;
    }
    const key = `contract:${contractId}`;
    return await this.service.get<ContractCache>(key, userMetadata);
  }

  async cacheVendor(
    vendor: VendorCache,
    userMetadata: UserMetadata,
    ttl: number = 7200,
  ): Promise<boolean> {
    const key = `vendor:${vendor.id}`;
    return await this.service.set(key, vendor, userMetadata, ttl);
  }

  async getVendor(vendorId: number): Promise<VendorCache | null> {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      logger.warn('No user metadata available for cache retrieval');
      return null;
    }
    const key = `vendor:${vendorId}`;
    return await this.service.get<VendorCache>(key, userMetadata);
  }

  async getVendorList(): Promise<VendorCache[] | null> {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      logger.warn('No user metadata available for cache retrieval');
      return null;
    }
    const key = `vendor:list:${userMetadata.organizationId}:${userMetadata.userId}`;
    return await this.service.get<VendorCache[]>(key, userMetadata);
  }

  async cacheVendorList(
    vendorList: VendorCache[],
    ttl: number = 900, // 15 minutes,
  ): Promise<boolean> {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      logger.warn('No user metadata available for caching');
      return false;
    }
    const key = `vendor:list:${userMetadata.organizationId}:${userMetadata.userId}`;
    return await this.service.set(key, vendorList, userMetadata, ttl);
  }

  async cacheSearchResults(
    query: string,
    results: any[],
    userMetadata: UserMetadata,
    ttl: number = 1800,
  ): Promise<boolean> {
    const key = `search:${Buffer.from(query).toString('base64')}`;
    const searchData = {
      query,
      results,
      userId: userMetadata.userId,
      timestamp: new Date().toISOString(),
    };
    return await this.service.set(key, searchData, userMetadata, ttl);
  }

  async getSearchResults(
    query: string,
    userMetadata: UserMetadata,
  ): Promise<any[] | null> {
    const key = `search:${Buffer.from(query).toString('base64')}`;
    const searchData = await this.service.get<any>(key, userMetadata);
    return searchData?.results || null;
  }

  async cacheUserSession(
    sessionData: any,
    userMetadata: UserMetadata,
    ttl: number = 86400,
  ): Promise<boolean> {
    const key = `session:${userMetadata.userId}`;
    return await this.service.set(key, sessionData, userMetadata, ttl);
  }

  async getUserSession(userMetadata: UserMetadata): Promise<any | null> {
    const key = `session:${userMetadata.userId}`;
    return await this.service.get(key, userMetadata);
  }

  async invalidateContract(
    contractId: number,
    userMetadata: Pick<UserMetadata, 'organizationId' | 'userId'>,
  ): Promise<boolean> {
    const key = `contract:${contractId}`;
    return await this.service.del(key, userMetadata);
  }

  async invalidateVendor(
    vendorId: number,
    userMetadata: Pick<UserMetadata, 'organizationId' | 'userId'>,
  ): Promise<boolean> {
    const key = `vendor:${vendorId}`;
    return await this.service.del(key, userMetadata);
  }

  async invalidateUserData(userMetadata: UserMetadata): Promise<boolean> {
    return await this.service.clearUserCache(userMetadata);
  }

  async invalidateOrganizationData(
    userMetadata: Pick<UserMetadata, 'organizationId'>,
  ): Promise<boolean> {
    return await this.service.clearOrganizationCache(userMetadata);
  }

  async invalidateContractSetForOrg(
    userMetadata: Pick<UserMetadata, 'organizationId'>,
  ): Promise<boolean> {
    try {
      logger.info(
        {
          organizationId: userMetadata.organizationId,
        },
        'Invalidating all contract caches for organization',
      );

      // Clear all caches for this organization (contracts, vendors, etc.)
      return await this.service.clearOrganizationCache(userMetadata);
    } catch (error) {
      logger.error(error, 'Error invalidating organization contract cache');
      return false;
    }
  }

  async cacheExchangeFeeScheduleDataset(
    exchangeCode: string,
    dataset: FeeScheduleDataset,
    ttl: number = 1800, // 30 minutes -- must stay under the signed source-doc URL TTL (see SOURCE_DOC_URL_TTL_SECONDS in lib/exchange-agreement/feeSchedules.ts), or a cache hit could serve an expired link.
  ): Promise<boolean> {
    try {
      const key = exchangeFeeScheduleCacheKey(exchangeCode);
      const cacheData: ExchangeFeeScheduleCacheEntry = {
        gz: gzipSync(Buffer.from(JSON.stringify(dataset))).toString('base64'),
        timestamp: new Date().toISOString(),
        versionCount: dataset.versions.length,
        lineItemCount: dataset.lineItems.length,
      };

      logger.info(
        {
          key,
          exchangeCode,
          lineItemCount: cacheData.lineItemCount,
          ttl,
        },
        'Caching exchange fee schedule dataset',
      );

      return await this.service.set(key, cacheData, undefined, ttl);
    } catch (error) {
      logger.error(error, 'Error caching exchange fee schedule dataset');
      return false;
    }
  }

  async getExchangeFeeScheduleDataset(
    exchangeCode: string,
  ): Promise<FeeScheduleDataset | null> {
    try {
      const key = exchangeFeeScheduleCacheKey(exchangeCode);
      const cacheData =
        await this.service.get<ExchangeFeeScheduleCacheEntry>(key);
      if (!cacheData) {
        logger.debug({ key }, 'Cache miss for exchange fee schedule dataset');
        return null;
      }

      const dataset = JSON.parse(
        gunzipSync(Buffer.from(cacheData.gz, 'base64')).toString('utf8'),
      ) as FeeScheduleDataset;

      logger.info(
        {
          key,
          lineItemCount: cacheData.lineItemCount,
          cacheAge: Date.now() - new Date(cacheData.timestamp).getTime(),
        },
        'Cache hit for exchange fee schedule dataset',
      );

      return dataset;
    } catch (error) {
      logger.error(
        error,
        'Error retrieving exchange fee schedule dataset from cache',
      );
      return null;
    }
  }

  async invalidateExchangeFeeScheduleDataset(
    exchangeCode: string,
  ): Promise<boolean> {
    return await this.service.del(exchangeFeeScheduleCacheKey(exchangeCode));
  }

  async invalidateVendorList(
    userMetadata: Pick<UserMetadata, 'organizationId' | 'userId'>,
  ): Promise<boolean> {
    const organizationId = userMetadata.organizationId;
    const userId = userMetadata.userId;
    const key = `vendor:list:${organizationId}:${userId}`;
    return await this.service.del(key, userMetadata);
  }

  async warmupUserCache(
    userMetadata: UserMetadata,
    contracts: ContractCache[],
    vendors: VendorCache[],
  ): Promise<boolean> {
    try {
      const contractPairs = contracts.map((contract) => ({
        key: `contract:${contract.id}`,
        value: contract,
      }));

      const vendorPairs = vendors.map((vendor) => ({
        key: `vendor:${vendor.id}`,
        value: vendor,
      }));

      const allPairs = [...contractPairs, ...vendorPairs];

      return await this.service.mset(allPairs, userMetadata, 3600);
    } catch (error) {
      logger.error({ error }, 'Error warming up user cache');
      return false;
    }
  }

  async getHealth(): Promise<{
    connected: boolean;
    client: string;
    [key: string]: any;
  }> {
    const health = await this.service.getHealth();
    return {
      ...health,
      client: 'ioredis',
    };
  }

  async cacheCompanyLogo(
    name: string,
    domain: string,
    logoData: import('@/app/lib/logos/fetch-logo').LogoResult | null,
    ttl: number = 30 * 24 * 60 * 60, // 30 days default
  ): Promise<boolean> {
    const normName = (name || '').trim().toLowerCase();
    const normDomain = (domain || '').trim().toLowerCase();
    // Prefer domain-based key to maximize cache hits across name variants
    const cacheKey = normDomain
      ? `logo:vendor:domain:${normDomain}`
      : `logo:vendor:name:${normName}`;
    const value = logoData || { __notFound: true };
    return await this.service.set(cacheKey, value, undefined, ttl);
  }

  async getCompanyLogo(
    name: string,
    domain: string,
  ): Promise<import('@/app/lib/logos/fetch-logo').LogoResult | null> {
    const normName = (name || '').trim().toLowerCase();
    const normDomain = (domain || '').trim().toLowerCase();
    // Prefer domain-based key to maximize cache hits across name variants
    const cacheKey = normDomain
      ? `logo:vendor:domain:${normDomain}`
      : `logo:vendor:name:${normName}`;
    const cached = await this.service.get<any>(cacheKey);

    if (cached === null) {
      return null;
    }

    // Return null if marked as not found
    if (cached.__notFound) {
      return { url: null };
    }

    return cached;
  }

  async cacheCompanyProfile(
    domain: string,
    profileData:
      | import('@/app/lib/vendors/fetch-profile').VendorProfile
      | { __notFound: true }
      | null,
    ttl: number = 30 * 24 * 60 * 60, // 30 days default
  ): Promise<boolean> {
    const cacheKey = `profile:vendor:${domain.trim().toLowerCase()}`;
    const value = profileData || { __notFound: true };
    return await this.service.set(cacheKey, value, undefined, ttl);
  }

  async getCompanyProfile(
    domain: string,
  ): Promise<
    | import('@/app/lib/vendors/fetch-profile').VendorProfile
    | { __notFound: true }
    | null
  > {
    const cacheKey = `profile:vendor:${domain.trim().toLowerCase()}`;
    const cached = await this.service.get<any>(cacheKey);

    if (cached === null) {
      return null; // Cache miss
    }

    // Return the sentinel value if marked as not found (cache hit for not found)
    if (cached.__notFound) {
      return { __notFound: true };
    }

    return cached;
  }

  async cachePrompt(
    fieldName: string,
    template: any,
    ttl: number = 3600,
    moduleId?: number,
  ): Promise<boolean> {
    const cacheKey =
      moduleId !== undefined
        ? `prompt:module:${moduleId}:field:${fieldName}`
        : `prompt:field:${fieldName}`;
    return await this.service.set(cacheKey, template, undefined, ttl);
  }

  async getPrompt(fieldName: string, moduleId?: number): Promise<any | null> {
    const cacheKey =
      moduleId !== undefined
        ? `prompt:module:${moduleId}:field:${fieldName}`
        : `prompt:field:${fieldName}`;
    const cached = await this.service.get<any>(cacheKey);

    if (cached === null) {
      return null;
    }

    return cached;
  }

  async invalidatePrompt(
    fieldName: string,
    moduleId?: number,
  ): Promise<boolean> {
    const cacheKey =
      moduleId !== undefined
        ? `prompt:module:${moduleId}:field:${fieldName}`
        : `prompt:field:${fieldName}`;
    return await this.service.del(cacheKey);
  }

  async invalidateAllPrompts(): Promise<boolean> {
    logger.info('Invalidating all prompt caches');
    return true;
  }

  get redisService(): RedisServiceInterface {
    return this.service;
  }
}

export async function getCacheService(): Promise<CacheService> {
  return CacheService.getInstance();
}
