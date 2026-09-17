/**
 * Product Lineage Resolution (PSK-1830)
 *
 * Turns confirmed `vendor_product_lineage_events` into "which products should the
 * lineage view strike, on which contract".
 *
 * An addendum can declare that products licensed by earlier contracts are
 * cancelled — either wholesale (`replace_all_prior`, the Berenberg case where
 * Add 3 replaces the entire product schedule) or one product at a time
 * (`cancel_product`). Nothing is written back to `vendor_products_details`;
 * each document stays a faithful record and the effect is resolved here, at
 * display time.
 *
 * Scope is **chain-wide by date, not ancestor-only**: Add 1 and Add 2 are
 * siblings of Add 3 under the MSA, so walking ancestors would miss them.
 * Every chain contract dated before the declaring contract is in scope.
 *
 * Pure function, no I/O. Callers pass already-fetched confirmed events.
 */

import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';

export interface ProductLineageEventInput {
  contract_id: number;
  product_id: number | null;
  action: string;
  status?: string;
}

export interface ChainContractInput {
  contractId: number;
  /** Raw `contracts.term_start_date` — a jsonb array of `{ date }`, or a string. */
  termStartDate?: unknown;
  /** Product ids licensed by this contract. */
  productIds: number[];
}

const REPLACE_ALL_PRIOR = 'replace_all_prior';
const CANCEL_PRODUCT = 'cancel_product';

/**
 * Ordering date for a chain contract.
 *
 * Mirrors the hierarchy child sort in `buildHierarchy`
 * (data/superuser/contracts.ts): the LAST array element is the original/oldest
 * term date. Deriving it any other way would order the chain differently here
 * than in the sidebar the user is looking at.
 *
 * Returns null when there is no usable date — an undated contract is never
 * struck, because we cannot prove it precedes the declaring contract.
 */
export function getOrderingDate(termStartDate: unknown): Date | null {
  let raw: unknown = null;

  if (Array.isArray(termStartDate)) {
    if (termStartDate.length === 0) return null;
    raw = (termStartDate[termStartDate.length - 1] as { date?: unknown } | null)
      ?.date;
  } else if (typeof termStartDate === 'string') {
    raw = termStartDate;
  }

  if (typeof raw !== 'string' || raw.trim() === '') return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The declaring contract's CURRENT effective start — the newest date in the
 * append-only `term_start_date` history. Distinct from `getOrderingDate`
 * (the original start, used for chain ordering): a cancellation takes effect
 * when the cancelling contract takes effect, so if its start was amended,
 * accrual cutoffs follow the amended date while chain ordering stays pinned
 * to the original to match the sidebar.
 */
export function getEffectiveStartDate(termStartDate: unknown): Date | null {
  if (typeof termStartDate === 'string') return getOrderingDate(termStartDate);
  if (!Array.isArray(termStartDate)) return null;

  const times = termStartDate
    .map((entry) => (entry as { date?: unknown } | null)?.date)
    .filter((d): d is string => typeof d === 'string' && d.trim() !== '')
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));

  return times.length > 0 ? new Date(Math.max(...times)) : null;
}

const addRemoved = (
  removed: Map<number, Set<number>>,
  contractId: number,
  productIds: number[],
) => {
  if (productIds.length === 0) return;
  const existing = removed.get(contractId);
  const target = existing ?? new Set<number>();
  productIds.forEach((id) => target.add(id));
  if (!existing) removed.set(contractId, target);
};

/** Product ids one event strikes on one candidate contract; empty = untouched. */
const struckProductIds = (
  event: ProductLineageEventInput,
  candidate: ChainContractInput,
): number[] => {
  if (event.action === REPLACE_ALL_PRIOR) return candidate.productIds;

  // Key on product_id alone — never `${productId}-${year}`.
  // normalizeProductsList stores 1-indexed *relative* years, so a year
  // component is not comparable across contracts.
  if (event.action === CANCEL_PRODUCT && event.product_id !== null) {
    return candidate.productIds.includes(event.product_id)
      ? [event.product_id]
      : [];
  }

  return [];
};

/** Does `candidate` sit strictly earlier in the chain than the declaring contract? */
const precedes = (
  candidate: ChainContractInput,
  declaringContractId: number,
  candidateDate: Date | null,
  declaringDate: Date,
): boolean => {
  // A declaration never strikes the contract that made it.
  if (candidate.contractId === declaringContractId) return false;
  // Undated candidates are never struck — we cannot prove they precede.
  if (!candidateDate) return false;
  // Strictly earlier: same-dated and later contracts survive.
  return candidateDate.getTime() < declaringDate.getTime();
};

/** Shape of one row in a hierarchy contract's productsByYear buckets. */
type ProductRow = {
  vendor_products?: { id?: unknown } | null;
  product_id?: unknown;
} | null;

