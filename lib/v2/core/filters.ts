/**
 * V2 Contract Filters
 *
 * Composable, typed filter functions for contracts.
 *
 * Status filtering note:
 * - status_id = 4 means "Published" (from contract_statuses table)
 * - status (string) = 'active'/'inactive'/'unconfirmed' (contract_status enum)
 * These are two different fields. We filter by status_id for "published" contracts.
 */

import { isInvoiceType } from '@/app/lib/constants';

/** Status ID for "Published" contracts (from contract_statuses table) */
const PUBLISHED_STATUS_ID = 4;

// Base contract type for filters
interface FilterableContract {
  id: number;
  status?: string;
  contract_status?: number;
  status_id?: number;
  type_id?: number;
  ai_extraction_status?: string;
  term_start_date?: Array<{ date: string }>;
  term_end_date?: Array<{ date: string }>;
  cancel_date?: Array<{ date: string }>;
  contract?: {
    status?: string;
    status_id?: number;
    type_id?: number;
    term_start_date?: Array<{ date: string }>;
    term_end_date?: Array<{ date: string }>;
    cancel_date?: Array<{ date: string }>;
  };
}

// ============================================================================
// STATUS FILTERS
// ============================================================================

/**
 * Filter to published contracts only (status_id = 4).
 * This is the primary filter for showing "active" contracts in the UI.
 */
export function filterActiveContracts<T extends FilterableContract>(
  contracts: T[],
): T[] {
  return contracts.filter((c) => {
    const statusId = c.contract_status ?? c.status_id ?? c.contract?.status_id;
    return statusId === PUBLISHED_STATUS_ID;
  });
}

/**
 * Filter out contracts with failed AI extraction. These rows belong to the
 * internal ai_extraction_status lifecycle (separate from the user-facing
 * `status`) and are unsafe to surface anywhere except the failed-uploads
 * page — fields are typically null/garbage.
 */
export function filterExcludeAIFailed<T extends FilterableContract>(
  contracts: T[],
): T[] {
  return contracts.filter(
    (c) => !['ai_failed', 'h_failed'].includes(c.ai_extraction_status || ''),
  );
}

/**
 * Apply default filters for most views: published + exclude AI failed.
 * This is the baseline filtering you typically want.
 */
export function applyDefaultFilters<T extends FilterableContract>(
  contracts: T[],
): T[] {
  return filterExcludeAIFailed(filterActiveContracts(contracts));
}

/**
 * Filter out invoice contracts (regular and Exchange Agreement). Invoices should
 * only surface in the Invoices / Pending / Archived sub-views and the Invoice
 * Discrepancy Report — every other list view should exclude them.
 *
 * Keyed on type_id (not isLinkedChildInvoice) so unlinked/standalone invoices
 * are excluded too. Handles both raw base rows (top-level type_id) and enriched
 * contracts (nested contract.type_id).
 */
export function filterExcludeInvoices<T extends FilterableContract>(
  contracts: T[],
): T[] {
  return contracts.filter((c) => {
    const typeId = c.type_id ?? c.contract?.type_id;
    return !isInvoiceType(typeId);
  });
}

// ============================================================================
// DATE FILTERS
// ============================================================================

/**
 * Helper to check if a date array contains a date in range
 */
function hasDateInRange(
  dateArray: Array<{ date: string }> | null | undefined,
  start: Date,
  end: Date,
): boolean {
  if (!dateArray || !Array.isArray(dateArray)) return false;
  return dateArray.some((dateObj) => {
    if (!dateObj?.date) return false;
    const date = new Date(dateObj.date);
    return date >= start && date <= end;
  });
}

export interface DateRangeResult<T> {
  uniqueData: T[];
  startDateContracts: T[];
  endDateContracts: T[];
  cancelDateContracts: T[];
}

/**
 * Filter contracts by date range for calendar views.
 * Returns contracts grouped by date type (start, end, cancel).
 */
