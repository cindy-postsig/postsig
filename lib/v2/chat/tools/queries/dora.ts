import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { calculateDoraScore } from '@/app/lib/contracts/dora';
import { getMissingCategories } from '@/lib/v2/reports/transforms/dora';
import type { DoraComplianceContract } from '@/lib/v2/chat/types';
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
import { filterExcludeInvoices } from '@/lib/v2/core/filters';

const DORA_CONTRACT_FIELDS = [
  'end_users',
  'market_data_types',
  'internal_external_users',
  'exclusivity_terms',
  'activities',
  'distribution_rights',
  'geo_restrictions',
  'derivative_works',
  'data_disposal_tnc',
  'audit_requirements',
  'suspension_of_service',
  'cancellation_process',
  'service_level_agreements',
  'cost_mitigation',
  'arbitration_and_conflict_resolution',
  'cancel_by_date',
  'cancel_date',
  'security_awareness',
];

const INPUT_SCHEMA = z.object({
  doraScoreBelow: z
    .number()
    .optional()
    .describe('Maximum DORA score threshold (default: 9)'),
  ictProviderFilter: z
    .enum(['ict', 'other'])
    .optional()
    .describe('Filter by ICT provider status'),
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

type DoraInput = z.infer<typeof INPUT_SCHEMA>;

export function runDoraComplianceQuery(
  contracts: ContractsListItem[],
  doraScoreBelow?: number,
  ictProviderFilter?: 'ict' | 'other',
): DoraComplianceContract[] {
  const threshold = doraScoreBelow ?? 9;
  // Exclude invoices (type_id 6) so the chatbot matches the DORA report, which
  // excludes them via the pipeline runner. ContractsListItem carries nested
  // contract.type_id, a shape filterExcludeInvoices supports.
  const filtered = filterExcludeInvoices(contracts).filter((c) => {
    const isIct = c.contract.vendors?.ict_provider === true;
    if (ictProviderFilter === 'ict') return isIct;
    if (ictProviderFilter === 'other') return !isIct;
    return isIct; // default to ICT only
  });
  const results = filtered
    .map((c) => ({
      contract: c,
      doraScore: calculateDoraScore(
        c.contract as Parameters<typeof calculateDoraScore>[0],
      ),
    }))
    .filter((r) => r.doraScore.score < threshold);
  const filteredResults = results
    .map((r) => ({
      id: r.contract.contract.id,
      vendor: r.contract.contract.vendors?.name,
      doraScore: r.doraScore.score,
      maxScore: 9,
      missingCategories: getMissingCategories(r.doraScore),
      hasICTVendor: r.contract.contract.vendors?.ict_provider === true,
      contractType: toContractType(r.contract.contract.type_id),
    }))
    .sort((a, b) => b.doraScore - a.doraScore);
  return filteredResults;
}

async function executeDoraQuery(
  input: DoraInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<DoraComplianceContract[] | { error: string }> {
  const contractFields = input.sponsorName
    ? Array.from(new Set([...DORA_CONTRACT_FIELDS, 'business_sponsor']))
    : DORA_CONTRACT_FIELDS;

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
    return runDoraComplianceQuery(filtered, input.doraScoreBelow);
  } catch (err) {
    logger.error({ err }, 'runDoraComplianceQuery failed');
    return { error: 'Failed to run DORA compliance query' };
  }
}

export function createDoraTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns ICT vendor contracts with DORA compliance scores below the given threshold, with missing compliance categories.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => executeDoraQuery(input, user, cache),
  });
}
