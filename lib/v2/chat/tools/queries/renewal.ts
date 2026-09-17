import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { extractTCV } from '@/lib/v2/chat/transforms';
import { firstDate } from '@/lib/shared/dateUtils';
import { QUERY_RESULT_LIMIT } from '@/lib/v2/chat/constants';
import { filterUpcomingRenewals } from '@/lib/v2/reports/definitions/renewals';
import type { RenewalsResult } from '@/lib/v2/chat/types';
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

const CONTRACT_FIELDS = ['cancel_date', 'cancel_by_date', 'renewal_type'];

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

type RenewalInput = z.infer<typeof INPUT_SCHEMA>;

export function runRenewalQuery(
  contracts: ContractsListItem[],
  timeframeDays?: number,
): RenewalsResult {
  const filtered = filterUpcomingRenewals(contracts, timeframeDays ?? 90);
  return {
    count: filtered.length,
    totalRenewalExposure: filtered.reduce(
      (sum, c) => sum + extractTCV(c.priceHistory ?? null),
      0,
    ),
    contracts: filtered.slice(0, QUERY_RESULT_LIMIT).map((c) => ({
      id: c.contract.id,
      vendor: c.contract.vendors?.name,
      cancelByDate: firstDate(
        c.contract.cancel_date ?? c.contract.cancel_by_date,
      ),
      termEndDate: c.contract.term_end_date?.[0]?.date ?? null,
      tcv: extractTCV(c.priceHistory ?? null),
      contractType: toContractType(c.contract.type_id),
      renewalType: c.contract.renewal_type,
    })),
  };
}

async function execute(
  input: RenewalInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<RenewalsResult | { error: string }> {
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
    return runRenewalQuery(filtered, input.timeframeDays);
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runRenewalQuery failed',
    );
    return { error: 'Failed to run renewal query' };
  }
}

export function createRenewalTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns contracts with upcoming renewals within the given timeframe, with cancel-by dates and renewal type.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