/**
 * A product's id may sit on the joined `vendor_products` row or on the detail
 * row itself — the same fallback `createProductComparison` uses.
 */
const productRowId = (row: ProductRow): unknown =>
  row?.vendor_products?.id ?? row?.product_id;

/**
 * Non-numeric ids are dropped rather than coerced. That is safe because both
 * `vendor_products.id` and `vendor_product_lineage_events.product_id` are numeric
 * columns, so a string id can only mean malformed data.
 *
 * Do not "fix" this into a coercion: `createProductComparison` keys products by
 * template interpolation (`${id}-${year}`), which flattens `'5'` and `5` onto
 * the same key, while this resolver compares identities via `Set`/`includes`.
 * Coercing here would let the two sides disagree silently — the comparison
 * would render a product the resolver could never strike.
 */
const isNumber = (id: unknown): id is number => typeof id === 'number';

/** One hierarchy entry as HierarchyProvider holds it. */
export interface HierarchyProductsEntry {
  contractId: number;
  products?: unknown;
  contractData?: { term_start_date?: unknown } | null;
}

/**
 * Project the hierarchy's products data onto the resolver's input shape.
 *
 * Lives here rather than inline in HierarchyProvider so the projection is
 * directly testable: it is the seam between the UI's data shape and this
 * module, and a hand-copied duplicate in a test would drift silently.
 */
export function toChainContracts(
  hierarchyProductsData: HierarchyProductsEntry[],
): ChainContractInput[] {
  return hierarchyProductsData.map((entry) => ({
    contractId: entry.contractId,
    termStartDate: entry.contractData?.term_start_date,
    productIds: Object.values(
      (entry.products as Record<string, ProductRow[]>) || {},
    )
      .flat()
      .map(productRowId)
      .filter(isNumber),
  }));
}

/** Raw contract row shape shared by server-side callers (inventory, budget). */
export interface ContractRowInput {
  id: number;
  term_start_date?: unknown;
  vendor_products_details?: ProductRow[] | null;
}

/**
 * Project raw `contracts` rows (with their `vendor_products_details` join)
 * onto the resolver input shape — the server-side sibling of
 * `toChainContracts`, for callers that hold DB rows instead of the client
 * hierarchy shape.
 */
export function contractsToChainContracts(
  contracts: ContractRowInput[],
): ChainContractInput[] {
  return contracts.map((contract) => ({
    contractId: contract.id,
    termStartDate: contract.term_start_date,
    productIds: (contract.vendor_products_details ?? [])
      .map(productRowId)
      .filter(isNumber),
  }));
}

/**
 * Per-contract comma-joined names of products struck by a confirmed
 * cancellation (any product with a fee cutoff). Feeds export columns where
 * the full record is kept and the state is shown rather than rows omitted.
 */
export function cancelledProductNames(
  contracts: ContractRowInput[],
  cutoffsByContract: Map<number, Map<number | string, Date>>,
): Map<number, string> {
  const names = new Map<number, string>();
  contracts.forEach((contract) => {
    const cutoffs = cutoffsByContract.get(contract?.id);
    if (!cutoffs?.size) return;
    const cancelled = (contract.vendor_products_details ?? [])
      .filter((row) => {
        const id = productRowId(row);
        return isNumber(id) && cutoffs.has(id);
      })
      .map((row) => (row?.vendor_products as { name?: string } | null)?.name)
      .filter((name): name is string => typeof name === 'string');
    const unique = [...new Set(cancelled)];
    if (unique.length > 0) names.set(contract.id, unique.join(', '));
  });
  return names;
}

/** One `contract_relationships` edge, as fetched for an organization. */
export interface RelationshipEdge {
  parent_contract_id: number | null;
  child_contract_id: number | null;
  relationship_type?: string | null;
}

/**
 * Expand a contract's removed product ids into the `${productId}-${year}` keys
 * `ProductTableRenderer` matches `comparisonData.removedProducts` against —
 * the same keying `createProductComparison` uses.
 *
 * Returns undefined when nothing would be struck, so callers can omit
 * `comparisonData` entirely and keep the zero-event render path identical.
 */
export function buildRemovedProductKeys(
  removedProductIds: Set<number> | undefined,
  productsByYear: Record<string, ProductRow[]> | undefined,
): Set<string> | undefined {
  if (!removedProductIds?.size || !productsByYear) return undefined;

  const keys = new Set<string>();
  for (const [year, rows] of Object.entries(productsByYear)) {
    const struckIds = (rows ?? [])
      .map(productRowId)
      .filter(isNumber)
      .filter((id) => removedProductIds.has(id));
    struckIds.forEach((id) => keys.add(`${id}-${year}`));
  }

  return keys.size > 0 ? keys : undefined;
}

