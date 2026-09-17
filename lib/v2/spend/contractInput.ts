import type { RawContractOwnerRow } from '@/lib/v2/owners/types';

/**
 * One product-year row as the engine reads it: the fee it prices, the year it
 * prices, and the version trail that says whether that fee was hand-edited.
 * `convertedFees` is the pre-converted USD stamp the pipeline writes at cache
 * fill; `fees` is the original recorded amount (see FeeReadMode).
 */
export interface SpendProductInput {
  product_id: number;
  /** Which year of the term this row prices; absent means year 1. */
  year?: number;
  fees?: number;
  convertedFees?: number;
  /**
   * Books once, in its recorded year: never repeats across decision-#9 cycles
   * and never seeds renewal projections (psk-1492).
   */
  one_time_only?: boolean;
  /**
   * Fee edit history, read only by hasFeeOverrides: a hand-edited fee
   * suppresses annual_increase compounding. `changed_data` is absent on the
   * contract-set fetches, which filter the embed to fee edits in the query
   * instead of shipping the JSONB.
   */
  vendor_products_details_versions?: Array<{
    changed_data?: Record<string, unknown> | null;
  }>;
}

/**
 * Exactly what the spend engine reads off a contract row — nothing else.
 *
 * The engine used to take `Contract` (app/lib/budget/types), a legacy alias of
 * the full DB row that both omitted fields the engine reads and dragged a
 * retiring module into every consumer. This interface is the honest contract:
 * every field below is dereferenced somewhere in lib/v2/spend, and the shape is
 * loose enough that `Contract` and the enriched `ContractWithPricing.contract`
 * rows satisfy it structurally, with no cast at either end.
 *
 * It is also, deliberately, a superset of the smaller structural inputs the
 * engine hands to its collaborators — `HasFeeOverridesInput`
 * (products/transforms) and `InvoiceRelevanceSource` (invoiceRelevance) — so
 * those calls type-check directly.
 */
export interface SpendContractInput {
  /** Line-item group key, lineage lookup, and derivation/memo cache key. */
  id: number;

  /** groupBy 'vendor' key. */
  vendor_id?: number | null;
  /**
   * isInvoiceType gate: invoices project no renewals, book a single month when
   * they record no end date or term, go stale once their activity predates the
   * window, and carry the extra recorded* enrichment stamps.
   */
  type_id?: number | null;
  /**
   * 'inactive' caps the renewal horizon at the latest recorded term end — an
   * archived contract keeps its recorded terms but projects nothing past them.
   */
  status?: string | null;
  /** Stamped on every emitted segment; defaults to 'usd' when absent. */
  currency?: string | null;
  /** Billing cadence for the 'actual' basis (monthly/quarterly/…). */
  billing_frequency?: string | null;
  /** groupBy 'sponsor' keys, multi-valued (sponsorKeys). */
  contract_owners?: RawContractOwnerRow[] | null;

  /** Term identity, renewal cycle length, and the annual-fee-repeat rule. */
  subscription_term?: number | null;
  /** Renewal cycle length; also the cadence annual increases compound on. */
  renewal_period?: number | null;
  /** 'One-Time' emits no renewal projections at all. */
  renewal_type?: string | null;
  /** Suppresses projections when the initial term ends after asOf. */
  will_not_renew?: boolean | null;
  /** Rate compounded onto projected renewal fees. */
  annual_increase?: number | null;
  /** Months-based increase cadence; overrides the per-cycle increase count. */
  annual_increase_months?: number | null;

  /** Recorded term starts; the earliest one anchors the initial term. */
  term_start_date?: Array<{ date: string }> | null;
  /**
   * Recorded term ends; the earliest anchors the initial term, the latest caps
   * an inactive contract's projections.
   */
  term_end_date?: Array<{ date: string }> | null;
  /** Invoice date — one of the three dates invoice staleness judges on. */
  execution_date?: string | null;
  /**
   * Notice period in days. Dates a renewal at its cancel-by deadline rather
   * than its term start, and pads the projection horizon by the same offset so
   * a deadline inside the window cannot lose its term.
   */
  cancel_by_date?: number | null;

  /** The fee rows every segment is built from. */
  vendor_products_details: SpendProductInput[];
}

/**
 * The dated entries on a term-date column, or an empty list.
 *
 * Named for reading, not writing: invoice-sync has its own `termDateEntries`
 * that BUILDS the array from a date. This one is the opposite — it accepts
 * whatever the jsonb column happens to hold and hands back something safe to
 * walk.
 *
 * These are jsonb, so the column can hold anything the writer put there. The
 * Xero and Ramp invoice sync wrote `{ start }` / `{ end }` objects rather than
 * arrays for a while, and a bare `?? []` does not catch that — the object is
 * truthy, so iterating it threw and took the whole budget page down (psk-996).
 * Rows written before that fix are still in the database, so every reader goes
 * through here.
 */
export function readTermDateEntries(
  value: unknown,
): Array<{ date?: string | null }> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is { date?: string | null } => {
    if (typeof entry !== 'object' || entry === null) return false;
    const date = (entry as { date?: unknown }).date;
    return date == null || typeof date === 'string';
  });
}
