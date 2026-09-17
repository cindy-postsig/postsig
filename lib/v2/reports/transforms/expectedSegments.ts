/**
 * Segment-sourced expected fees for the invoice discrepancy report (PSK-1928
 * follow-up).
 *
 * The report's comparison logic is untouched — period matched to period, the
 * per-period ANNUALIZED fee handed to calculateInvoiceDiscrepancy exactly as
 * before. What changes is WHERE the per-period fee comes from: the spend
 * resolver's segments, instead of a hand-rolled walk over raw
 * vendor_products_details. Year selection (PSK-1819's anchoring), annual-
 * increase compounding, decision #9 term shapes, amendment supersession and
 * PSK-1830 cancellation cutoffs are all the resolver's — resolved once, the
 * same way every spend surface resolves them.
 *
 * Lineage is REAL (PSK-1830's cutoff graph included): a parent superseded by
 * an amendment prices post-cutoff periods at the amendment's fee, which the
 * legacy walk never saw.
 */

import { addDays, format, parseISO } from 'date-fns';
import {
  buildSpendLineage,
  buildSpendLineageFromEnriched,
  type ContractLineage,
  earliestIsoDate,
  lineageFor,
  memoizedSegmentResolver,
  segmentSpanMonths,
  type FeeSegment,
  type LineageMember,
  type RelationshipEdge,
  type SegmentResolver,
  type SpendContractInput,
  type SpendLineage,
} from '@/lib/v2/spend';
import type { ContractWithPricing } from '@/lib/v2/core/types';

export interface SegmentFeeContext {
  lineage: SpendLineage;
  resolveSegments: SegmentResolver;
  /**
   * The same contracts resolved with every cutoff removed. A separate memo
   * because segmentMemoKey cannot see the lineage argument — one memo serves
   * one graph — and the cut graph decides WHICH segment covers a date while
   * the uncut graph supplies that segment's whole-cycle fee (see cycleFeeOf).
   */
  resolveUncutSegments: SegmentResolver;
  contractById: Map<number, SpendContractInput>;
  /** (sourceContractId, productId) -> the contract superseding that product. */
  supersederOf: (contractId: number, productId: number) => number | undefined;
  /** Memo for seeded mini-family graphs, one per seeded contract id. */
  seededLineageById: Map<number, SpendLineage>;
  asOf: Date;
  horizonEnd: Date;
}

// Invoice matching resolves a contract's WHOLE recorded history — an invoice
// can be years older than any query window — so there is no window start to
// pass. The contract resolver ignores it either way.
const WHOLE_HISTORY_START = new Date(0);

export function buildSegmentFeeContext(
  allContracts: ContractWithPricing[],
  relationships: RelationshipEdge[],
  cutoffsByContract: Map<number, Map<number, Date>> | undefined,
  asOf: Date,
  horizonEnd: Date,
): SegmentFeeContext {
  const lineage = buildSpendLineageFromEnriched(
    allContracts,
    relationships,
    cutoffsByContract,
  );

  // Inverse of lineage.amends: amends maps the SUPERSEDING contract's
  // products back to their source, so walking forward (source -> superseder)
  // needs the index flipped once.
  const superseders = new Map<string, number>();
  lineage.amends.forEach((byProduct, supersedingId) => {
    byProduct.forEach((sourceId, productId) => {
      superseders.set(`${sourceId}:${productId}`, supersedingId);
    });
  });

  return {
    lineage,
    resolveSegments: memoizedSegmentResolver(),
    resolveUncutSegments: memoizedSegmentResolver(),
    seededLineageById: new Map(),
    contractById: new Map(
      allContracts.map((ec) => [ec.id, ec.contract as SpendContractInput]),
    ),
    supersederOf: (contractId, productId) =>
      superseders.get(`${contractId}:${productId}`),
    asOf,
    horizonEnd,
  };
}

export interface PeriodFee {
  /** The fee of the segment covering the period. */
  fee: number;
  /**
   * The currency `fee` is denominated in — the OWNING segment's, which on a
   * supersession chain can be the amendment's, not the parent's. Conversions
   * must use this, never the parent contract's currency (PSK-1796's rule:
   * the fee source decides the denomination).
   */
  currency: string;
  /** Months the segment's fee prices — calculateInvoiceDiscrepancy's divisor. */
  spanMonths: number;
}

