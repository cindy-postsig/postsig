import type { SpendContractInput } from './contractInput';
import type {
  SpendQuery,
  SpendResult,
  SpendLineItem,
  FeeSegment,
} from './types';
import { EMPTY_LINEAGE, type SpendLineage } from './resolver';
import { sliceAmortized, sliceActual, sliceCommitted } from './slicers';
import type { ResolvedWindow } from './window';
import {
  assertGroupableCurrency,
  runPipeline,
  type Placer,
  type ProductPlaced,
  type SpendQueryOptions,
} from './pipeline';
import { withMonthlyConversion, withTermStartConversion } from './baseCurrency';

// Mirrors the equivalence harness's billing map: unknown/absent frequency → 0,
// the "bill the full fee once on the cycle start" case sliceActual handles.
// Deliberately narrower than getBillingIntervalMonths, which folds unknown into
// annually (12); the spend engine treats an unrecognized frequency as unknown.
function billingMonthsOf(frequency: string | null | undefined): number {
  switch ((frequency ?? '').toLowerCase()) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'bi-annually':
    case 'semi-annually':
      return 6;
    case 'annually':
      return 12;
    default:
      return 0;
  }
}

// Slicing IS placement for the spend bases: each spreads a segment's fee across
// the window's buckets its own way. Product attribution partitions the segments
// first and slices each product as its own set, so a per-product line is
// rounded on that product's own value rather than back-derived from the
// contract's.
function spendPlacer(query: SpendQuery): Placer {
  const { basis, granularity, proration, fiscalConfig } = query;
  const slice = (
    segments: FeeSegment[],
    contract: SpendContractInput,
    window: ResolvedWindow,
  ): SpendLineItem[] => {
    if (basis === 'actual') {
      return sliceActual(
        segments,
        window,
        granularity,
        { billingMonths: billingMonthsOf(contract.billing_frequency) },
        fiscalConfig,
      );
    }
    if (basis === 'committed') {
      return sliceCommitted(segments, window, granularity, fiscalConfig);
    }
    return sliceAmortized(
      segments,
      window,
      granularity,
      proration ?? 'monthly',
      fiscalConfig,
    );
  };

  return {
    total: slice,
    byProduct: (segments, contract, window) => {
      const bySegmentProduct = new Map<number, FeeSegment[]>();
      for (const segment of segments) {
        const existing = bySegmentProduct.get(segment.productId);
        if (existing) existing.push(segment);
        else bySegmentProduct.set(segment.productId, [segment]);
      }
      const placed: ProductPlaced[] = [];
      for (const [productId, productSegments] of bySegmentProduct) {
        for (const item of slice(productSegments, contract, window)) {
          placed.push({ period: item.period, value: item.value, productId });
        }
      }
      return placed;
    },
  };
}

// Under 'base' the placer is wrapped so native fees convert before the pipeline
// accumulates them. WHICH rate applies is a property of the basis: the flow
// bases recognise month by month, so each month converts at its own rate (and
// the slice therefore has to run at 'month' granularity, with the decorator
// re-bucketing afterwards); the committed basis recognises a whole term at
// once, so it converts at the term's start date.
function placerFor(query: SpendQuery): Placer {
  const { currency, basis } = query;
  if (currency.mode !== 'base') return spendPlacer(query);
  if (basis === 'committed') {
    return withTermStartConversion(spendPlacer(query), currency);
  }
  return withMonthlyConversion(
    spendPlacer({ ...query, granularity: 'month' }),
    currency,
    query.granularity,
    query.fiscalConfig,
  );
}

// `lineage` is the supersession graph over the LINEAGE-EXPANDED contract set
// (buildSpendLineage). Omitting it (EMPTY_LINEAGE) resolves every contract
// independently — the shadow default until a consumer supplies real lineage.
export function querySpend(
  contracts: SpendContractInput[],
  query: SpendQuery,
  lineage: SpendLineage = EMPTY_LINEAGE,
  options: SpendQueryOptions = {},
): SpendResult {
  const { basis, currency, proration, explain } = query;

  assertGroupableCurrency(query, 'querySpend');
  if (explain) {
    throw new Error('querySpend: explain not implemented until phase 7');
  }
  // Proration is an amortized-only policy; rejecting it elsewhere keeps callers
  // from believing committed/actual are day-prorated.
  if (proration !== undefined && basis !== 'amortized') {
    throw new Error(
      'querySpend: proration is only valid with the amortized basis',
    );
  }

  return {
    basis,
    currency,
    items: runPipeline(contracts, query, lineage, options, placerFor(query)),
  };
}
