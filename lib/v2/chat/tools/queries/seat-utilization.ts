import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { calculateProductUsage } from '@/app/lib/budget/productUsage';
import { QUERY_RESULT_LIMIT } from '@/lib/v2/chat/constants';
import type {
  SeatUtilizationResult,
  SeatUtilizationContract,
  SeatUtilizationProduct,
} from '@/lib/v2/chat/types';
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

type ProductUsageEntry = {
  name: string;
  seats: {
    assigned: number;
    licensed: number;
    unusedSeatsValue: number;
  };
};

function buildProductBreakdown(p: ProductUsageEntry): SeatUtilizationProduct {
  const unusedSeats = Math.max(0, p.seats.licensed - p.seats.assigned);
  const utilPct =
    p.seats.licensed > 0
      ? Math.round((p.seats.assigned / p.seats.licensed) * 100)
      : 0;
  return {
    productName: p.name,
    allocatedSeats: p.seats.licensed,
    usedSeats: p.seats.assigned,
    unusedSeats,
    utilizationPercentage: utilPct,
    unusedSeatsValue: p.seats.unusedSeatsValue,
  };
}

function buildSeatContract(
  item: ContractsListItem,
  products: ProductUsageEntry[],
): SeatUtilizationContract {
  const allocated = products.reduce((s, p) => s + p.seats.licensed, 0);
  const used = products.reduce((s, p) => s + p.seats.assigned, 0);
  const unusedValue = products.reduce(
    (s, p) => s + p.seats.unusedSeatsValue,
    0,
  );
  const utilPct = allocated > 0 ? Math.round((used / allocated) * 100) : 0;

  return {
    id: item.contract.id,
    vendor: item.contract.vendors?.name,
    contractType: toContractType(item.contract.type_id),
    productName: products.length === 1 ? products[0].name : undefined,
    allocatedSeats: allocated,
    usedSeats: used,
    unusedSeats: Math.max(0, allocated - used),
    utilizationPercentage: utilPct,
    unusedSeatsValue: unusedValue,
    currency: item.contract.currency ?? null,
    products:
      products.length > 1 ? products.map(buildProductBreakdown) : undefined,
  };
}

function aggregateSeatResult(
  contracts: SeatUtilizationContract[],
): SeatUtilizationResult {
  const limited = contracts.slice(0, QUERY_RESULT_LIMIT);
  const allocated = limited.reduce((s, c) => s + c.allocatedSeats, 0);
  const used = limited.reduce((s, c) => s + c.usedSeats, 0);
  const unusedValue = limited.reduce((s, c) => s + c.unusedSeatsValue, 0);
  const utilPct = allocated > 0 ? Math.round((used / allocated) * 100) : 0;

  return {
    count: limited.length,
    totalAllocatedSeats: allocated,
    totalUsedSeats: used,
    totalUnusedSeats: Math.max(0, allocated - used),
    overallUtilizationPercentage: utilPct,
    totalUnusedSeatsValue: unusedValue,
    contracts: limited,
  };
}

function hasAllocatedSeats(item: ContractsListItem): boolean {
  const seats = item.contract.vendor_products_users || [];
  return (
    seats.reduce(
      (sum: number, s: { number_of_users?: number }) =>
        sum + (s.number_of_users || 0),
      0,
    ) > 0
  );
}

function getProductUsage(item: ContractsListItem) {
  const currentProducts = item.products.map((p) => ({
    vendor_products: { id: p.product_id, name: p.name },
    fees: p.currentFee,
    compoundedFees: p.currentFee,
  }));
  return calculateProductUsage(item.contract, currentProducts, 0);
}

function getSupersededProductIds(item: ContractsListItem): Set<number> {
  const ids = new Set<number>();
  for (const p of item.products) {
    if (p.isSuperseded) ids.add(p.product_id);
  }
  return ids;
}

export function runSeatUtilizationQuery(
  contracts: ContractsListItem[],
  productName?: string,
): SeatUtilizationResult {
  const withSeats = contracts.filter(hasAllocatedSeats);
  const searchName = productName?.toLowerCase();
  const result: SeatUtilizationContract[] = [];

  for (const item of withSeats) {
    const usage = getProductUsage(item);
    const supersededIds = getSupersededProductIds(item);
    const allocated = Object.values(usage.byProduct).filter(
      (p) => p.seats.licensed > 0 && !supersededIds.has(p.id),
    );
    const products = searchName
      ? allocated.filter((p) => p.name.toLowerCase().includes(searchName))
      : allocated;
    if (products.length === 0) continue;
    result.push(buildSeatContract(item, products));
  }

  return aggregateSeatResult(result);
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
});

type SeatUtilizationInput = z.infer<typeof INPUT_SCHEMA>;

async function execute(
  input: SeatUtilizationInput,
  user: UserMetadata | null,
  cache: ChatToolCache,
): Promise<SeatUtilizationResult | { error: string }> {
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

  try {
    return runSeatUtilizationQuery(filtered, input.productName);
  } catch (err) {
    logger.error(
      { err, contractCount: filtered.length },
      'runSeatUtilizationQuery failed',
    );
    return { error: 'Failed to run seat utilization query' };
  }
}

export function createSeatUtilizationTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description:
      'Returns seat allocation and usage data per contract, with per-product breakdown.',
    inputSchema: INPUT_SCHEMA,
    execute: (input) => execute(input, user, cache),
  });
}
