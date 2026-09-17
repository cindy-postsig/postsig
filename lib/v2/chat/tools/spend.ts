/**
 * Chat Tools - Spend Calculation Tool
 *
 * Tool for calculating spend totals for vendors or contracts.
 * Uses the same budget functions as the budget overview page for consistency.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { getContractsListForLineageAI } from '@/lib/v2/contracts/service';
import { reverseContractTypeMap, contractTypes } from '@/app/lib/constants';
import type {
  SpendToolOutput,
  ContractSpendDetail,
  MonthlySpendReport,
} from '@/lib/v2/chat/types';
import {
  roundToTwoDecimals,
  buildSingleContractSpendSummary,
  buildVendorSpendSummary,
} from '@/lib/v2/chat/transforms';
import {
  filterToBudgetContracts,
  filterForAggregation,
} from '@/lib/v2/core/filters';
import {
  computeContractBudgetValues,
  getEffectiveTCV,
  sumValuesInUSD,
  getUSDValue,
} from '@/lib/v2/core/budget';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import { buildCalculateSpendToolDescription } from '@/lib/v2/chat/guidance/spend-guidance';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { SPEND_CONTRACT_FIELDS } from '@/lib/v2/chat/constants';
import {
  extractAmortizedData,
  extractActualCostData,
} from '@/app/lib/budget/priceHistoryChartUtils';
import { getFiscalYearInfo } from '@/app/lib/budget/dateUtils';

// ============================================================================
// Types
// ============================================================================

interface ContractTag {
  id: number;
  tag_id: number;
  user_tags?: { id: number; name?: string } | null;
}

type SpendView = 'normal' | 'amortized' | 'actual';

interface SpendFilterInput {
  vendorName?: string;
  vendorId?: number;
  contractId?: number;
  tagName?: string;
  spendView?: SpendView;
}

type FilterResult =
  | { contracts: ContractWithPricing[]; error?: never }
  | { contracts?: never; error: SpendToolOutput };

// ============================================================================
// Helpers
// ============================================================================

function getExclusionReason(
  c: ContractWithPricing,
): ContractSpendDetail['exclusionReason'] {
  if (c.isLinkedChildInvoice) return 'linked_child_invoice';
  const allSuperseded =
    c.isFullySuperseded ||
    (c.products.length > 0 && c.products.every((p) => p.isSuperseded));
  if (allSuperseded) return 'fully_superseded';
  return undefined;
}

function buildContractSpendDetail(c: ContractWithPricing): ContractSpendDetail {
  const exclusionReason = getExclusionReason(c);
  const budget = computeContractBudgetValues(c);
  return {
    contractId: c.contract.id,
    vendorName: c.contract.vendors?.name,
    contractType:
      reverseContractTypeMap[c.contract.type_id as keyof typeof contractTypes],
    currency: c.contract.currency || 'USD',
    totalContractValueUSD: roundToTwoDecimals(budget.tcvUSD),
    currentBudgetUSD: roundToTwoDecimals(budget.currentUSD),
    projectedBudgetUSD: roundToTwoDecimals(budget.projectedUSD),
    termStartDate: c.contract.term_start_date?.[0]?.date,
    termEndDate: c.contract.term_end_date?.[0]?.date,
    products: c.contract.products,
    ...(exclusionReason && {
      isExcludedFromTotals: true,
      exclusionReason,
    }),
  };
}

function buildNoResultsError(
  searchedBy: 'contractId' | 'vendorId' | 'tag' | 'vendor',
  searchTerm: string,
  suggestion: string,
): FilterResult {
  return {
    error: {
      error: '_NO_RESULTS_',
      noResults: true,
      searchedBy,
      searchTerm,
      suggestion,
    },
  };
}

function matchByTag(c: ContractWithPricing, searchTag: string): boolean {
  const tags = c.contract.contract_tags as ContractTag[] | undefined;
  return (
    tags?.some((t) => t.user_tags?.name?.toLowerCase() === searchTag) ?? false
  );
}

function filterByCriteria(
  contracts: ContractWithPricing[],
  { contractId, vendorId, tagName, vendorName }: SpendFilterInput,
): FilterResult {
  if (contractId) {
    const m = contracts.filter((c) => c.contract.id === contractId);
    return m.length > 0
      ? { contracts: m }
      : buildNoResultsError(
          'contractId',
          String(contractId),
          'Try query_contracts(queryType="search") to find valid contract IDs',
        );
  }
  if (vendorId) {
    const m = contracts.filter((c) => c.vendor_id === vendorId);
    return m.length > 0
      ? { contracts: m }
      : buildNoResultsError(
          'vendorId',
          String(vendorId),
          'Try searching by vendorName instead',
        );
  }
  if (tagName) {
    const m = contracts.filter((c) => matchByTag(c, tagName.toLowerCase()));
    return m.length > 0
      ? { contracts: m }
      : buildNoResultsError(
          'tag',
          tagName,
          'Try query_tags(queryType="list_all") to see available tags, or search by vendor name instead',
        );
  }
  if (vendorName) {
    const s = vendorName.toLowerCase();
    const m = contracts.filter((c) =>
      c.contract.vendors?.name?.toLowerCase().includes(s),
    );
    return m.length > 0
      ? { contracts: m }
      : buildNoResultsError(
          'vendor',
          vendorName,
          'Try searching by tagName instead if this might be a tag, or try partial/alternative spelling',
        );
  }
  return { contracts };
}

function resolveDisplayName(
  input: SpendFilterInput,
  filtered: ContractWithPricing[],
): string {
  if (input.tagName) return `Tag: ${input.tagName}`;
  if (input.vendorName) return input.vendorName;
  if (input.vendorId || input.contractId) {
    return filtered[0]?.contract.vendors?.name || 'Unknown';
  }
  return 'All Contracts';
}

// Re-export for consumers that previously imported from this file
export { SPEND_CONTRACT_FIELDS } from '@/lib/v2/chat/constants';

async function fetchContracts(
  cache: ChatToolCache,
): Promise<ContractWithPricing[] | null> {
  try {
    const cacheKey = ChatToolCache.buildKey('getContractsListForLineageAI', {
      contractFields: SPEND_CONTRACT_FIELDS,
    });
    const result = await cache.getOrFetch(cacheKey, () =>
      getContractsListForLineageAI({
        contractFields: [...SPEND_CONTRACT_FIELDS],
      }),
    );
    return result.contracts;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch contracts for calculate_spend tool');
    return null;
  }
}

// ============================================================================
// Result Builders
// ============================================================================

function buildSingleResult(filtered: ContractWithPricing[]): SpendToolOutput {
  const detail = buildContractSpendDetail(filtered[0]);
  return {
    type: 'single_contract',
    contract: detail,
    summary: buildSingleContractSpendSummary(detail),
  };
}

function buildVendorTotalResult(
  filtered: ContractWithPricing[],
  input: SpendFilterInput,
  allContracts: ContractWithPricing[],
): SpendToolOutput {
  const contractDetails = filtered.map(buildContractSpendDetail);
  const totalContractValue = sumValuesInUSD(filtered, (c) =>
    getEffectiveTCV(c),
  );
  const currentBudget = sumValuesInUSD(filtered, (c) =>
    getUSDValue(c, 'currentBudget'),
  );
  const projectedBudget = sumValuesInUSD(filtered, (c) =>
    getUSDValue(c, 'projectedBudget'),
  );
  const displayName = resolveDisplayName(input, filtered);

  return {
    type: 'vendor_total',
    vendorName: displayName,
    contractCount: allContracts.length,
    totals: {
      totalContractValueUSD: roundToTwoDecimals(totalContractValue),
      currentBudgetUSD: roundToTwoDecimals(currentBudget),
      projectedBudgetUSD: roundToTwoDecimals(projectedBudget),
    },
    contracts: contractDetails,
    summary: buildVendorSpendSummary(
      displayName,
      filtered.length,
      totalContractValue,
      currentBudget,
      projectedBudget,
    ),
  };
}

export function calculateSpend(
  allContracts: ContractWithPricing[],
  input: SpendFilterInput,
): SpendToolOutput {
  if (!allContracts) return { error: 'Failed to retrieve contracts' };
  if (allContracts.length === 0)
    return { error: 'No contracts found in your organization' };
  // Count all active contracts (status_id 4, not inactive, not failed)
  const activeContracts = allContracts.filter((ec) => {
    const contract = ec.contract;
    if (contract.status_id !== 4) return false;
    if (contract.status === 'inactive') return false;
    if (['ai_failed', 'h_failed'].includes(contract.ai_extraction_status))
      return false;
    return true;
  });

  // Apply budget filters (same as budget page) to exclude no-vendor,
  // zero-fee, linked child invoices, and non-published contracts
  const budgetContracts = filterToBudgetContracts(activeContracts);
  const filterResult = filterByCriteria(budgetContracts, input);
  if (filterResult.error) return filterResult.error;

  const filtered = filterResult.contracts;
  if (input.contractId && filtered.length === 1) {
    return buildSingleResult(filtered);
  }
  return buildVendorTotalResult(filtered, input, allContracts);
}

// ============================================================================
// Execute Handler
// ============================================================================

async function executeSpend(
  user: UserMetadata | null,
  cache: ChatToolCache,
  input: SpendFilterInput,
): Promise<SpendToolOutput> {
  if (!user) {
    logger.warn('No user context available for calculate_spend tool.');
    return { error: 'User context not available' };
  }

  const allContracts = await fetchContracts(cache);
  if (!allContracts) return { error: 'Failed to retrieve contracts' };
  const spendReport = calculateSpend(allContracts, input);
  if ('error' in spendReport) return spendReport;

  if (input.spendView === 'amortized' || input.spendView === 'actual') {
    const matchedIds = new Set(
      spendReport.type === 'single_contract'
        ? [spendReport.contract.contractId]
        : spendReport.contracts.map((c) => c.contractId),
    );
    const fiscalYearInfo = getFiscalYearInfo(user.organizationFY);
    const matchedContracts = filterForAggregation(
      allContracts.filter((c) => matchedIds.has(c.contract.id)),
    );
    const priceHistories = matchedContracts
      .map((c) => c.priceHistory)
      .filter((ph) => {
        const value = ph.annualContractValueUSD || ph.annualContractValue;
        return value > 0;
      });

    const extractFn =
      input.spendView === 'actual'
        ? extractActualCostData
        : extractAmortizedData;
    const chartData = extractFn(priceHistories, 'current', fiscalYearInfo);
    const report: MonthlySpendReport = {
      isMonthly: chartData.isMonthly,
      data: chartData.data.map(({ key, label, value }) => ({
        key,
        label,
        value: roundToTwoDecimals(value),
      })),
    };

    const reportKey =
      input.spendView === 'actual' ? 'actualCostReport' : 'amortizedReport';
    return { ...spendReport, [reportKey]: report };
  }

  return spendReport;
}

// ============================================================================
// Tool Definition
// ============================================================================

const SPEND_INPUT_SCHEMA = z.object({
  vendorName: z
    .string()
    .optional()
    .describe(
      'Vendor name to calculate total spend for (e.g., "MSCI", "Bloomberg")',
    ),
  vendorId: z
    .number()
    .optional()
    .describe('Vendor ID to calculate total spend for'),
  contractId: z
    .number()
    .optional()
    .describe('Specific contract ID to get spend details for'),
  tagName: z
    .string()
    .optional()
    .describe(
      'Tag name to calculate spend for contracts with that tag (e.g., "Critical", "High Priority")',
    ),
  spendView: z
    .enum(['normal', 'amortized', 'actual'])
    .optional()
    .describe(
      'Spend view mode: "normal" (default) for TCV/current/projected breakdown, "amortized" for spend amortized evenly over the contract term, "actual" for actual cost based on billing frequency and billing dates',
    ),
});

/**
 * Create the calculate_spend tool
 */
export function createCalculateSpendTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description: buildCalculateSpendToolDescription(),
    inputSchema: SPEND_INPUT_SCHEMA,
    execute: (input) => executeSpend(user, cache, input),
  });
}
