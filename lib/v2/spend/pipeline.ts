import type { SpendContractInput } from './contractInput';
import type {
  FeeSegment,
  SpendEventQuery,
  SpendGroupBy,
  SpendLineItem,
} from './types';
import {
  resolveFeeSegments,
  lineageFor,
  type ResolveOptions,
  type SpendLineage,
} from './resolver';
import { resolveWindow, type ResolvedWindow } from './window';
import {
  createLineItemAccumulator,
  splitEvenly,
  sponsorKeys,
} from './grouping';
import {
  UNASSIGNED_KEY,
  allocationShares,
  splitByAllocation,
  type AllocationShares,
  type SpendAllocationInput,
} from './allocation';
import { isStaleInvoice } from './invoiceRelevance';

export type SegmentResolver = typeof resolveFeeSegments;

/**
 * The identity of one resolution: the full set of ResolveOptions inputs that
 * change the segments, alongside the contract. Anything keyed more loosely can
 * hand back another window's answer.
 *
 * INVARIANT: `currency.mode` alone is the right currency dimension — neither
 * the 'base' policy's target nor its rates belong in the key. Segments under
 * 'base' are the NATIVE recorded fees, byte-identical to mode 'native';
 * conversion is applied later, at placement. Two queries differing only in
 * target or in FX therefore share the same segments, and adding either to the
 * key would only fragment the cache. The same reasoning governs
 * derivationCacheKey.
 *
 * `horizonStart` is deliberately absent for the same reason: the contract
 * resolver ignores it, so two windows sharing an end resolve identically. A
 * resolver that DOES read it (the Bloomberg seat resolver bounds its segment
 * construction to the window) must extend this key rather than reuse it.
 *
 * PRECONDITION: one memo instance serves ONE lineage graph. The key cannot
 * cover the resolver's `lineage` argument — no stable identity exists for it
 * (lineageFor builds a fresh per-contract object on every call) — and the
 * resolver reads cutoffs, amendments, and the parent term off it. Every
 * consumer builds its lineage once and then queries; a caller mixing lineage
 * graphs through one memoized resolver would be served the first graph's
 * segments.
 */
export function segmentMemoKey(
  contract: SpendContractInput,
  options: Omit<ResolveOptions, 'horizonStart'>,
): string {
  return [
    contract.id,
    options.horizonEnd.getTime(),
    options.asOf.getTime(),
    options.currency.mode,
  ].join('|');
}

/**
 * The one memoized SegmentResolver for consumers that issue several queries
 * over the same contract set — queryCommitments alone resolves each contract
 * on three passes.
 *
 * Every such consumer used to hand-roll this wrapper, and most keyed the memo
 * on contract id alone. Those were correct only because each caller happened
 * to issue a single horizon and a single currency; nothing enforced that, and
 * the first caller to add a second window would have silently been served the
 * first window's segments. Keying on `segmentMemoKey` makes the guarantee
 * structural instead of incidental.
 *
 * `base` lets a caller layer something else underneath (the derivation cache
 * wraps its store lookup this way) while keeping one memo policy. The
 * single-lineage precondition on segmentMemoKey applies to the whole memo.
 */
export function memoizedSegmentResolver(
  base: SegmentResolver = resolveFeeSegments,
): SegmentResolver {
  const memo = new Map<string, FeeSegment[]>();
  return (contract, lineage, options) => {
    const key = segmentMemoKey(contract, options);
    const hit = memo.get(key);
    if (hit) return hit;
    const segments = base(contract, lineage, options);
    memo.set(key, segments);
    return segments;
  };
}

// Delivery-layer seam: lets a caller wrap segment resolution with a store
// (the derivation cache). A wrapper must be behavior-identical to
// resolveFeeSegments for the same inputs — the engine treats it as the same
// pure function.
export interface SpendQueryOptions {
  resolveSegments?: SegmentResolver;
  // Required by the allocation dimension, ignored by every other groupBy.
  // Absent when asked for is an error rather than an all-unassigned answer,
  // so a caller that forgot to resolve allocations cannot ship a silent
  // "nothing is allocated" report.
  allocations?: SpendAllocationInput;
}

export type SpendDimension =
  | 'total'
  | 'vendor'
  | 'contract'
  | 'product'
  | 'sponsor'
  | 'allocation';

