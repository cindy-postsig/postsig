import type { ContractWithPricing } from '@/lib/v2/core/types';
import {
  filterToBudgetContracts,
  filterForAggregation,
} from '@/lib/v2/core/filters';
import {
  querySpend,
  queryCommitments,
  memoizedSegmentResolver,
  buildSpendLineageFromEnriched,
  resolveWindow,
  enumeratePeriods,
  excludeStaleInvoices,
  formatUTCDate,
  lineageFor,
  type CurrencyPolicy,
  type FiscalConfig,
  type RelationshipEdge,
  type SpendContractInput,
  type SpendLineItem,
  type SpendWindow,
} from '@/lib/v2/spend';

export type BudgetExportMethod = 'amortized' | 'actual' | 'committed';

export const BUDGET_EXPORT_METHODS: BudgetExportMethod[] = [
  'amortized',
  'actual',
  'committed',
];

export interface BudgetExportValues {
  /** The chart's inclusion chain applied — one workbook row per entry. */
  kept: ContractWithPricing[];
  /** 24 `yyyy-MM` keys: current fiscal year then the next, in axis order. */
  months: string[];
  currentFiscalYear: number;
  values: Record<BudgetExportMethod, Map<number, Record<string, number>>>;
}

const WINDOWS = ['currentFY', 'nextFY'] as const;

/**
 * The two fiscal-year windows a workbook covers. Exported because the async
 * caller must prefetch FX for exactly this span before calling the
 * (synchronous) engine, and must not re-derive the historical-year rule.
 */
export function budgetExportWindows(fiscalYear?: number): SpendWindow[] {
  return fiscalYear === undefined
    ? [...WINDOWS]
    : [{ fiscalYear }, { fiscalYear: fiscalYear + 1 }];
}

function accumulate(
  target: Map<number, Record<string, number>>,
  items: SpendLineItem[],
) {
  for (const item of items) {
    const id = Number(item.groupKey);
    if (!Number.isFinite(id)) continue;
    const months = target.get(id) ?? {};
    months[item.period] = (months[item.period] ?? 0) + item.value;
    target.set(id, months);
  }
}

/**
 * Per-contract monthly values for the budget-chart export workbook — one
 * sheet per psk-1844 cost method, over the current and next fiscal years.
 *
 * Issues the exact queries the overview chart issues per method (month
 * granularity, groupBy contract, both FY windows), over the chart's exact
 * inclusion chain, so every workbook cell matches the chart the user just
 * looked at. Contract Term is the same start-dated commitments query as the
 * chart and the table stamps ('annual' valuation, term-start recognition —
 * product decision 2026-08-04).
 */
export function buildBudgetExportValues(
  enriched: ContractWithPricing[],
  relationships: RelationshipEdge[],
  fiscalConfig: FiscalConfig,
  asOf: Date,
  // How the workbook's amounts are denominated. Stated by the caller because
  // only it can reach the org's base currency and prefetch its rates.
  currency: CurrencyPolicy,
  // A historical selection exports [FY, FY+1] instead of [currentFY, nextFY],
  // mirroring the chart's two window toggles for that year.
  fiscalYear?: number,
  // Confirmed lineage-event cancellation cutoffs (PSK-1830), resolved by the
  // async caller; merged into the supersession cutoffs earliest-wins.
  eventCutoffs?: Map<number, Map<number, Date>>,
): BudgetExportValues {
  const windows = budgetExportWindows(fiscalYear);
  const firstWindow = resolveWindow(windows[0], asOf, fiscalConfig);

  // Stale invoices contribute nothing to either FY window (the engine skips
  // them per query), so drop their rows too — the workbook row set matches
  // the budget table's.
  let kept = excludeStaleInvoices(
    filterForAggregation(filterToBudgetContracts(enriched)),
    firstWindow.start,
  );
  const contracts: SpendContractInput[] = kept.map((ec) => ec.contract);
  // Lineage runs over the FULL enriched set: a filtered-out family member
  // still cuts its parent.
  const lineage = buildSpendLineageFromEnriched(
    enriched,
    relationships,
    eventCutoffs,
  );

  // All three methods share each window's horizon under term-start
  // recognition, so resolution costs one pass per contract per distinct
  // horizon.
  const resolveSegments = memoizedSegmentResolver();

  const values: BudgetExportValues['values'] = {
    amortized: new Map(),
    actual: new Map(),
    committed: new Map(),
  };
  const months: string[] = [];

  for (const window of windows) {
    const resolved = resolveWindow(window, asOf, fiscalConfig);
    months.push(
      ...enumeratePeriods(resolved.start, resolved.end, 'month', fiscalConfig),
    );

    const shared = {
      window,
      granularity: 'month' as const,
      groupBy: 'contract' as const,
      currency,
      fiscalConfig,
      asOf,
    };
    for (const basis of ['amortized', 'actual'] as const) {
      const result = querySpend(
        contracts,
        { ...shared, basis, source: 'expected' },
        lineage,
        { resolveSegments },
      );
      accumulate(values[basis], result.items);
    }
    const committed = queryCommitments(
      contracts,
      { ...shared, valuation: 'annual', recognition: 'term-start' },
      lineage,
      { resolveSegments },
    );
    accumulate(values.committed, committed.items);
  }

  if (fiscalYear !== undefined) {
    // Match the historical budget table's row set: only contracts with a
    // segment overlapping the selected FY keep a row (same overlap rule as
    // enrichWithEngineSpend's activeInWindow). Resolved explicitly rather than
    // read out of the memo, so a contract the queries skipped still gets a
    // real answer; the options match the first window's queries exactly, so
    // the memo hits and this costs nothing.
    const startIso = formatUTCDate(firstWindow.start);
    const endIso = formatUTCDate(firstWindow.end);
    kept = kept.filter((ec) =>
      resolveSegments(ec.contract, lineageFor(lineage, ec.id), {
        asOf,
        horizonStart: firstWindow.start,
        horizonEnd: firstWindow.end,
        currency,
      }).some((s) => s.from < endIso && s.to > startIso),
    );
  }

  return {
    kept,
    months,
    currentFiscalYear: resolveWindow('currentFY', asOf, fiscalConfig).fyNum,
    values,
  };
}
