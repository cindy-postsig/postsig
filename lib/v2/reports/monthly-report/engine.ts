import { addMonths, format, startOfMonth } from 'date-fns';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import {
  querySpend,
  memoizedSegmentResolver,
  buildSpendLineageFromEnriched,
  type CurrencyPolicy,
  type FiscalConfig,
  type RelationshipEdge,
  type SpendContractInput,
  type SpendLineItem,
} from '@/lib/v2/spend';

export interface MonthlyValues {
  currentMonth: number;
  nextMonth: number;
  change: number;
}

/** contractId → vendor_products.id → that product's own month values. */
export type ProductMonthlyValues = Map<number, Map<number, MonthlyValues>>;

export interface MonthlyReportEngineValues {
  amortized: Map<number, MonthlyValues>;
  actual: Map<number, MonthlyValues>;
  /**
   * The same months in each contract's own currency, read off the engine's
   * nativeValue stamps (a per-contract bucket always carries one) rather than
   * a second engine pass. A contract already in the base currency stamps
   * native == value, so these maps cover every contract.
   */
  amortizedNative: Map<number, MonthlyValues>;
  actualNative: Map<number, MonthlyValues>;
  /**
   * Per-product month values from the same engine run (groupBy 'product'),
   * for product-scoped cost allocations: a product-scoped split needs each
   * product's own months, and deriving them from fee proportions would
   * silently disagree with the engine's own allocation dimension.
   */
  amortizedProducts: ProductMonthlyValues;
  actualProducts: ProductMonthlyValues;
  amortizedProductsNative: ProductMonthlyValues;
  actualProductsNative: ProductMonthlyValues;
  currentMonthKey: string;
  nextMonthKey: string;
}

function monthTotals(
  items: SpendLineItem[],
  monthKey: string,
  valueOf: (item: SpendLineItem) => number,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const item of items) {
    if (item.period !== monthKey) continue;
    const id = Number(item.groupKey);
    if (!Number.isFinite(id)) continue;
    totals.set(id, (totals.get(id) ?? 0) + valueOf(item));
  }
  return totals;
}

// groupBy 'product' keys are composite `${contractId}:${productId}`.
function productMonthTotals(
  items: SpendLineItem[],
  monthKey: string,
  valueOf: (item: SpendLineItem) => number,
): Map<number, Map<number, number>> {
  const totals = new Map<number, Map<number, number>>();
  for (const item of items) {
    if (item.period !== monthKey) continue;
    const [contractId, productId] = item.groupKey.split(':').map(Number);
    if (!Number.isFinite(contractId) || !Number.isFinite(productId)) continue;
    const byProduct = totals.get(contractId) ?? new Map<number, number>();
    byProduct.set(productId, (byProduct.get(productId) ?? 0) + valueOf(item));
    totals.set(contractId, byProduct);
  }
  return totals;
}

function combineProductMonths(
  current: Map<number, Map<number, number>>,
  next: Map<number, Map<number, number>>,
): ProductMonthlyValues {
  const byContract: ProductMonthlyValues = new Map();
  for (const id of new Set([...current.keys(), ...next.keys()])) {
    byContract.set(
      id,
      combineMonths(current.get(id) ?? new Map(), next.get(id) ?? new Map()),
    );
  }
  return byContract;
}

function combineMonths(
  current: Map<number, number>,
  next: Map<number, number>,
): Map<number, MonthlyValues> {
  const byContract = new Map<number, MonthlyValues>();
  for (const id of new Set([...current.keys(), ...next.keys()])) {
    const currentMonth = current.get(id) ?? 0;
    const nextMonth = next.get(id) ?? 0;
    byContract.set(id, {
      currentMonth,
      nextMonth,
      change: nextMonth - currentMonth,
    });
  }
  return byContract;
}

// The fiscal-year start containing a month, computed from the month LABEL
// (mirroring fiscalYearOf) rather than a Date so local-timezone month starts
// cannot shift the FY at boundaries.
function fiscalYearStartOf(
  monthKey: string,
  fiscalConfig: FiscalConfig,
): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const fyYear = month >= fiscalConfig.startMonth ? year : year - 1;
  return `${fyYear}-${String(fiscalConfig.startMonth).padStart(2, '0')}-01`;
}

export interface MonthlyReportWindows {
  currentMonthKey: string;
  nextMonthKey: string;
  currentWindow: { from: string; to: string };
  nextWindow: { from: string; to: string };
}

/**
 * The two windows the report queries, exported because its async caller has to
 * prefetch FX for exactly this span before calling the (synchronous) engine —
 * and must not re-derive the fiscal anchoring to do it.
 *
 * Each month queries the same window SHAPE the budget chart uses for the FY
 * containing it — [that FY's start, start of the month after next) — with a
 * SHARED `to`, so widening `from` is the only difference from a month-anchored
 * window and the same-FY case collapses to one window.
 */
export function monthlyReportWindows(
  asOf: Date,
  fiscalConfig: FiscalConfig,
): MonthlyReportWindows {
  const currentMonthStart = startOfMonth(asOf);
  const currentMonthKey = format(currentMonthStart, 'yyyy-MM');
  const nextMonthKey = format(addMonths(currentMonthStart, 1), 'yyyy-MM');
  const horizonTo = format(addMonths(currentMonthStart, 2), 'yyyy-MM-01');
  return {
    currentMonthKey,
    nextMonthKey,
    currentWindow: {
      from: fiscalYearStartOf(currentMonthKey, fiscalConfig),
      to: horizonTo,
    },
    nextWindow: {
      from: fiscalYearStartOf(nextMonthKey, fiscalConfig),
      to: horizonTo,
    },
  };
}

