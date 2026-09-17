import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import type { DiscountContract } from '@/lib/v2/chat/types';
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

type DiscountsInput = z.infer<typeof INPUT_SCHEMA>;

export function runDiscountsQuery(
  contracts: ContractsListItem[],
): DiscountContract[] {
  const filtered = contracts.filter((c) => {
    const discount = c.contract.discount;
    return discount !== null && discount !== undefined && discount > 0;
  });
  const rows: DiscountContract[] = filtered.map((c) => ({
    id: c.contract.id,
    vendor: c.contract.vendors?.name,
    discount: c.contract.discount,
    currency: c.contract.currency,
    contractType: toContractType(c.contract.type_id),
  }));
  return rows;
}

async function execute(
  input: DiscountsInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<DiscountContract[] | { error: string }> {
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
    return runDiscountsQuery(filtered);
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runDiscountsQuery failed',
    );
    return { error: 'Failed to run discounts query' };
  }
}

export function createDiscountsTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description: 'Returns contracts that have discount terms.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
