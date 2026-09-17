import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { extractTCV } from '@/lib/v2/chat/transforms';
import type { VendorStatisticsResult } from '@/lib/v2/chat/types';
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

export function runVendorStatisticsQuery(
  contracts: ContractsListItem[],
): VendorStatisticsResult {
  const vendorIds = contracts
    .map((c) => c.contract.vendor_id)
    .filter((vendorId): vendorId is number => typeof vendorId === 'number');
  return {
    vendorCount: new Set(vendorIds).size,
    totalContractValue: contracts.reduce(
      (sum, c) => sum + extractTCV(c.priceHistory ?? null),
      0,
    ),
    contracts: contracts.map((c) => ({
      id: c.contract.id,
      vendor: c.contract.vendors?.name,
      contractType: toContractType(c.contract.type_id),
      totalContractValue: extractTCV(c.priceHistory ?? null),
    })),
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
});

type VendorStatisticsInput = z.infer<typeof INPUT_SCHEMA>;

async function execute(
  input: VendorStatisticsInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<VendorStatisticsResult | { error: string }> {
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
    return runVendorStatisticsQuery(filtered);
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runVendorStatisticsQuery failed',
    );
    return { error: 'Failed to run vendor statistics query' };
  }
}

export function createVendorStatisticsTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns vendor count and total contract value across the portfolio.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