/**
 * Per-contract current/next month spend for both report views, replacing the
 * per-contract extractAmortizedData/extractActualCostData walks over cached
 * minimal-mode price history.
 *
 * Each month queries the same window SHAPE the budget chart uses for the FY
 * containing it — [that FY's start, start of the month after next) at month
 * granularity — so the month's stale-invoice verdicts anchor where the
 * chart's do (QA 2026-08-05: a March invoice's defaulted amortization span
 * must keep contributing to the current month here exactly as it does in
 * the vetted chart; a month-anchored window called it stale and dropped
 * it). Anchoring per month also keeps the December straddle honest: January
 * answers with the NEXT fiscal year's anchor, matching that FY's chart.
 * Outside the straddle both months share one FY and therefore one window,
 * so both views still pay two queries total.
 *
 * Runs over the report's kept set with real lineage: superseded contributions
 * zero at their amendment cutoff (truncate + scale for straddles) instead of
 * the legacy full-contract exclusion, and linked-invoice / addendum handling
 * follows the resolver.
 */
export function buildMonthlyValuesByContract(
  enriched: ContractWithPricing[],
  relationships: RelationshipEdge[],
  fiscalConfig: FiscalConfig,
  asOf: Date,
  options: {
    // How the values are denominated. Stated by the caller because only it can
    // reach the org's base currency and prefetch the rates the engine looks up.
    currency: CurrencyPolicy;
    // Build the supersession/inheritance graph over this FULLER set while
    // querying only `enriched` — the querySpendHandler pattern: a family
    // member excluded from the kept set (a zero-fee amendment, a superseded
    // parent) still cuts and still donates its term.
    lineageSource?: ContractWithPricing[];
    // Confirmed lineage-event cancellation cutoffs (PSK-1830), resolved by
    // the async caller; merged into the supersession cutoffs earliest-wins.
    eventCutoffs?: Map<number, Map<number, Date>>;
  },
): MonthlyReportEngineValues {
  const { currentMonthKey, nextMonthKey, currentWindow, nextWindow } =
    monthlyReportWindows(asOf, fiscalConfig);

  const contracts: SpendContractInput[] = enriched.map((ec) => ec.contract);
  const lineage = buildSpendLineageFromEnriched(
    options.lineageSource ?? enriched,
    relationships,
    options.eventCutoffs,
  );

  // Every query here shares a horizon, so this holds the resolver to a single
  // pass per contract across all of them.
  const resolveSegments = memoizedSegmentResolver();

  const shared = {
    source: 'expected' as const,
    granularity: 'month' as const,
    currency: options.currency,
    fiscalConfig,
    asOf,
  };
  // Both denominations come from ONE query per basis: `value` is the policy's
  // figure, `nativeValue` the engine's per-contract stamp (absent only under
  // the legacy preconverted policy, where value IS the only figure there is).
  const baseOf = (item: SpendLineItem) => item.value;
  const nativeOf = (item: SpendLineItem) => item.nativeValue ?? item.value;

  const run = (basis: 'amortized' | 'actual') => {
    // The memoized resolver holds every query here to one segment pass per
    // contract; the product query re-slices only.
    const monthItems = (groupBy: 'contract' | 'product') => {
      const currentItems = querySpend(
        contracts,
        { ...shared, groupBy, basis, window: currentWindow },
        lineage,
        { resolveSegments },
      ).items;
      // December straddle only: the next month sits in the next FY and needs
      // its own anchor; the rest of the year both months share one window.
      const nextItems =
        nextWindow.from === currentWindow.from
          ? currentItems
          : querySpend(
              contracts,
              { ...shared, groupBy, basis, window: nextWindow },
              lineage,
              { resolveSegments },
            ).items;
      return { currentItems, nextItems };
    };

    const contractItems = monthItems('contract');
    const values = (valueOf: (item: SpendLineItem) => number) =>
      combineMonths(
        monthTotals(contractItems.currentItems, currentMonthKey, valueOf),
        monthTotals(contractItems.nextItems, nextMonthKey, valueOf),
      );

    const productItems = monthItems('product');
    const productValues = (valueOf: (item: SpendLineItem) => number) =>
      combineProductMonths(
        productMonthTotals(productItems.currentItems, currentMonthKey, valueOf),
        productMonthTotals(productItems.nextItems, nextMonthKey, valueOf),
      );

    return {
      base: values(baseOf),
      native: values(nativeOf),
      products: productValues(baseOf),
      productsNative: productValues(nativeOf),
    };
  };

  const amortized = run('amortized');
  const actual = run('actual');
  return {
    amortized: amortized.base,
    amortizedNative: amortized.native,
    amortizedProducts: amortized.products,
    amortizedProductsNative: amortized.productsNative,
    actual: actual.base,
    actualNative: actual.native,
    actualProducts: actual.products,
    actualProductsNative: actual.productsNative,
    currentMonthKey,
    nextMonthKey,
  };
}
