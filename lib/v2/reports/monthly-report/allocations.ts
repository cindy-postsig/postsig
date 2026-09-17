import { loadAllocationContext } from '@/lib/v2/cost-allocation/context';
import { resolveAllocations } from '@/lib/v2/cost-allocation/resolver';
import type { ContractRelationship } from '@/lib/inventory/hierarchyUtils';
import type { SpendAllocationInput } from '@/lib/v2/spend';
import { logAlert } from '@/utils/logging/alert';

/**
 * The allocation input behind the report's Spend by Business Group. Resolved
 * outside the engine (psk-1846) so the same map that feeds the engine's
 * allocation dimension feeds the transform; relationships ride along so the
 * loader skips its own fetch.
 *
 * A failed allocation read must not take the whole report down — the
 * overview, price changes, and top vendors never touch allocations — so it
 * degrades to no allocations (every group row Unassigned) behind a paged
 * alert, the same policy resolveProductFeeCutoffs applies.
 */
export async function loadReportAllocations(
  organizationId: string,
  contracts: Array<{ id: number }>,
  relationships: ContractRelationship[],
): Promise<SpendAllocationInput> {
  try {
    const ctx = await loadAllocationContext(
      organizationId,
      undefined,
      relationships,
    );
    return {
      resolved: resolveAllocations(contracts, ctx),
      unitsById: ctx.unitsById,
    };
  } catch (error) {
    logAlert(
      'cost-allocation-context-failure',
      error,
      { organizationId },
      'Monthly report: cost allocations failed to load; Spend by Business Group degrades to Unassigned',
    );
    return { resolved: new Map(), unitsById: new Map() };
  }
}
