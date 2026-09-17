import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import type { NdaRiskContract } from '@/lib/v2/chat/types';
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
  getNdaInsights,
} from '@/lib/v2/chat/tools/queries/helpers';

const NDA_RISK_CONTRACT_FIELDS = ['other_attributes'];

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

type NdaRiskInput = z.infer<typeof INPUT_SCHEMA>;

export function runNdaRiskQuery(
  contracts: ContractsListItem[],
): NdaRiskContract[] {
  const filtered = contracts.filter((c) => c.contract.type_id === 8);
  const rows: NdaRiskContract[] = filtered
    .map((c) => {
      const ndaInsights = getNdaInsights(c.contract);
      const riskFlags = Object.values(ndaInsights).filter(Boolean).length;
      const riskLevel: 1 | 2 | 3 = riskFlags >= 4 ? 3 : riskFlags >= 1 ? 2 : 1;
      return {
        id: c.contract.id,
        vendor: c.contract.vendors?.name,
        riskLevel,
        riskFlags,
        risks: Object.entries(ndaInsights)
          .filter(([, flagged]) => flagged)
          .map(([risk]) => risk.replace(/_/g, ' ')),
        contractType: toContractType(c.contract.type_id),
      };
    })
    .filter((r) => r.riskLevel >= 2);
  return rows;
}

async function executeNdaRiskQuery(
  input: NdaRiskInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<NdaRiskContract[] | { error: string }> {
  const contractFields = input.sponsorName
    ? Array.from(new Set([...NDA_RISK_CONTRACT_FIELDS, 'business_sponsor']))
    : NDA_RISK_CONTRACT_FIELDS;

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
    return runNdaRiskQuery(filtered);
  } catch (err) {
    logger.error({ err }, 'runNdaRiskQuery failed');
    return { error: 'Failed to run NDA risk query' };
  }
}

export function createNdaRiskTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns NDAs with elevated risk levels based on NDA insight flags.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => executeNdaRiskQuery(input, user, cache),
  });
}