export function dimensionOf(groupBy: SpendGroupBy): SpendDimension {
  return typeof groupBy === 'string' ? groupBy : groupBy.kind;
}

// The axes the pipeline reads. SpendEventQuery already names exactly that set
// and SpendQuery is a superset of it, so both drive the pipeline unchanged;
// basis, proration, valuation and recognition belong to the placer.
export type PipelineQuery = SpendEventQuery;

// The same rule for every query: 'native' resolves each contract from its
// original recorded fees, so it is valid only for per-contract reads
// (groupBy contract/product). Summing native amounts across differently
// denominated contracts is meaningless, and the engine cannot tell one
// currency's total from another's.
//
// 'base' has no such restriction and is valid for EVERY groupBy: it converts
// each contract into the org's base currency BEFORE the accumulator sees it,
// so a cross-contract sum is a sum of one currency. Cross-currency aggregation
// asks for 'base', never 'native'.
export function assertGroupableCurrency(
  query: PipelineQuery,
  caller: string,
): void {
  if (
    query.currency.mode === 'native' &&
    query.groupBy !== 'contract' &&
    query.groupBy !== 'product'
  ) {
    throw new Error(
      `${caller}: the native currency policy only supports per-contract grouping (contract/product) until psk-1796 part B`,
    );
  }
}

// One contract's value in one period bucket, before grouping re-tags it.
export interface Placed {
  period: string;
  value: number;
  // The same amount before base-currency conversion, in the contract's own
  // currency. Stamped by the conversion decorators (baseCurrency.ts); absent
  // on unconverted paths, where `value` already IS the native amount.
  native?: number;
}

export interface ProductPlaced extends Placed {
  productId: number;
}

export type PlaceFn<T extends Placed> = (
  segments: FeeSegment[],
  contract: SpendContractInput,
  window: ResolvedWindow,
) => T[];

/**
 * How a view turns one contract's resolved segments into dated values — the
 * ONLY axis on which the engine's queries differ. The spend bases spread each
 * segment's fee across the window; the event views collapse segments into one
 * dated point per term or per slice.
 *
 * Product attribution is its own method rather than a breakdown of `total`
 * because neither derives from the other: the spend bases slice (and round)
 * each product's segments independently, an event's date is read from the
 * CONTRACT's segments (TCV's committed end is the contract's last, not each
 * product's), and `splitEvenly` must round ONE contract-level value per
 * period. The pipeline calls exactly one of the two, so no view pays for
 * attribution nobody asked for.
 */
export interface Placer {
  total: PlaceFn<Placed>;
  byProduct: PlaceFn<ProductPlaced>;
}

// queryCommitments pads the projection horizon per contract (see
// commitmentHorizonEnd); every other query resolves to the plain window end.
export type HorizonOf = (
  contract: SpendContractInput,
  windowEnd: Date,
  lineage: SpendLineage,
) => Date;

const UNASSIGNED_SHARES: AllocationShares = [[UNASSIGNED_KEY, 100]];

function requireAllocations(options: SpendQueryOptions): SpendAllocationInput {
  if (!options.allocations) {
    throw new Error(
      'runPipeline: groupBy allocation requires options.allocations (resolve allocations outside the engine and pass the map in)',
    );
  }
  return options.allocations;
}

/**
 * The one engine pipeline: resolve → skip stale invoices → place → group →
 * accumulate. Every engine query drives it; all a query adds is its `Placer`
 * and, for commitments, a per-contract horizon.
 *
 * Grouping lives here rather than in the slicers or placers: those stay pure
 * and groupKey-agnostic, and this seam re-tags their per-contract values
 * (accumulator semantics + the additivity invariant: see grouping.ts).
 *
 * `lineage` is the supersession graph over the LINEAGE-EXPANDED contract set
 * (buildSpendLineage); EMPTY_LINEAGE resolves every contract independently.
 */