export function filterByDateRange<T extends FilterableContract>(
  contracts: T[],
  startDate: string,
  endDate: string,
): DateRangeResult<T> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const getDateArray = (
    c: T,
    field: 'term_start_date' | 'term_end_date' | 'cancel_date',
  ) => {
    return c[field] ?? c.contract?.[field];
  };

  const startDateContracts = contracts.filter((c) =>
    hasDateInRange(getDateArray(c, 'term_start_date'), start, end),
  );

  const endDateContracts = contracts.filter((c) =>
    hasDateInRange(getDateArray(c, 'term_end_date'), start, end),
  );

  const cancelDateContracts = contracts.filter((c) =>
    hasDateInRange(getDateArray(c, 'cancel_date'), start, end),
  );

  // Get unique contracts
  const uniqueContractIds = new Set([
    ...startDateContracts.map((c) => c.id),
    ...endDateContracts.map((c) => c.id),
    ...cancelDateContracts.map((c) => c.id),
  ]);

  const uniqueData = contracts.filter((c) => uniqueContractIds.has(c.id));

  return {
    uniqueData,
    startDateContracts,
    endDateContracts,
    cancelDateContracts,
  };
}

// ============================================================================
// BUDGET FILTERS
// ============================================================================

// Enriched contract type for budget filter
interface BudgetFilterableContract extends FilterableContract {
  isLinkedChildInvoice?: boolean;
  excludedFromOverallSpend?: boolean;
  vendor_id?: number | null;
  priceHistory?: {
    annualContractValue?: number;
    annualContractValueUSD?: number;
  };
  contract?: FilterableContract['contract'] & {
    vendor_id?: number | null;
    vendors?: unknown;
    vendor_products_details?: Array<{ fees?: number | string }>;
  };
}

/**
 * Filter enriched contracts to budget-relevant ones.
 * Filters to: published status, has vendor, has positive fees, and — for
 * invoices — an explicit apply_to_overall_spend.
 *
 * NOTE: This filter is designed to work with ENRICHED contracts (ContractWithPricing).
 * It uses priceHistory.annualContractValue for fee checking, which is more accurate
 * than raw vendor_products_details because it accounts for price history calculations.
 */
export function filterToBudgetContracts<T extends BudgetFilterableContract>(
  contracts: T[],
): T[] {
  return contracts.filter((ec) => {
    // An invoice contributes only when a reviewer set apply_to_overall_spend.
    // This replaces the old "exclude it if it has a parent" rule, which both
    // double-counted invoices whose parent had been archived and gave the
    // reviewer no say.
    if (ec.excludedFromOverallSpend) return false;

    const contract = ec.contract;
    if (!contract) return false;

    // Must be published
    if (contract.status_id !== PUBLISHED_STATUS_ID) return false;
    // Must have a vendor
    if (!contract.vendor_id || !contract.vendors) return false;

    // Must have positive fees - prefer enriched priceHistory if available
    if (ec.priceHistory) {
      const annualValue =
        ec.priceHistory.annualContractValueUSD ??
        ec.priceHistory.annualContractValue ??
        0;
      return annualValue > 0;
    }

    // Fallback to raw vendor_products_details (for non-enriched contracts)
    const totalFees =
      contract.vendor_products_details?.reduce((sum: number, detail) => {
        const raw = detail?.fees;
        const fee =
          typeof raw === 'number'
            ? raw
            : parseFloat(String(raw).replace(/[^0-9.-]/g, ''));
        return sum + (Number.isFinite(fee) ? fee : 0);
      }, 0) || 0;

    return totalFees > 0;
  });
}

// ============================================================================
// AGGREGATION EXCLUSION FILTERS
// ============================================================================

/**
 * Type for contracts that may have aggregation-relevant fields
 */
interface AggregationFilterableContract {
  excludedFromOverallSpend?: boolean;
  isFullySuperseded?: boolean;
  products?: Array<{ isSuperseded?: boolean }>;
}

/**
 * Filter out contracts that should be excluded from financial aggregations.
 * Excludes:
 * - Invoices without apply_to_overall_spend
 * - Fully superseded contracts (all products replaced by amendments)
 *
 * Use this when calculating totals, sums, or aggregations to avoid double-counting.
 */
export function filterForAggregation<T extends AggregationFilterableContract>(
  contracts: T[],
): T[] {
  return contracts.filter((c) => {
    // Invoices the reviewer has not opted into overall spend (psk-996)
    if (c.excludedFromOverallSpend) return false;

    // Exclude fully superseded contracts
    if (c.isFullySuperseded) return false;
    // Defensive: also check if all products are superseded (in case isFullySuperseded not set)
    if (
      c.products &&
      c.products.length > 0 &&
      c.products.every((p) => p.isSuperseded)
    ) {
      return false;
    }

    return true;
  });
}
