import type { ProductWithLineage } from '@/lib/v2/core/types';
import { deriveCancelByDateFromParent } from '@/lib/v2/core/lineage';
import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';
import {
  buildSpendLineage,
  type LineageMember,
  type SpendLineage,
} from './resolver';
import { earliestIsoDate } from './resolver/resolveFeeSegments';

// The minimal relationship row shape the builders consume — what
// fetchAllRelationshipsForOrg returns (already filtered to active,
// non-disabled edges).
export interface RelationshipEdge {
  parent_contract_id: number | null;
  child_contract_id: number | null;
  relationship_type?: string | null;
}

// An edge with both endpoints present — what the builders can actually act on.
interface ResolvedEdge {
  parentId: number;
  childId: number;
}

/**
 * Drop half-null edges and put the rest in a total order — (parent, child)
 * ascending — so first-edge-wins resolution is a property of the GRAPH, not of
 * row order.
 *
 * fetchAllRelationshipsForOrg issues no ORDER BY, so Postgres may hand back the
 * same edges in a different sequence on any request: a child with two parents
 * recording different positive terms could otherwise inherit a different term
 * request to request. `buildComponentSignatures` (derivationKey.ts) already
 * sorts edges when it builds the derivation-cache key, so an unordered walk
 * here would produce identical cache keys for differing segments — a cached
 * value keyed on a signature that no longer describes it.
 *
 * Non-hierarchy edges are dropped: a 'billing' parent names an invoice's
 * *additional* payer, not its structural parent, so it must never supply
 * inherited term or notice-day values.
 */
function orderedEdges(relationships: RelationshipEdge[]): ResolvedEdge[] {
  const edges: ResolvedEdge[] = [];
  for (const rel of relationships) {
    if (!isHierarchyEdge(rel)) continue;
    const parentId = rel.parent_contract_id;
    const childId = rel.child_contract_id;
    if (parentId == null || childId == null) continue;
    edges.push({ parentId, childId });
  }
  return edges.sort((a, b) => a.parentId - b.parentId || a.childId - b.childId);
}

// The subset of enrichWithLineage output the builders read, typed
// structurally so pricing-enriched supersets (ContractWithPricing, whose
// vendor fields are nullable) qualify without casts.
export interface LineageSource {
  id: number;
  contract?: {
    term_start_date?: Array<{ date: string }> | null;
    subscription_term?: number | null;
    type_id?: number | null;
    cancel_by_date?: number | string | null;
    cancel_date?: Array<{ date: string }> | null;
    term_end_date?: Array<{ date: string }> | null;
  } | null;
  products: Array<
    Pick<
      ProductWithLineage,
      'product_id' | 'sourceContractId' | 'isSuperseding'
    >
  >;
  isLinkedChildInvoice: boolean;
  excludedFromOverallSpend?: boolean;
}

/**
 * Derive buildSpendLineage's members from enrichWithLineage output.
 *
 * Linked child invoices are excluded here — the guardrail documented on
 * buildSpendLineage: a linked invoice lands in its parent's family and its
 * start date would spuriously cut the parent. A standalone invoice stays only
 * when a reviewer set apply_to_overall_spend; without it the invoice
 * contributes nothing, so it must not form a singleton family either. Contracts
 * with no parseable start date carry no timeline position and are skipped,
 * matching the legacy cutoff walk.
 */
export function buildLineageMembers(
  enriched: LineageSource[],
): LineageMember[] {
  const members: LineageMember[] = [];
  for (const ec of enriched) {
    if (ec.isLinkedChildInvoice || ec.excludedFromOverallSpend) continue;
    const originalStart = earliestIsoDate(
      ec.contract?.term_start_date ?? undefined,
    );
    if (!originalStart) continue;
    for (const product of ec.products) {
      members.push({
        contractId: ec.id,
        productId: product.product_id,
        sourceContractId: product.sourceContractId,
        isSuperseding: product.isSuperseding,
        originalStart,
      });
    }
  }
  return members;
}

/**
 * Record each child contract's direct parent subscription_term (months) —
 * the facts behind addendum term inheritance. The resolver applies a parent's
 * term only when the child records neither an end date nor its own
 * subscription_term (Berenberg JPM #3038); this map just carries what the
 * parent says. Invoice children are skipped (billing records, not amendments)
 * and a parent outside the loaded set contributes nothing. When a child has
 * several parents, the lowest-numbered parent recording a positive term wins —
 * see `orderedEdges` for why the walk order is pinned rather than left to the
 * fetch.
 */
