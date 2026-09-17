import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { reverseContractTypeMap, contractTypes } from '@/app/lib/constants';
import { extractAnnualValue, truncateText } from '@/lib/v2/chat/transforms';
import {
  SEARCH_RESULT_LIMIT,
  SUMMARY_TRUNCATE_LENGTH,
} from '@/lib/v2/chat/constants';
import type { ContractSearchResult, ToolError } from '@/lib/v2/chat/types';
import {
  filterByVendor,
  filterByTag,
  filterByBusinessGroup,
  filterBySponsor,
  type ContractsListItem,
} from '@/lib/v2/chat/tools/queries/filters';
import { getContractsForQuery } from '@/lib/v2/chat/tools/queries/helpers';
import {
  contractsToChainContracts,
  type ContractRowInput,
} from '@/lib/contracts/productLineageResolution';
import { resolveRemovedProductsAcrossChains } from '@/lib/contracts/resolveRemovedProductsForContracts';

function getProductNames(item: ContractsListItem): string | undefined {
  const names = item.contract.vendor_products_details
    ?.map(
      (p: { vendor_products?: { name?: string } }) => p.vendor_products?.name,
    )
    .filter(Boolean);
  return names && names.length > 0 ? names.join(', ') : undefined;
}

function getCancelledProductNames(
  item: ContractsListItem,
  removedIds: Set<number> | undefined,
): string | undefined {
  if (!removedIds?.size) return undefined;
  const names = item.contract.vendor_products_details
    ?.map(
      (p: {
        product_id?: number | null;
        vendor_products?: { id?: number; name?: string };
      }) => {
        const id = p.vendor_products?.id ?? p.product_id;
        return typeof id === 'number' && removedIds.has(id)
          ? p.vendor_products?.name
          : undefined;
      },
    )
    .filter(Boolean);
  return names && names.length > 0 ? names.join(', ') : undefined;
}

function matchesProductName(item: ContractsListItem, term: string): boolean {
  const products =
    item.contract.vendor_products_details?.map(
      (p: { vendor_products?: { name?: string } }) =>
        p.vendor_products?.name?.toLowerCase(),
    ) || [];
  return products.some((p: string | undefined | null) => p && p.includes(term));
}

function filterSearchContracts(
  contracts: ContractsListItem[],
  contractType?: number,
  productName?: string,
): ContractsListItem[] {
  return contracts.filter((c) => {
    if (contractType && c.contract.type_id !== contractType) return false;
    if (productName && !matchesProductName(c, productName.toLowerCase()))
      return false;
    return true;
  });
}

function toSearchResult(
  c: ContractsListItem,
  removedIds?: Set<number>,
): ContractSearchResult {
  return {
    id: c.contract.id,
    vendorName: c.contract.vendors?.name,
    productName: getProductNames(c),
    cancelledProductNames: getCancelledProductNames(c, removedIds),
    currentSpend: extractAnnualValue(c.priceHistory ?? null) || undefined,
    summary: truncateText(c.contract.summary, SUMMARY_TRUNCATE_LENGTH),
    termStartDate: c.contract.term_start_date?.[0]?.date,
    termEndDate: c.contract.term_end_date?.[0]?.date,
    contractType:
      reverseContractTypeMap[c.contract.type_id as keyof typeof contractTypes],
  };
}

function buildNoResultsSuggestion(productName?: string): string {
  const terms = [productName].filter(Boolean).join(', ');
  if (terms)
    return (
      'No contracts found for "' +
      terms +
      '". Try different spelling or broader search terms.'
    );
  return 'No contracts found. Try different spelling or broader search terms.';
}

export function runSearchQuery(
  contracts: ContractsListItem[],
  contractType?: number,
  productName?: string,
  removedByContract?: Map<number, Set<number>>,
): ContractSearchResult[] | ToolError {
  const filtered = filterSearchContracts(contracts, contractType, productName);

  if (filtered.length === 0) {
    return {
      error: '_NO_RESULTS_',
      noResults: true,
      suggestion: buildNoResultsSuggestion(productName),
    };
  }

  // A search FOR a cancelled product still returns the contract (mention,
  // never omit) — the result carries the cancelled names so the model can
  // report the cancellation instead of asserting an active license.
  return filtered
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((c) => toSearchResult(c, removedByContract?.get(c.contract.id)));
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
  productName: z.string().optional().describe('Filter by product name'),
  contractType: z
    .enum(Object.keys(contractTypes) as [string, ...string[]])
    .transform((val) => contractTypes[val as keyof typeof contractTypes])
    .optional()
    .describe('Contract type abbreviation (e.g., MSA, SO, NDA)'),
});

type SearchInput = z.infer<typeof INPUT_SCHEMA>;

async function execute(
  input: SearchInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<ContractSearchResult[] | ToolError | { error: string }> {
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

  // Resolve cancellations over the FULL fetched set, not the filtered one —
  // a declaring addendum dropped by a tag/sponsor filter must still strike.
  const removedByContract = user
    ? await resolveRemovedProductsAcrossChains({
        organizationId: user.organizationId,
        chainContracts: contractsToChainContracts(
          result.contracts.map(
            (c) => c.contract,
          ) as unknown as ContractRowInput[],
        ),
      })
    : new Map<number, Set<number>>();

  try {
    return runSearchQuery(
      filtered,
      input.contractType,
      input.productName,
      removedByContract,
    );
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runSearchQuery failed',
    );
    return { error: 'Failed to run search query' };
  }
}

export function createSearchContractsTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Finds contracts by vendor name, contract type, or product name. Returns contract cards with ID, vendor, product, spend, summary, and dates. ' +
      'When a card includes cancelledProductNames, those products were cancelled by a later addendum — report them as cancelled, never as actively licensed.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