/**
 * The family-cutoff graph for a SEEDED source contract. Cutoffs derive among
 * lineage members, so a parent absent from the resolved set (expired,
 * archived) has none even when its superseders are members — its seeded
 * segments would resolve uncut and shadow the amendment's re-pricing. Rebuild
 * every family through the engine's own buildSpendLineage: the seed as
 * source member of each product it lists, each superseder in that product's
 * chain as an amending member anchored at its own original start. The rule
 * stays the engine's; only the member list is assembled here.
 *
 * One graph per seed, covering ALL its products: the resolver memo keys on
 * the contract, so whichever product resolves first fixes the lineage every
 * later product of the same seed is served under. A per-product graph left
 * the other products' cutoffs out of that cached resolution.
 */
function seededLineage(
  ctx: SegmentFeeContext,
  seed: SpendContractInput,
): SpendLineage {
  const seedStart = earliestIsoDate(
    (seed as { term_start_date?: Array<{ date: string }> | null })
      .term_start_date,
  );
  if (!seedStart) return buildSpendLineage([]);

  const seedId = Number(seed.id);
  const productIds = new Set<number>();
  for (const row of seed.vendor_products_details ?? []) {
    if (row.product_id != null) productIds.add(row.product_id);
  }

  const members: LineageMember[] = [];
  for (const productId of productIds) {
    members.push({
      contractId: seedId,
      productId,
      sourceContractId: seedId,
      isSuperseding: false,
      originalStart: seedStart,
    });
    let contractId = ctx.supersederOf(seedId, productId);
    const visited = new Set<number>();
    while (contractId !== undefined && !visited.has(contractId)) {
      visited.add(contractId);
      const successor = ctx.contractById.get(contractId);
      const successorStart = successor
        ? earliestIsoDate(
            (successor as { term_start_date?: Array<{ date: string }> | null })
              .term_start_date,
          )
        : null;
      if (successorStart) {
        members.push({
          contractId,
          productId,
          sourceContractId: seedId,
          isSuperseding: true,
          originalStart: successorStart,
        });
      }
      contractId = ctx.supersederOf(contractId, productId);
    }
  }
  return buildSpendLineage(members);
}

interface ResolutionInputs {
  contract: SpendContractInput;
  lineage: ContractLineage | undefined;
}

function resolutionInputs(
  ctx: SegmentFeeContext,
  contractId: number,
  seed?: SpendContractInput,
): ResolutionInputs | undefined {
  // An expired or archived parent is absent from the resolved active set, but
  // its full row rides embedded on the invoice's relationship — seed it so
  // expected fees keep working regardless of parent status (PSK-1819's rule).
  const resolved = ctx.contractById.get(contractId);
  const contract =
    resolved ?? (seed && Number(seed.id) === contractId ? seed : undefined);
  if (!contract) return undefined;
  // Memo safety: segmentMemoKey's one-graph-per-memo precondition holds
  // because a seeded id is by definition ABSENT from the resolved set — the
  // shared memo only ever sees it under its (deterministic) mini-family
  // graph, never under the main graph.
  if (resolved) {
    return { contract, lineage: lineageFor(ctx.lineage, contractId) };
  }
  let seeded = ctx.seededLineageById.get(contractId);
  if (!seeded) {
    seeded = seededLineage(ctx, contract);
    ctx.seededLineageById.set(contractId, seeded);
  }
  return { contract, lineage: lineageFor(seeded, contractId) };
}

function segmentsFor(
  ctx: SegmentFeeContext,
  contractId: number,
  productId: number,
  seed?: SpendContractInput,
): FeeSegment[] {
  const inputs = resolutionInputs(ctx, contractId, seed);
  if (!inputs) return [];
  return ctx
    .resolveSegments(inputs.contract, inputs.lineage, {
      asOf: ctx.asOf,
      horizonStart: WHOLE_HISTORY_START,
      horizonEnd: ctx.horizonEnd,
      currency: { mode: 'native' },
    })
    .filter((segment) => segment.productId === productId);
}

/**
 * A segment straddling a cutoff — an amendment's start or a PSK-1830
 * cancellation — is truncated to [from, cutoff) with its fee day-prorated,
 * while spanMonthsOf rounds that remainder to whole months; the two never
 * agree, so a correctly billed invoice inside the cut cycle read as a
 * discrepancy (PSK-1956: Berenberg JPM #3043, $10,000 kept for 93/366 days
 * over a "3-month" span expected $10,163.92). The report prices what is in
 * effect at the billing start for the whole cycle, so the cut graph only
 * decides WHICH segment covers; its whole-cycle fee and span come from the
 * same contract resolved with no cutoffs, matched on the cycle start the
 * truncation leaves untouched.
 */
