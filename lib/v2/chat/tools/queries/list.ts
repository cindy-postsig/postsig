import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { contractFieldsAITool } from '@/constants/data';
import type { ListContractsResult } from '@/lib/v2/chat/types';
import {
  filterByVendor,
  filterByTag,
  filterByBusinessGroup,
  filterBySponsor,
  type ContractsListItem,
} from '@/lib/v2/chat/tools/queries/filters';
import { getContractsForQuery } from '@/lib/v2/chat/tools/queries/helpers';

export function runListQuery(
  contracts: ContractsListItem[],
): ListContractsResult {
  return {
    type: 'list_contracts',
    contracts: contracts.map((c) => c.contract as Record<string, unknown>),
  };
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
  contractFields: z
    .array(z.enum(contractFieldsAITool as [string, ...string[]]))
    .optional()
    .describe('Specific contract fields to retrieve'),
});

type ListInput = z.infer<typeof INPUT_SCHEMA>;

async function execute(
  input: ListInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<ListContractsResult | { error: string }> {
  const contractFields = input.sponsorName
    ? Array.from(new Set([...(input.contractFields ?? []), 'business_sponsor']))
    : input.contractFields;

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
    return runListQuery(filtered);
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runListQuery failed',
    );
    return { error: 'Failed to run list query' };
  }
}

export function createListContractsTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns raw contract data with specified fields for analysis.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
