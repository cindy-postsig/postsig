import { isInvoiceType } from '@/app/lib/constants';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import { getUSDValue, sumValuesInUSD } from '@/lib/v2/core/budget';
import { earliestIsoDate } from '@/lib/v2/spend/resolver/resolveFeeSegments';
import { isValidIsoDate } from './report-window';
import {
  leadAllocationProduct,
  uniqueAllocationProducts,
  type AllocationProductSource,
} from './products';
import { isFullyUnallocated, resolveAllocations } from './resolver';
import type { UnallocatedContractRow } from './rollup-report-rows';
import type { AllocationContext } from './types';

/** The slice of an enriched contract the unallocated list reads. */
export interface UnallocatedContractSource {
  id: number;
  vendor_name?: string | null;
  vendor_domain?: string;
  products?: ReadonlyArray<AllocationProductSource>;
  contract: {
    type_id?: number | null;
    contract_types?: { name: string } | null;
    metadata?: { lineage?: { order_number?: unknown } | null } | null;
    term_start_date?: Array<{ date: string }> | null;
    term_end_date?: unknown;
  };
}

export interface UnallocatedSummary {
  count: number;
  totalValueInUSD: number;
}

/**
 * Contracts with nothing allocated anywhere, the report list and the
 * dashboard tile's shared membership rule. Invoice records are left out:
 * their allocation is the parent's, and the parent is listed on its own
 * account. Inheritance rides resolveAllocations, so a child of an allocated
 * contract never appears.
 */
export function selectUnallocatedContracts<T extends UnallocatedContractSource>(
  contracts: readonly T[],
  ctx: AllocationContext,
): T[] {
  const candidates = contracts.filter(
    (contract) => !isInvoiceType(contract.contract.type_id),
  );
  const resolved = resolveAllocations(candidates, ctx);
  return candidates.filter((contract) =>
    isFullyUnallocated(resolved.get(contract.id)),
  );
}

// A malformed "9999-99-99" would win a plain comparison and displace the real
// latest end, so only valid dates are considered.
function latestTermEnd(dates: unknown): string | null {
  if (!Array.isArray(dates)) return null;
  let latest: string | null = null;
  for (const entry of dates as Array<{ date?: unknown }>) {
    const iso =
      typeof entry?.date === 'string' ? entry.date.slice(0, 10) : null;
    if (!isValidIsoDate(iso)) continue;
    if (latest === null || iso > latest) latest = iso;
  }
  return latest;
}

/** The summary's rows, with each contract's window spend joined on by id. */
export function unallocatedContractRows(
  contracts: readonly UnallocatedContractSource[],
  ctx: AllocationContext,
  amountByContractId: ReadonlyMap<number, number>,
): UnallocatedContractRow[] {
  return selectUnallocatedContracts(contracts, ctx)
    .map((contract) => {
      const amount = amountByContractId.get(contract.id);
      const products = uniqueAllocationProducts(contract.products ?? []);
      const lead = leadAllocationProduct(products);
      return {
        id: contract.id,
        vendor: contract.vendor_name || null,
        vendorDomain: contract.vendor_domain ?? '',
        product: lead?.name ?? '',
        products: products.map(({ id, name }) => ({ id, name })),
        termStart: earliestIsoDate(contract.contract.term_start_date),
        termEnd: latestTermEnd(contract.contract.term_end_date),
        name:
          sanitizeOrderNumber(
            contract.contract.metadata?.lineage?.order_number,
          ) ??
          `${contract.contract.contract_types?.name ?? 'Contract'} · ID ${contract.id}`,
        amount: amount === undefined ? null : Math.round(amount * 100) / 100,
      };
    })
    .sort(
      (a, b) =>
        (a.vendor ?? '').localeCompare(b.vendor ?? '') ||
        a.name.localeCompare(b.name),
    );
}

/**
 * The Needs Attention tile's pair. Valued the way its sibling tiles are —
 * buildReportFromContracts' default `totalContractValue` field, through the
 * same USD reads — so the dashboard states one kind of number.
 */
export function summarizeUnallocated<T extends UnallocatedContractSource>(
  contracts: readonly T[],
  ctx: AllocationContext,
): UnallocatedSummary {
  const unallocated = selectUnallocatedContracts(contracts, ctx);
  return {
    count: unallocated.length,
    totalValueInUSD: sumValuesInUSD(unallocated, (contract) =>
      getUSDValue(contract, 'totalContractValue'),
    ),
  };
}