export function runPipeline(
  contracts: SpendContractInput[],
  query: PipelineQuery,
  lineage: SpendLineage,
  options: SpendQueryOptions,
  placer: Placer,
  horizonOf?: HorizonOf,
): SpendLineItem[] {
  if (contracts.length === 0) return [];

  const { groupBy, fiscalConfig } = query;
  const window = resolveWindow(query.window, query.asOf, fiscalConfig);
  const resolve = options.resolveSegments ?? resolveFeeSegments;
  const { add, items } = createLineItemAccumulator();

  // Every item carries its pre-conversion amount alongside the converted one,
  // and the accumulator emits it wherever a bucket stays denominationally
  // coherent (grouping.ts). Under 'base' the conversion decorators stamp
  // `native` on each placement; under 'native' the value never converted, so
  // it IS the native amount. 'preconverted-usd' resolves pre-converted stamps
  // — the original amounts were never in the pipeline, so there is nothing
  // truthful to emit.
  const carriesNative = query.currency.mode !== 'preconverted-usd';
  const nativeOf = (placed: Placed) =>
    carriesNative ? (placed.native ?? placed.value) : undefined;

  const dimension = dimensionOf(groupBy);
  const allocation =
    dimension === 'allocation' ? requireAllocations(options) : undefined;

  for (const contract of contracts) {
    if (isStaleInvoice(contract, window.start)) continue;
    const currencyOf = carriesNative
      ? (contract.currency || 'USD').trim().toUpperCase() || 'USD'
      : undefined;
    const segments = resolve(contract, lineageFor(lineage, contract.id), {
      asOf: query.asOf,
      horizonStart: window.start,
      horizonEnd: horizonOf
        ? horizonOf(contract, window.end, lineage)
        : window.end,
      currency: query.currency,
    });

    // Multi-valued dimensions place once, then split each value across the
    // contract's keys so additivity holds. The native amount splits over the
    // SAME keys, so each denomination is cents-preserving on its own terms.
    const addSplit = (placed: Placed, shares: AllocationShares) => {
      const native = nativeOf(placed);
      const nativeShares =
        native === undefined ? undefined : splitByAllocation(native, shares);
      splitByAllocation(placed.value, shares).forEach(([key, share], index) => {
        add(placed.period, key, share, nativeShares?.[index][1], currencyOf);
      });
    };

    switch (dimension) {
      case 'product': {
        // The key is composite (contractId, productId), NEVER the product
        // name: two products sharing a display label must not merge, and the
        // same product on two contracts stays two series.
        for (const placed of placer.byProduct(segments, contract, window)) {
          add(
            placed.period,
            `${contract.id}:${placed.productId}`,
            placed.value,
            nativeOf(placed),
            currencyOf,
          );
        }
        break;
      }
      case 'sponsor': {
        const keys = sponsorKeys(contract);
        for (const placed of placer.total(segments, contract, window)) {
          const native = nativeOf(placed);
          const nativeShares =
            native === undefined ? undefined : splitEvenly(native, keys);
          splitEvenly(placed.value, keys).forEach(([key, share], index) => {
            add(
              placed.period,
              key,
              share,
              nativeShares?.[index][1],
              currencyOf,
            );
          });
        }
        break;
      }
      case 'allocation': {
        if (!allocation || typeof groupBy === 'string') break;
        const { level } = groupBy;
        const scopes = allocation.resolved.get(contract.id)?.scopes ?? [];
        const whole = scopes.find((scope) => scope.productId === null);
        if (whole || scopes.length === 0) {
          // Whole-contract allocation (or none at all) splits the contract's
          // total placements; a scope with no lines is unassigned.
          const shares = whole
            ? allocationShares(whole.lines, level, allocation.unitsById)
            : UNASSIGNED_SHARES;
          for (const placed of placer.total(segments, contract, window)) {
            addSplit(placed, shares);
          }
          break;
        }
        // Product-scoped: each product splits its own placements by its own
        // scope; a product with no scope on the resolved ancestor stays
        // unassigned (no cross-scope merge).
        const sharesByProduct = new Map(
          scopes.map((scope) => [
            scope.productId,
            allocationShares(scope.lines, level, allocation.unitsById),
          ]),
        );
        for (const placed of placer.byProduct(segments, contract, window)) {
          addSplit(
            placed,
            sharesByProduct.get(placed.productId) ?? UNASSIGNED_SHARES,
          );
        }
        break;
      }
      case 'contract':
      case 'vendor':
      case 'total': {
        const groupKey =
          dimension === 'contract'
            ? String(contract.id)
            : dimension === 'vendor'
              ? String(contract.vendor_id)
              : 'total';
        for (const placed of placer.total(segments, contract, window)) {
          add(
            placed.period,
            groupKey,
            placed.value,
            nativeOf(placed),
            currencyOf,
          );
        }
        break;
      }
    }
  }

  return items();
}
