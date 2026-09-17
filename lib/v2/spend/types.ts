import type { AllocationLevel } from './allocation';

export interface FeeSegment {
  productId: number;
  from: string;
  // Half-open interval: `to` is EXCLUSIVE, so a boundary date lands in exactly
  // one window and window sums stay additive.
  to: string;
  // Under the 'preconverted-usd' currency policy this value is already USD.
  fee: number;
  currency: string;
  source:
    | 'year-entry'
    | 'compounded-increase'
    | 'manual-override'
    | 'amendment'
    | 'renewal-projection';
  confidence: 'explicit' | 'inferred';
  // Required when confidence === 'inferred'; feeds the integrity report.
  reason?: string;
  // Start of the term this segment belongs to (ISO). All slices of one term
  // share it — committed segments carry the recorded span's start, projected
  // segments their cycle's — so the event queries (queryRenewals /
  // queryCommitments) rebuild term events without re-running decoder
  // heuristics.
  termStart?: string;
}

/**
 * Prefetched FX for the 'base' currency policy. The engine is pure and
 * synchronous: a caller fetches every rate a query can need and hands this
 * interface in, so the engine only ever LOOKS UP a rate — it never fetches one.
 * Both methods return a multiplier INTO the policy's target currency.
 */
export interface SpendRateProvider {
  /** Multiplier converting `from`-denominated amounts into the target currency for the calendar month 'YYYY-MM'. */
  monthRate(from: string, monthKey: string): number;
  /** Multiplier converting `from`-denominated amounts into the target currency at the ISO date 'yyyy-MM-dd'. */
  dateRate(from: string, isoDate: string): number;
}

export type CurrencyPolicy =
  | { mode: 'preconverted-usd' }
  // Per-contract native read: the resolver takes each product's original
  // recorded `fees` instead of the pre-converted USD stamp. Restricted to
  // contract/product grouping — summing native amounts across differently
  // denominated contracts is meaningless, so cross-contract aggregation uses
  // 'base' (or 'preconverted-usd') instead.
  //
  // The org's base display currency (USD or EUR today): 'base' resolves the
  // NATIVE fees, then converts them with basis-appropriate historical FX —
  // amortized/actual at each calendar month's rate, committed and the event
  // views at the term's start-date rate. Groupable across contracts under
  // EVERY groupBy, because conversion happens before accumulation, so what the
  // accumulator sums is already one currency.
  | { mode: 'native' }
  | { mode: 'base'; target: string; rates: SpendRateProvider };

export type SpendBasis = 'committed' | 'amortized' | 'actual';

// Only 'expected' (term-math) exists today; 'invoiced' is the reserved second
// source that reuses the same bases once invoice storage lands.
export type SpendSource = 'expected';

export type SpendWindow =
  | { fiscalYear: number }
  | 'currentFY'
  | 'nextFY'
  // Arbitrary range, half-open [from, to).
  | { from: string; to: string };

export type SpendGranularity = 'month' | 'quarter' | 'year';

export interface FiscalConfig {
  // 1 = January .. 12 = December. Org-configurable; no engine default — the
  // caller states the org's fiscal year explicitly on every query.
  startMonth: number;
}

// The allocation dimension keys on cost-allocation targets rolled up to
// `level` (a tree level, 'cost_center', or 'user'); its resolved map enters
// through SpendQueryOptions.allocations, never through the contract rows.
export type SpendGroupBy =
  | 'total'
  | 'vendor'
  | 'contract'
  | 'product'
  | 'sponsor'
  | { kind: 'allocation'; level: AllocationLevel };

// Amortized only; the engine rejects it with any other basis.
export type SpendProration = 'daily' | 'monthly';

export interface SpendQuery {
  basis: SpendBasis;
  source: SpendSource;
  window: SpendWindow;
  // Quarters are fiscal quarters; years are fiscal years.
  granularity: SpendGranularity;
  groupBy: SpendGroupBy;
  proration?: SpendProration;
  currency: CurrencyPolicy;
  // The org's fiscal year, stated by the caller — never inferred from the
  // contract rows and never silently defaulted.
  fiscalConfig: FiscalConfig;
  // "Today" as an explicit input; the engine never reads the clock.
  asOf: Date;
  explain?: boolean;
}

export interface SpendExplainEntry {
  segment: FeeSegment;
  detail: string;
}

export interface SpendLineItem {
  // Bucket key encoding the period (e.g. '2026-07' for a month).
  period: string;
  // groupBy dimension key; 'total' when groupBy is 'total'.
  groupKey: string;
  // Reported in the query's currency policy (USD under 'preconverted-usd').
  value: number;
  /**
   * The same amount in `nativeCurrency` — the denomination the bucket's
   * contracts are actually priced in. Present exactly when the bucket is
   * denominationally coherent: every contribution came from one currency, so
   * the pre-conversion sum still means something. A per-contract or
   * per-product bucket always qualifies; a vendor/sponsor/total bucket
   * qualifies only when everything in it shares a currency. Mixed buckets
   * carry no native figure — there is no currency to state one in — and
   * 'preconverted-usd' queries never do, because that legacy policy resolves
   * pre-converted stamps and the original amounts are simply not present.
   *
   * This is the display rule from PSK-1796 made structural: a single contract
   * shows unconverted; only genuine cross-currency aggregates convert.
   */
  nativeValue?: number;
  /** Uppercase ISO code `nativeValue` is denominated in. */
  nativeCurrency?: string;
  explain?: SpendExplainEntry[];
}

export interface SpendResult {
  basis: SpendBasis;
  currency: CurrencyPolicy;
  items: SpendLineItem[];
}

// Shared by the sibling queries queryRenewals / queryTCV (design decision #3):
// event views over the same FeeSegment[], reusing the window / groupBy /
// currency machinery but with no basis or proration axis.
export interface SpendEventQuery {
  window: SpendWindow;
  granularity: SpendGranularity;
  groupBy: SpendGroupBy;
  currency: CurrencyPolicy;
  fiscalConfig: FiscalConfig;
  asOf: Date;
}

export interface SpendEventResult {
  currency: CurrencyPolicy;
  items: SpendLineItem[];
}
