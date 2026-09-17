import { tool } from 'ai';
import { z } from 'zod';
import {
  addDays,
  isAfter,
  isBefore,
  parseISO,
  isWithinInterval,
} from 'date-fns';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { extractTCV } from '@/lib/v2/chat/transforms';
import { QUERY_RESULT_LIMIT } from '@/lib/v2/chat/constants';
import type { ExpiringContractsResult } from '@/lib/v2/chat/types';
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

const CONTRACT_FIELDS = ['term_end_date', 'auto_renewal'];

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
    .describe('Days to look ahead (default: 90)'),
});

type ExpiringInput = z.infer<typeof INPUT_SCHEMA>;

export function runExpiringSoonQuery(
  contracts: ContractsListItem[],
  now: Date,
  timeframeDays?: number,
): ExpiringContractsResult {
  const days = timeframeDays ?? 90;
  const cutoffDate = addDays(now, days);
  const filtered = contracts.filter((c) => {
    const endDate = c.contract.term_end_date?.[0]?.date;
    if (!endDate) return false;
    const end = parseISO(endDate);
    return isWithinInterval(end, { start: now, end: cutoffDate });
  });
  const totalTCV = filtered.reduce(
    (sum, c) => sum + extractTCV(c.priceHistory ?? null),
    0,
  );
  const sorted = [...filtered].sort((a, b) => {
    const dateA = a.contract.term_end_date?.[0]?.date ?? '';
    const dateB = b.contract.term_end_date?.[0]?.date ?? '';
    return dateA.localeCompare(dateB);
  });
  return {
    count: filtered.length,
    totalTCV,
    contracts: sorted.slice(0, QUERY_RESULT_LIMIT).map((c) => ({
      id: c.contract.id,
      vendor: c.contract.vendors?.name,
      termEndDate: c.contract.term_end_date?.[0]?.date,
      autoRenewal: c.contract.auto_renewal,
      tcv: extractTCV(c.priceHistory ?? null),
      contractType: toContractType(c.contract.type_id),
    })),
  };
}

async function execute(
  input: ExpiringInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<ExpiringContractsResult | { error: string }> {
  const contractFields = input.sponsorName
    ? Array.from(new Set([...CONTRACT_FIELDS, 'business_sponsor']))
    : CONTRACT_FIELDS;

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
    return runExpiringSoonQuery(filtered, new Date(), input.timeframeDays);
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runExpiringSoonQuery failed',
    );
    return { error: 'Failed to run expiring contracts query' };
  }
}

export function createExpiringContractsTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns contracts expiring within the given timeframe, sorted by soonest expiration.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
