import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { SPEND_CONTRACT_FIELDS } from '@/lib/v2/chat/constants';
import type { SpendToolOutput } from '@/lib/v2/chat/types';
import { calculateSpend } from '@/lib/v2/chat/tools/spend';
import {
  filterByVendor,
  filterByTag,
  filterByBusinessGroup,
  filterBySponsor,
  type ContractsListItem,
} from '@/lib/v2/chat/tools/queries/filters';
import { getContractsForQuery } from '@/lib/v2/chat/tools/queries/helpers';

export function runPriceIncreaseQuery(
  contracts: ContractsListItem[],
): SpendToolOutput {
  return calculateSpend(contracts, {});
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
});

type PriceIncreaseInput = z.infer<typeof INPUT_SCHEMA>;

async function execute(
  input: PriceIncreaseInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<SpendToolOutput | { error: string }> {
  const baseFields = [...SPEND_CONTRACT_FIELDS];
  const contractFields = input.sponsorName
    ? Array.from(new Set([...baseFields, 'business_sponsor']))
    : baseFields;

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
    return runPriceIncreaseQuery(filtered);
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runPriceIncreaseQuery failed',
    );
    return { error: 'Failed to run price increase query' };
  }
}

export function createPriceIncreaseTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns contracts with year-over-year budget increases, sorted by highest increase. For contractual escalator clauses, use query_annual_increase instead.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
