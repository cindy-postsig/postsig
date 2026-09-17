import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { extractTCV } from '@/lib/v2/chat/transforms';
import { QUERY_RESULT_LIMIT } from '@/lib/v2/chat/constants';
import type { UnexecutedResult } from '@/lib/v2/chat/types';
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
import { isUnexecutedExcludedType } from '@/app/lib/constants';

const CONTRACT_FIELDS = ['all_parties_signed'];

export function runUnexecutedQuery(
  contracts: ContractsListItem[],
): UnexecutedResult {
  const filtered = contracts.filter(
    (c) =>
      c.contract.all_parties_signed === 'No' &&
      c.contract.vendor_id != null &&
      !isUnexecutedExcludedType(c.contract.type_id),
  );
  return {
    count: filtered.length,
    contracts: filtered.slice(0, QUERY_RESULT_LIMIT).map((c) => ({
      id: c.contract.id,
      vendor: c.contract.vendors?.name,
      contractType: toContractType(c.contract.type_id),
      totalContractValue: extractTCV(c.priceHistory ?? null),
      termEndDate: c.contract.term_end_date?.[0]?.date,
      termStartDate: c.contract.term_start_date?.[0]?.date,
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

type UnexecutedInput = z.infer<typeof INPUT_SCHEMA>;

async function execute(
  input: UnexecutedInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<UnexecutedResult | { error: string }> {
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
    return runUnexecutedQuery(filtered);
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runUnexecutedQuery failed',
    );
    return { error: 'Failed to run unexecuted contracts query' };
  }
}

export function createUnexecutedTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns contracts where not all parties have signed, with a vendor attached. Excludes invoices, terms of service, fee schedules and unclassified documents, which carry no signature to chase.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
