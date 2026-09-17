import 'server-only';

import { fetchConfirmedEventsForContracts } from '@/data/superuser/productLineageEvents';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import {
  resolveRemovedProductEndDatesAcrossChains,
  resolveRemovedProductIds,
  resolveRemovedProductIdsAcrossChains,
  type ChainContractInput,
  type RelationshipEdge,
} from '@/lib/contracts/productLineageResolution';
import { logAlert } from '@/utils/logging/alert';

/**
 * Server-side composition of the PSK-1830 pieces: fetch confirmed cancellation
 * declarations for a set of contracts and resolve what each contract should
 * treat as removed. The single entry point for server components, actions,
 * Inngest jobs and tool handlers — anything that cannot reach
 * HierarchyProvider's client-side resolution.
 *
 * Callers supply their own `ChainContractInput` projection, mirroring what
 * `toChainContracts()` does for the hierarchy shape.
 *
 * Failure posture (shared by every resolver here): any fetch failure degrades
 * to an empty result and pages a monitor, because under-reporting
 * cancellations is invisible to the user reading the output. Degrading fully
 * is both safer and honest — with partial inputs (e.g. missing relationship
 * edges) a declaration could silently strike nothing.
 */

interface ResolveArgs {
  organizationId: string;
  chainContracts: ChainContractInput[];
  relationships?: RelationshipEdge[];
}

/**
 * Shared fetch-and-degrade wrapper: loads relationship edges (unless
 * provided) and confirmed events, hands them to `resolve`, and degrades to
 * `empty` plus a paged alert on any failure. Keeping this in one place means
 * the three public resolvers cannot drift apart in failure behavior.
 */
async function resolveOrDegrade<T>(
  { organizationId, chainContracts, relationships }: ResolveArgs,
  message: string,
  empty: T,
  resolve: (
    events: Awaited<ReturnType<typeof fetchConfirmedEventsForContracts>>,
    edges: RelationshipEdge[],
  ) => T,
): Promise<T> {
  if (chainContracts.length === 0) return empty;

  try {
    const edges =
      relationships ?? (await fetchAllRelationshipsForOrg(organizationId));
    const events = await fetchConfirmedEventsForContracts({
      contractIds: chainContracts.map((c) => c.contractId),
      organizationId,
    });
    return resolve(events, edges);
  } catch (error) {
    logAlert(
      'product-lineage-fetch-failure',
      error,
      { organizationId },
      message,
    );
    return empty;
  }
}

/**
 * Single-chain resolver for callers that already hold one hierarchy (the
 * contract page and its MCP mirror). Relationship edges are not needed:
 * the caller's chain IS the component.
 */
export async function resolveRemovedProductsForContracts({
  organizationId,
  chainContracts,
}: Omit<ResolveArgs, 'relationships'>): Promise<Map<number, Set<number>>> {
  return resolveOrDegrade(
    // An empty edges array is never consulted: the single-chain resolver
    // orders purely by date within the provided chain.
    { organizationId, chainContracts, relationships: [] },
    'Failed to fetch confirmed product lineage events for resolution',
    new Map<number, Set<number>>(),
    (events) => resolveRemovedProductIds(events, chainContracts),
  );
}

/**
 * Org-wide variant for callers whose contracts span many chains (inventory,
 * budget, exports, chat): partitions by `contract_relationships` components
 * so a declaration can never strike outside its own chain. `relationships`
 * may be omitted and is then fetched here, inside the same degrade path.
 */
export async function resolveRemovedProductsAcrossChains(
  args: ResolveArgs,
): Promise<Map<number, Set<number>>> {
  return resolveOrDegrade(
    args,
    'Failed to resolve removed products across chains',
    new Map<number, Set<number>>(),
    (events, edges) =>
      resolveRemovedProductIdsAcrossChains(events, args.chainContracts, edges),
  );
}

/**
 * Budget-facing variant: per struck product, the point cost accrual stops
 * (the declaring contract's effective start date). Feeds
 * `generatePriceHistories`' `cutoffsByContract` parameter. Same partitioning
 * as `resolveRemovedProductsAcrossChains`.
 */
export async function resolveProductFeeCutoffs(
  args: ResolveArgs,
): Promise<Map<number, Map<number, Date>>> {
  return resolveOrDegrade(
    args,
    'Failed to resolve product fee cutoffs',
    new Map<number, Map<number, Date>>(),
    (events, edges) =>
      resolveRemovedProductEndDatesAcrossChains(
        events,
        args.chainContracts,
        edges,
      ),
  );
}
