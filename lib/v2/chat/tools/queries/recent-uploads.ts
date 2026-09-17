import { tool } from 'ai';
import { z } from 'zod';
import { addDays, isAfter, parseISO } from 'date-fns';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { QUERY_RESULT_LIMIT } from '@/lib/v2/chat/constants';
import type {
  RecentUploadsResult,
  RecentUploadContract,
} from '@/lib/v2/chat/types';
import {
  filterByVendor,
  filterByTag,
  filterByBusinessGroup,
  filterBySponsor,
  type ContractsListItem,
} from '@/lib/v2/chat/tools/queries/filters';
import {
  getContractsForQuery,
  toContractType,
} from '@/lib/v2/chat/tools/queries/helpers';

export function runRecentUploadsQuery(
  contracts: ContractsListItem[],
  now: Date,
  timeframeDays?: number,
): RecentUploadsResult {
  const days = timeframeDays ?? 30;
  const cutoffDate = addDays(now, -days);
  const filtered = contracts
    .filter((c) => {
      const createdAt = c.contract.created_at;
      if (!createdAt) return false;
      return isAfter(parseISO(createdAt), cutoffDate);
    })
    .sort(
      (a, b) =>
        (b.contract.created_at
          ? parseISO(b.contract.created_at).getTime()
          : 0) -
        (a.contract.created_at ? parseISO(a.contract.created_at).getTime() : 0),
    );
  const recentContracts: RecentUploadContract[] = filtered
    .slice(0, QUERY_RESULT_LIMIT)
    .map((c) => ({
      id: c.contract.id,
      vendor: c.contract.vendors?.name,
      contractType: toContractType(c.contract.type_id),
      summary: c.contract.summary || undefined,
      createdAt: c.contract.created_at || '',
    }));
  return { count: filtered.length, contracts: recentContracts };
}

const INPUT_SCHEMA = z.object({
  vendorName: z.string().optional().describe('Filter by vendor name'),
  tagName: z.string().optional().describe('Filter by tag name'),
  businessGroupName: z
    .string()
    .optional()
    .describe('Filter by business group name'),
  sponsorName: z
    .string()
    .optional()
    .describe('Filter by business sponsor name'),
  timeframeDays: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Days to look back (default: 30)'),
});

type RecentUploadsInput = z.infer<typeof INPUT_SCHEMA>;

async function execute(
  input: RecentUploadsInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<RecentUploadsResult | { error: string }> {
  const contractFields = input.sponsorName ? ['business_sponsor'] : undefined;

  const result = await getContractsForQuery(user, cache, contractFields);
  if (!result.ok) return { error: result.error };

  const filtered = filterBySponsor(
    filterByBusinessGroup(
      filterByTag(
        filterByVendor(result.contracts, input.vendorName),
        input.tagName,
      ),
      input.businessGroupName,
    ),
    input.sponsorName,
  );

  try {
    return runRecentUploadsQuery(filtered, new Date(), input.timeframeDays);
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runRecentUploadsQuery failed',
    );
    return { error: 'Failed to run recent uploads query' };
  }
}

export function createRecentUploadsTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns recently uploaded contracts within the given timeframe, sorted by newest first.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