export function buildParentTerms(
  enriched: LineageSource[],
  relationships: RelationshipEdge[],
): Map<number, number> {
  const byId = new Map(enriched.map((ec) => [ec.id, ec]));
  const parentTerms = new Map<number, number>();
  for (const { childId, parentId } of orderedEdges(relationships)) {
    if (parentTerms.has(childId)) continue;
    const child = byId.get(childId);
    const parent = byId.get(parentId);
    if (!child || !parent || child.isLinkedChildInvoice) continue;
    const term = parent.contract?.subscription_term;
    if (typeof term === 'number' && term > 0) {
      parentTerms.set(childId, term);
    }
  }
  return parentTerms;
}

/**
 * Record each child's inherited NOTICE PERIOD in days (psk-1855). The
 * eligibility rule is not restated here — `deriveCancelByDateFromParent` owns
 * it, so the engine grants a notice period exactly where the contracts table
 * and calendar show an inherited cancel-by date.
 *
 * Only `noticeDays` is carried, never that function's resolved `date`: it
 * counts back from the contract's RECORDED term end, whereas commitments
 * recognize each PROJECTED cycle off its own outgoing term end. Reusing the
 * date would pin every future cycle to the first term's deadline.
 *
 * Known gap, deliberate: that eligibility rule requires the child to record
 * its own term end, so a child that inherits its TERM from the parent (no end
 * date — the shape `parentTerms` exists for) never inherits a notice period;
 * its renewals recognize at term start. The two inheritance mechanisms do not
 * compose — see the handoff doc's cancel-by section before "fixing" this.
 *
 * As with `buildParentTerms`, a multi-parent child takes the lowest-numbered
 * parent that grants an inherited cancel-by date; `orderedEdges` explains why.
 */
export function buildParentNoticeDays(
  enriched: LineageSource[],
  relationships: RelationshipEdge[],
): Map<number, number> {
  const byId = new Map(enriched.map((ec) => [ec.id, ec]));
  const noticeDays = new Map<number, number>();
  for (const { childId, parentId } of orderedEdges(relationships)) {
    if (noticeDays.has(childId)) continue;
    const child = byId.get(childId);
    const parent = byId.get(parentId);
    if (!child || !parent) continue;
    const inherited = deriveCancelByDateFromParent(
      { ...child.contract, id: child.id },
      { ...parent.contract, id: parent.id },
    );
    if (inherited) noticeDays.set(childId, inherited.noticeDays);
  }
  return noticeDays;
}

// One-stop lineage input for querySpend: cutoff graph from the members plus
// the parent-term facts, over the same enriched set.
//
// `eventCutoffs` carries confirmed vendor_product_lineage_events cutoffs
// (PSK-1830, contractId → productId → date accrual stops) resolved by the
// async caller — the engine itself never fetches. They merge into the
// supersession cutoff graph earliest-wins, so a product both re-priced by an
// amendment and cancelled by a declaration stops at whichever came first.
export function buildSpendLineageFromEnriched(
  enriched: LineageSource[],
  relationships: RelationshipEdge[],
  eventCutoffs?: Map<number, Map<number, Date>>,
): SpendLineage {
  const lineage = buildSpendLineage(buildLineageMembers(enriched));
  lineage.parentTerms = buildParentTerms(enriched, relationships);
  lineage.parentNoticeDays = buildParentNoticeDays(enriched, relationships);
  if (eventCutoffs?.size) mergeEventCutoffs(lineage.cutoffs, eventCutoffs);
  return lineage;
}

/**
 * Fold event cutoffs (UTC-midnight Dates) into the lineage cutoff graph
 * (exclusive ISO dates), keeping the earliest date when both mechanisms
 * strike the same (contract, product).
 */
function mergeEventCutoffs(
  cutoffs: Map<number, Map<number, string>>,
  eventCutoffs: Map<number, Map<number, Date>>,
): void {
  for (const [contractId, byProduct] of eventCutoffs) {
    let target = cutoffs.get(contractId);
    if (!target) {
      target = new Map<number, string>();
      cutoffs.set(contractId, target);
    }
    for (const [productId, date] of byProduct) {
      const iso = date.toISOString().slice(0, 10);
      const existing = target.get(productId);
      if (!existing || iso < existing) target.set(productId, iso);
    }
  }
}
