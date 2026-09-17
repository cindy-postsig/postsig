import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import type { UsageRestrictionsContract } from '@/lib/v2/chat/types';
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

const USAGE_RESTRICTIONS_FIELDS = [
  'scope_of_use',
  'geo_restrictions',
  'distribution_rights',
];

export function runUsageRestrictionsQuery(
  contracts: ContractsListItem[],
): UsageRestrictionsContract[] {
  const filtered = contracts.filter(
    (c) =>
      c.contract.scope_of_use ||
      c.contract.geo_restrictions ||
      c.contract.distribution_rights,
  );
  const rows: UsageRestrictionsContract[] = filtered.map((c) => ({
    id: c.contract.id,
    vendor: c.contract.vendors?.name,
    scopeOfUse: c.contract.scope_of_use || null,
    geoRestrictions: c.contract.geo_restrictions || null,
    distributionRights: c.contract.distribution_rights || null,
    contractType: toContractType(c.contract.type_id),
  }));
  return rows;
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

type UsageRestrictionsInput = z.infer<typeof INPUT_SCHEMA>;

async function executeUsageRestrictionsQuery(
  input: UsageRestrictionsInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<UsageRestrictionsContract[] | { error: string }> {
  const contractFields = input.sponsorName
    ? Array.from(new Set([...USAGE_RESTRICTIONS_FIELDS, 'business_sponsor']))
    : USAGE_RESTRICTIONS_FIELDS;

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
    return runUsageRestrictionsQuery(filtered);
  } catch (err) {
    logger.error({ err }, 'runUsageRestrictionsQuery failed');
    return { error: 'Failed to run usage restrictions query' };
  }
}

export function createUsageRestrictionsTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns scope of use, geo restrictions, and distribution rights for contracts that have usage restrictions.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => executeUsageRestrictionsQuery(input, user, cache),
  });
}
