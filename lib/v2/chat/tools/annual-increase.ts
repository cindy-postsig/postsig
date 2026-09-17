import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { getContractsListForLineageAI } from '@/lib/v2/contracts/service';
import { reverseContractTypeMap, contractTypes } from '@/app/lib/constants';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import type { AnnualIncreaseResult } from '@/lib/v2/chat/types';
import { computeContractBudgetValues } from '@/lib/v2/core/budget';
import { filterToBudgetContracts } from '@/lib/v2/core/filters';
import { extractBudgetFromPriceHistory } from '@/app/lib/budget';
import {
  filterByVendor,
  filterByTag,
  filterByBusinessGroup,
  filterBySponsor,
} from '@/lib/v2/chat/tools/queries/filters';

type ContractsListItem = Awaited<
  ReturnType<typeof getContractsListForLineageAI>
>['contracts'][number];

const INPUT_SCHEMA = z.object({
  vendorName: z
    .string()
    .optional()
    .describe('Filter by vendor name (substring match, case-insensitive)'),
  tagName: z
    .string()
    .optional()
    .describe('Filter contracts by tag name (exact match, case-insensitive)'),
  businessGroupName: z
    .string()
    .optional()
    .describe(
      'Filter contracts by business group name (substring match, case-insensitive)',
    ),
  sponsorName: z
    .string()
    .optional()
    .describe(
      'Filter contracts by business sponsor name (substring match, case-insensitive)',
    ),
});

type AnnualIncreaseInput = z.infer<typeof INPUT_SCHEMA>;

function toContractType(typeId: unknown): string | undefined {
  if (typeId === undefined || typeId === null) return undefined;
  return reverseContractTypeMap[typeId as keyof typeof contractTypes];
}

export function runAnnualIncreaseQuery(
  contracts: ContractsListItem[],
): AnnualIncreaseResult {
  const budgetContracts = filterToBudgetContracts(contracts);
  const mapped = budgetContracts.map((c) => {
    const { currentUSD, projectedUSD } = computeContractBudgetValues(c);
    const annualDifference = c.priceHistory
      ? (extractBudgetFromPriceHistory(c.priceHistory).annualDifference ?? 0)
      : 0;
    return {
      id: c.contract.id,
      vendor: c.contract.vendors?.name,
      contractType: toContractType(c.contract.type_id),
      annualIncrease: c.contract.annual_increase ?? null,
      currentBudgetUSD: currentUSD,
      projectedBudgetUSD: projectedUSD,
      annualDifference,
    };
  });
  const sorted = mapped.sort((a, b) => b.annualDifference - a.annualDifference);
  return { type: 'annual_increase', contracts: sorted };
}

async function executeAnnualIncrease(
  input: AnnualIncreaseInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<AnnualIncreaseResult | { error: string }> {
  if (!user) return { error: 'User context not available' };

  try {
    const annualIncreaseFields = [
      'annual_increase',
      'renewal_type',
      'term_end_date',
      'term_start_date',
      'multi_year',
    ];
    const contractFields = input.sponsorName
      ? ['business_sponsor', ...annualIncreaseFields]
      : annualIncreaseFields;

    const cacheKey = ChatToolCache.buildKey('getContractsListForLineageAI', {
      contractFields: contractFields ? [...contractFields].sort() : undefined,
    });
    const { contracts } = await cache.getOrFetch(cacheKey, () =>
      getContractsListForLineageAI({ contractFields }),
    );

    const filtered = filterBySponsor(
      filterByBusinessGroup(
        filterByTag(filterByVendor(contracts, input.vendorName), input.tagName),
        input.businessGroupName,
      ),
      input.sponsorName,
    );

    return runAnnualIncreaseQuery(filtered);
  } catch (err) {
    logger.error({ err }, 'Failed to execute query_annual_increase tool');
    return { error: 'Failed to retrieve annual increase data' };
  }
}

const TOOL_DESCRIPTION = `Query contracts for annual increase / escalator clause data.
Use this tool when the user asks about "annual increase", "escalator", "uplift clause", or contractual escalation rates.
Returns contracts with their annual increase percentage, current budget, projected budget, and annual difference sorted by highest impact.
Supports filtering by vendorName, tagName, businessGroupName, and sponsorName.`;

export function createAnnualIncreaseTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description: TOOL_DESCRIPTION,
    inputSchema: INPUT_SCHEMA,
    execute: (input) => executeAnnualIncrease(input, user, cache),
  });
}
