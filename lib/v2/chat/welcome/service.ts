/**
 * Welcome data service for chat
 *
 * Fetches contextual data to display in the chat welcome message.
 * Includes a short-TTL in-memory cache keyed by organizationId, userId, and userRole
 * to prevent cross-user data leaks within the same organization.
 */

import { getDashboardData } from '@/lib/v2/dashboard/service';
import { getContractsList } from '@/lib/v2/contracts/service';
import { getCacheService } from '@/app/lib/redis/cache-service';
import logger from '@/utils/pino';
import type {
  WelcomeData,
  TopVendorData,
  ExpiringContractsData,
  RecentUploadsData,
} from './types';

const RECENT_UPLOADS_DAYS = 30;
const MAX_TOP_VENDORS = 3;
const MAX_SUGGESTED_PROMPTS = 4;
const WELCOME_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REDIS_WELCOME_TTL_SECONDS = 300; // 5 minutes

interface WelcomeCacheEntry {
  data: WelcomeData;
  expiry: number;
}

const welcomeCache = new Map<string, WelcomeCacheEntry>();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of welcomeCache) {
    if (entry.expiry <= now) {
      welcomeCache.delete(key);
    }
  }
}

function buildRedisCacheKey(cacheKey: string): string {
  return `chat:welcome:${cacheKey}`;
}

async function getFromRedis(cacheKey: string): Promise<WelcomeData | null> {
  try {
    const cacheService = await getCacheService();
    const key = buildRedisCacheKey(cacheKey);
    const cached = await cacheService.redisService.get<WelcomeData>(key);
    if (cached) {
      logger.debug({ cacheKey, key }, '[WELCOME_CACHE] Redis hit');
    }
    return cached;
  } catch (error) {
    logger.warn(
      { error, cacheKey },
      '[WELCOME_CACHE] Redis read failed, falling back to DB',
    );
    return null;
  }
}

async function setInRedis(cacheKey: string, data: WelcomeData): Promise<void> {
  try {
    const cacheService = await getCacheService();
    const key = buildRedisCacheKey(cacheKey);
    await cacheService.redisService.set(
      key,
      data,
      undefined,
      REDIS_WELCOME_TTL_SECONDS,
    );
    logger.debug({ cacheKey, key }, '[WELCOME_CACHE] Redis set');
  } catch (error) {
    logger.warn(
      { error, cacheKey },
      '[WELCOME_CACHE] Redis write failed, continuing without cache',
    );
  }
}

/**
 * Generate dynamic suggested prompts based on user's data
 */
function generateSuggestedPrompts(data: {
  expiringContracts: ExpiringContractsData;
  recentUploads: RecentUploadsData;
  topVendors: TopVendorData[];
}): string[] {
  const prompts: string[] = [];

  // Context-aware prompts based on expiring contracts
  if (data.expiringContracts.count > 0) {
    prompts.push('Which contracts auto-renew in the next 90 days?');
    prompts.push("What's my auto-renewal exposure this quarter?");
  }

  // Context-aware prompts based on top vendors
  if (data.topVendors.length > 0) {
    const topVendor = data.topVendors[0].name;
    prompts.push(`What's my total spend with ${topVendor}?`);
  }

  // Context-aware prompts based on recent uploads
  if (data.recentUploads.count > 0) {
    prompts.push('Review my recently uploaded contracts');
  }

  // General prompts (always include some)
  const generalPrompts = [
    'Which contracts are not DORA compliant?',
    'Do any of my contracts contain AI usage clauses?',
    'What contracts expire in the next 90 days?',
    'Which contracts restrict creation of derived data?',
  ];

  // Add general prompts until we reach max
  for (const prompt of generalPrompts) {
    if (prompts.length >= MAX_SUGGESTED_PROMPTS) break;
    if (!prompts.includes(prompt)) {
      prompts.push(prompt);
    }
  }

  return prompts.slice(0, MAX_SUGGESTED_PROMPTS);
}

/**
 * Get welcome data for the chat interface.
 * Fetches expiring contracts, recent uploads, and top vendors.
 *
 * Results are cached for 5 minutes per user+role+organization to avoid
 * redundant DB queries when users open/reopen chat.
 */
export async function getWelcomeData(
  organizationId?: string,
  userId?: string,
  userRole?: number,
): Promise<WelcomeData> {
  const cacheKey =
    organizationId && userId !== undefined && userRole !== undefined
      ? `${organizationId}:${userId}:${userRole}`
      : undefined;

  if (cacheKey) {
    const cached = welcomeCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      logger.debug(
        { organizationId, userId, userRole },
        '[WELCOME_CACHE] memory hit',
      );
      return cached.data;
    }
    logger.debug(
      { organizationId, userId, userRole },
      '[WELCOME_CACHE] memory miss',
    );
  }

  // Check Redis cache (keyed by org:user:role to prevent cross-role data leaks)
  if (cacheKey) {
    const redisData = await getFromRedis(cacheKey);
    if (redisData) {
      // Backfill in-memory cache so subsequent hits within same process are instant
      if (cacheKey) {
        cleanupExpiredEntries();
        welcomeCache.set(cacheKey, {
          data: redisData,
          expiry: Date.now() + WELCOME_CACHE_TTL_MS,
        });
      }
      return redisData;
    }
  }

  // Fetch dashboard data (includes auto-renewals report and top vendors)
  const [dashboardData, contractsResult] = await Promise.all([
    getDashboardData(),
    getContractsList(),
  ]);

  // Extract expiring contracts from auto-renewals report (90-day window)
  const expiringContracts: ExpiringContractsData = {
    count: dashboardData.autoRenewalsReport.contracts.length,
    totalValueUSD: dashboardData.autoRenewalsReport.totalValueInUSD,
  };

  // Filter recent uploads (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - RECENT_UPLOADS_DAYS);

  const recentContracts = contractsResult.contracts.filter((c) => {
    const createdAt = c.contract.created_at;
    if (!createdAt) return false;
    return new Date(createdAt) >= thirtyDaysAgo;
  });

  const recentUploads: RecentUploadsData = {
    count: recentContracts.length,
  };

  // Get top vendors (limit to 3)
  const topVendors: TopVendorData[] = dashboardData.topVendors
    .slice(0, MAX_TOP_VENDORS)
    .map((v) => ({
      name: v.name,
      totalSpend: v.currentBudget,
    }));

  // Generate suggested prompts based on the data
  const suggestedPrompts = generateSuggestedPrompts({
    expiringContracts,
    recentUploads,
    topVendors,
  });

  const data: WelcomeData = {
    expiringContracts,
    recentUploads,
    topVendors,
    suggestedPrompts,
  };

  if (cacheKey) {
    cleanupExpiredEntries();
    welcomeCache.set(cacheKey, {
      data,
      expiry: Date.now() + WELCOME_CACHE_TTL_MS,
    });
  }

  // Store in Redis for cross-process sharing (fire-and-forget; data is already computed)
  if (cacheKey) {
    void setInRedis(cacheKey, data);
  }

  return data;
}