/**
 * Drop the products a year's fee total must not count: those whose
 * `${productId}-${year}` key is in `removedProducts` — the same keying
 * `buildRemovedProductKeys` produces and the row strike-through matches
 * against, so a struck row can never still be summed.
 *
 * Named with the `ForYear` suffix to keep it distinct from
 * `lib/v2/core/products.ts`'s `excludeRemovedProducts`, which filters by
 * (contract, product id) instead of year-scoped keys.
 */
export function excludeRemovedProductsForYear<T extends ProductRow>(
  rows: T[],
  year: string,
  removedProducts: Set<string> | undefined,
): T[] {
  if (!removedProducts?.size) return rows;
  return rows.filter((row) => {
    const id = productRowId(row);
    return !isNumber(id) || !removedProducts.has(`${id}-${year}`);
  });
}

/**
 * Resolve which products each chain contract should render as removed.
 *
 * @param confirmedEvents Confirmed events only. Any row whose `status` is
 *   present and not 'confirmed' is ignored, so a caller that over-fetches
 *   cannot leak a pending declaration into the UI.
 * @param chainContracts Every contract in the hierarchy, with its products.
 * @returns contractId -> set of product ids struck on that contract. Contracts
 *   with nothing struck are absent from the map.
 */
export function resolveRemovedProductIds(
  confirmedEvents: ProductLineageEventInput[],
  chainContracts: ChainContractInput[],
): Map<number, Set<number>> {
  const removed = new Map<number, Set<number>>();
  forEachStruck(confirmedEvents, chainContracts, (contractId, productIds) => {
    addRemoved(removed, contractId, productIds);
  });
  return removed;
}

/** Record `declaringDate` as a product's end date, keeping the earliest. */
const recordEarliestEnd = (
  ends: Map<number, Map<number, Date>>,
  contractId: number,
  productIds: number[],
  declaringDate: Date,
) => {
  if (productIds.length === 0) return;
  const existing = ends.get(contractId) ?? new Map<number, Date>();
  productIds.forEach((id) => {
    const current = existing.get(id);
    if (!current || declaringDate < current) existing.set(id, declaringDate);
  });
  if (!ends.has(contractId)) ends.set(contractId, existing);
};

/**
 * Like `resolveRemovedProductIds`, but each struck product carries the point
 * cost accrual stops for budget maths: the EFFECTIVE start date of the
 * contract that declared its cancellation (falling back to its ordering
 * date). Which contracts are struck still follows the ordering date — the
 * two concerns deliberately use different dates when a declaring contract's
 * start was amended. When several declarations strike the same product, the
 * earliest date wins: the product stopped being licensed then, and a later
 * blanket must not extend its accrual.
 *
 * Strikes exactly the contract/product pairs `resolveRemovedProductIds`
 * strikes; only the payload differs.
 */
export function resolveRemovedProductEndDates(
  confirmedEvents: ProductLineageEventInput[],
  chainContracts: ChainContractInput[],
): Map<number, Map<number, Date>> {
  const effectiveStartByContractId = new Map<number, Date | null>(
    chainContracts.map((c) => [
      c.contractId,
      getEffectiveStartDate(c.termStartDate),
    ]),
  );

  const ends = new Map<number, Map<number, Date>>();
  forEachStruck(
    confirmedEvents,
    chainContracts,
    (contractId, productIds, declaringDate, declaringContractId) => {
      const cutoff =
        effectiveStartByContractId.get(declaringContractId) ?? declaringDate;
      recordEarliestEnd(ends, contractId, productIds, cutoff);
    },
  );
  return ends;
}

/**
 * Shared traversal: for every applicable event and every chain contract it
 * strikes, call `visit` with the struck product ids and the declaring date.
 * Carries all the resolution rules (status filter, undated contracts,
 * strict precedence) so the public resolvers cannot drift apart.
 */
function forEachStruck(
  confirmedEvents: ProductLineageEventInput[],
  chainContracts: ChainContractInput[],
  visit: (
    contractId: number,
    productIds: number[],
    declaringDate: Date,
    declaringContractId: number,
  ) => void,
): void {
  if (!confirmedEvents?.length || !chainContracts?.length) return;

  const datesByContractId = new Map<number, Date | null>(
    chainContracts.map((c) => [c.contractId, getOrderingDate(c.termStartDate)]),
  );

  const applicableEvents = confirmedEvents.filter(
    (event) => event.status === undefined || event.status === 'confirmed',
  );

  applicableEvents.forEach((event) => {
    const declaringDate = datesByContractId.get(event.contract_id);
    // An undated declaring contract orders against nothing, so it strikes
    // nothing rather than striking the whole chain.
    if (!declaringDate) return;

    chainContracts
      .filter((candidate) =>
        precedes(
          candidate,
          event.contract_id,
          datesByContractId.get(candidate.contractId) ?? null,
          declaringDate,
        ),
      )
      .forEach((candidate) => {
        visit(
          candidate.contractId,
          struckProductIds(event, candidate),
          declaringDate,
          event.contract_id,
        );
      });
  });
}

