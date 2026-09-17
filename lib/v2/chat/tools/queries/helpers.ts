import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { getContractsListForLineageAI } from '@/lib/v2/contracts/service';
import { reverseContractTypeMap, contractTypes } from '@/app/lib/constants';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import type { ContractsListItem } from './filters';

export async function getContractsForQuery(
  user: UserMetadata | null,
  cache: ChatToolCache,
  contractFields?: string[],
): Promise<
  { ok: true; contracts: ContractsListItem[] } | { ok: false; error: string }
> {
  if (!user) return { ok: false, error: 'User context not available' };
  try {
    const cacheKey = ChatToolCache.buildKey('getContractsListForLineageAI', {
      contractFields: contractFields ? [...contractFields].sort() : undefined,
    });
    const { contracts } = await cache.getOrFetch(cacheKey, () =>
      getContractsListForLineageAI({ contractFields }),
    );
    return { ok: true, contracts };
  } catch (err) {
    logger.error({ err }, 'Failed to fetch contracts for query tool');
    return { ok: false, error: 'Failed to retrieve contracts' };
  }
}

export function toContractType(typeId: unknown): string | undefined {
  if (typeId === undefined || typeId === null) return undefined;
  return reverseContractTypeMap[typeId as keyof typeof contractTypes];
}

export function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function getNdaInsights(contract: unknown): Record<string, boolean> {
  const c = getRecord(contract);
  const other = c ? getRecord(c.other_attributes) : null;
  const ndaFields = other ? getRecord(other.nda_fields) : null;
  const insights = ndaFields ? ndaFields.nda_insights : null;
  if (!insights || typeof insights !== 'object') return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(insights as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export function getAssetClassNames(item: unknown): string[] {
  const r = getRecord(item);
  const assetClasses = r ? r.assetClasses : null;
  if (!Array.isArray(assetClasses)) return [];
  return assetClasses
    .map((ac) => getRecord(ac)?.name)
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
}