function cycleFeeOf(
  ctx: SegmentFeeContext,
  contractId: number,
  productId: number,
  segment: FeeSegment,
  seed?: SpendContractInput,
): PeriodFee {
  const inputs = resolutionInputs(ctx, contractId, seed);
  const uncut =
    inputs &&
    ctx
      .resolveUncutSegments(
        inputs.contract,
        inputs.lineage && { ...inputs.lineage, cutoffByProduct: new Map() },
        {
          asOf: ctx.asOf,
          horizonStart: WHOLE_HISTORY_START,
          horizonEnd: ctx.horizonEnd,
          currency: { mode: 'native' },
        },
      )
      .find((s) => s.productId === productId && s.from === segment.from);
  const cycle = uncut ?? segment;
  return {
    fee: cycle.fee,
    currency: cycle.currency,
    spanMonths: spanMonthsOf(cycle),
  };
}

function spanMonthsOf(segment: FeeSegment): number {
  // The resolver's own month arithmetic (a 17-month-20-day span is 18 months
  // there, not the floor 17). `to` is exclusive; the helper expects the
  // inclusive end.
  const inclusiveEnd = format(addDays(parseISO(segment.to), -1), 'yyyy-MM-dd');
  const months = segmentSpanMonths(segment.from, inclusiveEnd);
  return months > 0 ? months : 1;
}

interface ChainSegment {
  contractId: number;
  segment: FeeSegment;
}

/**
 * The fee of the period covering `dateIso` for one product, walking the
 * supersession chain: the source contract's segments first (they end at the
 * PSK-1830/amendment cutoff), then each superseding contract's. Cutoffs keep
 * the chain's segments non-overlapping, so at most one segment covers.
 *
 * A date no segment covers — past a will-not-renew end, or after a
 * cancellation with no superseder — clamps to the chain's final segment, the
 * carried-forward current fee, mirroring the legacy clamp.
 */
export function expectedPeriodFee(
  ctx: SegmentFeeContext,
  parentContractId: number,
  productId: number,
  dateIso: string,
  /** The invoice-embedded parent row, used when the resolved set lacks it. */
  seedParent?: SpendContractInput,
): PeriodFee | null {
  const chain: ChainSegment[] = [];
  const visited = new Set<number>();
  let contractId: number | undefined = parentContractId;

  while (contractId !== undefined && !visited.has(contractId)) {
    visited.add(contractId);
    const segments = segmentsFor(ctx, contractId, productId, seedParent);
    for (const segment of segments) {
      if (segment.from <= dateIso && dateIso < segment.to) {
        return cycleFeeOf(ctx, contractId, productId, segment, seedParent);
      }
    }
    for (const segment of segments) chain.push({ contractId, segment });
    contractId = ctx.supersederOf(contractId, productId);
  }

  if (chain.length === 0) return null;
  const last = chain.reduce((latest, entry) =>
    entry.segment.to > latest.segment.to ? entry : latest,
  );
  const cycle = cycleFeeOf(
    ctx,
    last.contractId,
    productId,
    last.segment,
    seedParent,
  );
  // A one-time product's expectation exists only inside its booked segment
  // (psk-1492): an invoice dated after it re-bills a fee already paid, so
  // the expected fee is zero and the whole billed amount surfaces as the
  // discrepancy. Earlier dates keep the nearest-fee grace below — setup
  // invoices routinely predate the term start by a few days.
  if (
    dateIso >= last.segment.to &&
    isOneTimeOnlyProduct(ctx, parentContractId, productId, seedParent)
  ) {
    return { ...cycle, fee: 0 };
  }
  return cycle;
}

// Judged on the parent's own rows: a superseding amendment that re-prices the
// product as recurring gives it covering segments and never reaches the
// fallback this gate guards.
function isOneTimeOnlyProduct(
  ctx: SegmentFeeContext,
  contractId: number,
  productId: number,
  seedParent?: SpendContractInput,
): boolean {
  const contract = ctx.contractById.get(contractId) ?? seedParent;
  const rows =
    contract?.vendor_products_details?.filter(
      (p) => p.product_id === productId,
    ) ?? [];
  return rows.length > 0 && rows.every((p) => p.one_time_only === true);
}