/**
 * Undirected adjacency over hierarchy edges only.
 *
 * Components define strike scope, so a 'billing' edge — an invoice's extra
 * payer, not a lineage link — would merge two unrelated SOs' product chains
 * and let one SO's `replace_all_prior` declaration strike the other's
 * products. That is the exact cross-chain leak `resolveByComponent` exists to
 * prevent.
 */
const buildAdjacency = (
  relationships: RelationshipEdge[],
): Map<number, number[]> => {
  const adjacency = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const existing = adjacency.get(a);
    if (existing) existing.push(b);
    else adjacency.set(a, [b]);
  };
  relationships.forEach((rel) => {
    if (!isHierarchyEdge(rel)) return;
    const parent = rel.parent_contract_id;
    const child = rel.child_contract_id;
    if (parent == null || child == null) return;
    link(parent, child);
    link(child, parent);
  });
  return adjacency;
};

/**
 * Assign every seed id (and everything reachable from it over relationship
 * edges) a component representative. Edge endpoints absent from the seeds
 * still join components, so two loaded contracts connected only through an
 * unloaded middle contract land in the same component.
 */
const assignComponents = (
  seedIds: number[],
  adjacency: Map<number, number[]>,
): Map<number, number> => {
  const componentOf = new Map<number, number>();
  for (const seed of seedIds) {
    if (componentOf.has(seed)) continue;
    const stack = [seed];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (componentOf.has(id)) continue;
      componentOf.set(id, seed);
      stack.push(...(adjacency.get(id) ?? []));
    }
  }
  return componentOf;
};

const groupByComponent = <T>(
  items: T[],
  componentFor: (item: T) => number | undefined,
): Map<number, T[]> => {
  const groups = new Map<number, T[]>();
  items.forEach((item) => {
    const component = componentFor(item);
    if (component === undefined) return;
    const group = groups.get(component);
    if (group) group.push(item);
    else groups.set(component, [item]);
  });
  return groups;
};

/**
 * `resolveRemovedProductIds` for org-wide inputs spanning many chains.
 *
 * The single-chain resolver orders purely by date and never checks chain
 * membership — safe when the caller feeds it one hierarchy (the contract
 * page), but org-wide it would let a `replace_all_prior` strike unrelated,
 * older chains. This variant partitions contracts into connected lineage
 * components via `contract_relationships` edges and resolves each component
 * independently, so a declaration can never reach outside its own chain.
 * A declaring contract with no relationships is its own component and
 * strikes nothing.
 */
function resolveByComponent<T>(
  confirmedEvents: ProductLineageEventInput[],
  chainContracts: ChainContractInput[],
  relationships: RelationshipEdge[],
  resolve: (
    events: ProductLineageEventInput[],
    contracts: ChainContractInput[],
  ) => Map<number, T>,
): Map<number, T> {
  const componentOf = assignComponents(
    chainContracts.map((c) => c.contractId),
    buildAdjacency(relationships),
  );

  const contractGroups = groupByComponent(chainContracts, (c) =>
    componentOf.get(c.contractId),
  );
  const eventGroups = groupByComponent(confirmedEvents ?? [], (e) =>
    componentOf.get(e.contract_id),
  );

  const merged = new Map<number, T>();
  eventGroups.forEach((events, component) => {
    const contracts = contractGroups.get(component);
    if (!contracts) return;
    resolve(events, contracts).forEach((value, id) => merged.set(id, value));
  });
  return merged;
}

export function resolveRemovedProductIdsAcrossChains(
  confirmedEvents: ProductLineageEventInput[],
  chainContracts: ChainContractInput[],
  relationships: RelationshipEdge[],
): Map<number, Set<number>> {
  return resolveByComponent(
    confirmedEvents,
    chainContracts,
    relationships,
    resolveRemovedProductIds,
  );
}

/** `resolveRemovedProductEndDates`, partitioned the same way. */
export function resolveRemovedProductEndDatesAcrossChains(
  confirmedEvents: ProductLineageEventInput[],
  chainContracts: ChainContractInput[],
  relationships: RelationshipEdge[],
): Map<number, Map<number, Date>> {
  return resolveByComponent(
    confirmedEvents,
    chainContracts,
    relationships,
    resolveRemovedProductEndDates,
  );
}
