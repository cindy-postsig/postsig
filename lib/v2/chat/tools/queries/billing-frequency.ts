import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import type { BillingFrequencyContract } from '@/lib/v2/chat/types';
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

const BILLING_FREQUENCY_FIELDS = ['billing_frequency', 'payment_terms'];

export function runBillingFrequencyQuery(
  contracts: ContractsListItem[],
): BillingFrequencyContract[] {
  const rows: BillingFrequencyContract[] = contracts.map((c) => ({
    id: c.contract.id,
    vendor: c.contract.vendors?.name,
    billingFrequency: c.contract.billing_frequency || 'Not specified',
    paymentTerms: c.contract.payment_terms || 'Not specified',
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

type BillingFrequencyInput = z.infer<typeof INPUT_SCHEMA>;

async function executeBillingFrequencyQuery(
  input: BillingFrequencyInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<BillingFrequencyContract[] | { error: string }> {
  const contractFields = input.sponsorName
    ? Array.from(new Set([...BILLING_FREQUENCY_FIELDS, 'business_sponsor']))
    : BILLING_FREQUENCY_FIELDS;

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
    return runBillingFrequencyQuery(filtered);
  } catch (err) {
    logger.error({ err }, 'runBillingFrequencyQuery failed');
    return { error: 'Failed to run billing frequency query' };
  }
}

export function createBillingFrequencyTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description: 'Returns billing frequency and payment terms for contracts.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => executeBillingFrequencyQuery(input, user, cache),
  });
}
