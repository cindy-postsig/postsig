import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { QUERY_RESULT_LIMIT } from '@/lib/v2/chat/constants';
import type { AssetClassContract } from '@/lib/v2/chat/types';
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
  getAssetClassNames,
} from '@/lib/v2/chat/tools/queries/helpers';

const INPUT_SCHEMA = z.object({
  assetClassName: z
    .string()
    .optional()
    .describe(
      'Asset class name to filter by (e.g., ESG, Equity, Fixed Income)',
    ),
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

type AssetClassInput = z.infer<typeof INPUT_SCHEMA>;

export function runAssetClassQuery(
  contracts: ContractsListItem[],
  assetClassName?: string,
): AssetClassContract[] {
  const filtered = assetClassName
    ? contracts.filter((c) =>
        getAssetClassNames(c).some((n) =>
          n.toLowerCase().includes(assetClassName.toLowerCase()),
        ),
      )
    : contracts;
  const rows: AssetClassContract[] = filtered
    .slice(0, QUERY_RESULT_LIMIT)
    .map((c) => ({
      id: c.contract.id,
      vendor: c.contract.vendors?.name,
      assetClasses: getAssetClassNames(c),
      marketDataTypes: c.contract.market_data_types,
      contractType: toContractType(c.contract.type_id),
    }));
  return rows;
}

async function executeAssetClassQuery(
  input: AssetClassInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<AssetClassContract[] | { error: string }> {
  const contractFields = input.sponsorName ? ['business_sponsor'] : undefined;

  const contractsOrError = await getContractsForQuery(
    user,
    cache,
    contractFields,
  );
  if (!contractsOrError.ok) return { error: contractsOrError.error };

  const filtered = filterBySponsor(
    filterByBusinessGroup(
      filterByTag(
        filterByVendor(contractsOrError.contracts, input.vendorName),
        input.tagName,
      ),
      input.businessGroupName,
    ),
    input.sponsorName,
  );

  try {
    return runAssetClassQuery(filtered, input.assetClassName);
  } catch (err) {
    logger.error({ err }, 'runAssetClassQuery failed');
    return { error: 'Failed to run asset class query' };
  }
}

export function createAssetClassTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description: 'Returns contracts filtered by asset class name.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => executeAssetClassQuery(input, user, cache),
  });
}
