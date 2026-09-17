import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import type { DataQueryResult, DataContract } from '@/lib/v2/chat/types';
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

type ClauseQueryType =
  | 'derived_data'
  | 'ai_usage'
  | 'liability'
  | 'cancellation_process'
  | 'geo_restrictions'
  | 'scope_of_use'
  | 'distribution_rights';

const CLAUSE_FIELD_MAP: Record<ClauseQueryType, string> = {
  derived_data: 'derivative_works',
  ai_usage: 'ai_training_restrictions',
  liability: 'cost_mitigation',
  cancellation_process: 'cancellation_process',
  geo_restrictions: 'geo_restrictions',
  scope_of_use: 'scope_of_use',
  distribution_rights: 'distribution_rights',
};

const CLAUSE_TITLE_MAP: Record<ClauseQueryType, string> = {
  derived_data: 'Derived Data',
  ai_usage: 'AI Usage',
  liability: 'Liability',
  cancellation_process: 'Cancellation Process',
  geo_restrictions: 'Geo Restrictions',
  scope_of_use: 'Scope of Use',
  distribution_rights: 'Distribution Rights',
};

function isClauseQueryType(q: string): q is ClauseQueryType {
  return (
    q === 'derived_data' ||
    q === 'ai_usage' ||
    q === 'liability' ||
    q === 'cancellation_process' ||
    q === 'geo_restrictions' ||
    q === 'scope_of_use' ||
    q === 'distribution_rights'
  );
}

export function runClauseQuery(
  queryType: ClauseQueryType,
  contracts: ContractsListItem[],
  hasClause?: boolean,
): DataQueryResult {
  const field = CLAUSE_FIELD_MAP[queryType];
  const hasValue = hasClause ?? true;
  const filtered = contracts.filter((c) => {
    const has = !!(c.contract as Record<string, unknown>)[field];
    return hasValue ? has : !has;
  });

  const mappedContracts: DataContract[] = filtered.map((c) => {
    const clause = (c.contract as Record<string, unknown>)[field];
    return {
      id: c.contract.id,
      vendor: c.contract.vendors?.name,
      clauseContent:
        typeof clause === 'string' && clause ? clause : 'Not specified',
      contractType: toContractType(c.contract.type_id),
    };
  });

  const excerpts = mappedContracts
    .filter((c) => c.clauseContent !== 'Not specified')
    .map((c) => ({
      title: CLAUSE_TITLE_MAP[queryType],
      contractId: c.id,
      vendor: c.vendor,
      content: c.clauseContent,
      contractType: c.contractType,
    }));

  return { type: 'data_query', contracts: mappedContracts, excerpts };
}

const INPUT_SCHEMA = z.object({
  clauseType: z.enum([
    'derived_data',
    'ai_usage',
    'liability',
    'cancellation_process',
    'geo_restrictions',
    'scope_of_use',
    'distribution_rights',
  ]),
  hasClause: z
    .boolean()
    .optional()
    .describe(
      'Filter for contracts that have (true) or lack (false) the clause. Defaults to true.',
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

type ClauseInput = z.infer<typeof INPUT_SCHEMA>;

async function executeClauseQuery(
  input: ClauseInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<DataQueryResult | { error: string }> {
  const clauseField = isClauseQueryType(input.clauseType)
    ? CLAUSE_FIELD_MAP[input.clauseType]
    : undefined;

  const baseFields = clauseField ? [clauseField] : [];
  const contractFields = input.sponsorName
    ? Array.from(new Set([...baseFields, 'business_sponsor']))
    : baseFields;

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
    return runClauseQuery(
      input.clauseType as ClauseQueryType,
      filtered,
      input.hasClause,
    );
  } catch (err) {
    logger.error(
      { err, clauseType: input.clauseType },
      'runClauseQuery failed',
    );
    return { error: 'Failed to run clause query' };
  }
}

export function createClauseTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns contracts with or without a specific clause type (derived data, AI usage, liability, cancellation, geo restrictions, scope of use, distribution rights).',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => executeClauseQuery(input, user, cache),
  });
}
