/**
 * Budget Calculation Functions
 *
 * Core functions for calculating budget totals from enriched contracts.
 * Includes utilities for handling superseded products and aggregations.
 */

import { ContractWithPricing, ProductWithPricing } from './types';
import {
  filterToBudgetContracts,
  filterForAggregation,
} from '@/lib/v2/core/filters';
import { excludeStaleInvoices } from '@/lib/v2/spend/invoiceRelevance';
import { extractBudgetFromPriceHistory } from '@/app/lib/budget';

// =============================================================================
// Aggregation Utilities
// =============================================================================

/**
 * Check if a contract should be excluded from aggregations.
 * True if all products are superseded by another contract (parent replaced by amendment).
 */
export function shouldExcludeFromAggregations(
  contract: ContractWithPricing,
): boolean {
  if (contract.products.length === 0) return false;
  return contract.products.every((p) => p.isSuperseded);
}

/**
 * Get products that should contribute to fee sums.
 * Excludes superseding products (their fees are already counted in the parent contract).
 */
export function getContributingProducts(
  products: ProductWithPricing[],
): ProductWithPricing[] {
  return products.filter((p) => !p.isSuperseding);
}

/**
 * Get the effective fee for a product.
 * Uses effectiveFeeUSD which includes merged amendment fees for superseded products.
 */
export function getEffectiveFee(product: ProductWithPricing): number {
  return product.effectiveFeeUSD ?? product.currentFeeUSD ?? 0;
}

/**
 * Get the effective total contract value for a contract.
 * Uses effectiveTotalContractValueUSD which accounts for amendment fees.
 */
export function getEffectiveTCV(contract: ContractWithPricing): number {
  const ph = contract.priceHistory;
  if (!ph) return 0;
  if (ph.periods?.length) {
    const budgetInfo = extractBudgetFromPriceHistory(ph);
    if (budgetInfo?.effectiveTcvUSD != null) {
      return budgetInfo.effectiveTcvUSD;
    }
  }
  return ph.totalContractValueUSD ?? ph.totalContractValue ?? 0;
}

/**
 * Universal function to sum values in USD, respecting amendment/lineage status.
 * Excludes fully superseded items always, and by default any invoice the
 * reviewer has not opted into overall spend.
 *
 * Invoice-only views (e.g. /contracts/invoices) report on the invoices
 * themselves rather than on overall spend, so they count every invoice whether
 * or not apply_to_overall_spend is set. Pass `{ includeLinkedChildInvoices:
 * true }` to opt in to that behavior.
 */
export function sumValuesInUSD<T>(
  items: T[],
  getValue: (item: T) => number,
  options: { includeLinkedChildInvoices?: boolean } = {},
): number {
  const { includeLinkedChildInvoices = false } = options;
  return items.reduce((sum, item: any) => {
    if (!includeLinkedChildInvoices && item.excludedFromOverallSpend)
      return sum;

    const isFullySuperseded =
      item.isFullySuperseded ||
      (item.products?.length > 0 &&
        item.products.every((p: any) => p.isSuperseded));

    if (isFullySuperseded) return sum;

    return sum + getValue(item);
  }, 0);
}

/**
 * Helper to get USD value from a row or contract by field name.
 */
export function getUSDValue(item: any, field: string): number {
  // Engine values win wherever the fetch boundary stamped them; rows built
  // before that stage (or in tests) fall through to the legacy reads below.
  if (item.engineSpend) {
    const engine = item.engineSpend as {
      currentBase: number;
      projectedBase: number;
    };
    if (field === 'currentBudget' || field === 'current')
      return engine.currentBase;
    if (field === 'projectedBudget' || field === 'projected')
      return engine.projectedBase;
  }

  if (item.priceHistory) {
    const ph = item.priceHistory;
    if (field === 'totalContractValue' || field === 'tcv') {
      if (ph.periods?.length) {
        const budgetInfo = extractBudgetFromPriceHistory(ph) || {};
        if (budgetInfo.effectiveTcvUSD != null) {
          return budgetInfo.effectiveTcvUSD;
        }
      }
      return ph.totalContractValueUSD ?? ph.totalContractValue ?? 0;
    }
    if (field === 'currentBudget' || field === 'current') {
      const budgetInfo = extractBudgetFromPriceHistory(ph) || {};
      return budgetInfo.effectiveCurrentUSD ?? budgetInfo.currentUSD ?? 0;
    }
    if (field === 'projectedBudget' || field === 'projected') {
      const budgetInfo = extractBudgetFromPriceHistory(ph) || {};
      return budgetInfo.effectiveProjectedUSD ?? budgetInfo.projectedUSD ?? 0;
    }
  }

  if (field === 'totalContractValue' || field === 'tcv') {
    if (item.effectiveTotalContractValueUSD != null) {
      return item.effectiveTotalContractValueUSD;
    }
    return item.convertedTotalContractValue || item.totalContractValue || 0;
  }
  if (field === 'currentBudget' || field === 'current') {
    if (item.effectiveCurrentBudgetUSD != null) {
      return item.effectiveCurrentBudgetUSD;
    }
    return item.convertedCurrentBudget || item.currentBudget || 0;
  }
  if (field === 'projectedBudget' || field === 'projected') {
    if (item.effectiveProjectedBudgetUSD != null) {
      return item.effectiveProjectedBudgetUSD;
    }
    return item.convertedProjectedBudget || item.projectedBudget || 0;
  }

  const convertedField = `converted${field.charAt(0).toUpperCase()}${field.slice(1)}`;
  return item[convertedField] || item[field] || 0;
}

// =============================================================================
// Per-Contract Budget Values
// =============================================================================

export interface ContractBudgetValues {
  currentUSD: number;
  projectedUSD: number;
  tcvUSD: number;
}

/**
 * Compute per-contract budget values in USD.
 * For multi-product contracts, sums per-product fees (matching budget table behavior).
 * For single-product contracts, uses period-level values from price history.
 */
export function computeContractBudgetValues(
  contract: ContractWithPricing,
): ContractBudgetValues {
  if (contract.engineSpend) {
    const { currentBase, projectedBase } = contract.engineSpend;
    return {
      currentUSD: currentBase,
      projectedUSD: projectedBase,
      tcvUSD: getEffectiveTCV(contract),
    };
  }

  const ph = contract.priceHistory;
  const budgetInfo = ph ? extractBudgetFromPriceHistory(ph) : null;
  const tcvUSD = getEffectiveTCV(contract);

  if (contract.products.length <= 1 || !budgetInfo) {
    return {
      currentUSD:
        budgetInfo?.effectiveCurrentUSD ?? budgetInfo?.currentUSD ?? 0,
      projectedUSD:
        budgetInfo?.effectiveProjectedUSD ?? budgetInfo?.projectedUSD ?? 0,
      tcvUSD,
    };
  }

  // Multi-product: sum per-product fees (same logic as buildContractTableRows)
  // Prefer projectedProducts (from the next period) for accurate annual increase
  const projectedProductsList = budgetInfo.projectedProducts?.length
    ? budgetInfo.projectedProducts
    : budgetInfo.currentProducts || [];
  const projectedProductsMap = new Map<number, any>(
    projectedProductsList.map((p: any) => [p.product_id, p]),
  );

  let currentUSD = 0;
  let projectedUSD = 0;
  for (const product of contract.products) {
    // Skip superseded products (struck out in UI — fee replaced by amendment)
    if (product.isSuperseded) continue;
    currentUSD += product.currentFeeUSD || 0;
    // A one-time product books nothing beyond its recorded year (psk-1492):
    // it is absent from projected periods, and the absent-entry fallback
    // below must not revive its fee as a projection.
    if (product.one_time_only) continue;
    const proj = projectedProductsMap.get(product.product_id);
    projectedUSD += proj?.compoundedFees
      ? parseFloat(String(proj.compoundedFees))
      : product.effectiveFeeUSD || 0;
  }

  return { currentUSD, projectedUSD, tcvUSD };
}

// =============================================================================
// Budget Calculations
// =============================================================================

export interface BudgetSummary {
  totalContracts: number;
  totalVendors: number;
  tcv: number;
  currentSpend: number;
  projectedSpend: number;
  priceHistories: any[];
  // The enriched rows behind priceHistories, for consumers that read engine
  // stamps per contract (top-vendor aggregation) rather than legacy history.
  aggregatableContracts: ContractWithPricing[];
}

export interface BudgetTotals {
  currentTotal: number;
  projectedTotal: number;
  totalContractValue: number;
}

/**
 * Calculate budget totals from enriched contracts.
 * Uses universal sumValuesInUSD to handle superseded filtering and USD conversion.
 */
export function calculateBudgetTotals(
  contracts: ContractWithPricing[],
): BudgetTotals {
  // Use universal sum function for all totals
  const totalContractValue = sumValuesInUSD(contracts, (c) =>
    getEffectiveTCV(c),
  );
  const currentTotal = sumValuesInUSD(contracts, (c) =>
    getUSDValue(c, 'currentBudget'),
  );
  const projectedTotal = sumValuesInUSD(contracts, (c) =>
    getUSDValue(c, 'projectedBudget'),
  );

  return {
    currentTotal,
    projectedTotal,
    totalContractValue,
  };
}

/**
 * Sum contract values in USD, filtering superseded products.
 * Replacement for the legacy sumContractValuesInUSD that doesn't filter superseded.
 */
export function sumContractValuesInUSD(
  contracts: ContractWithPricing[],
  valueField: 'current' | 'projected' | 'total' = 'total',
): number {
  const totals = calculateBudgetTotals(contracts);

  switch (valueField) {
    case 'current':
      return totals.currentTotal;
    case 'projected':
      return totals.projectedTotal;
    case 'total':
      return totals.totalContractValue;
    default:
      return totals.totalContractValue;
  }
}

export function isActiveContract(ec: ContractWithPricing): boolean {
  const contract = ec.contract;
  if (contract.status_id !== 4) return false;
  if (contract.status === 'inactive') return false;
  return !['ai_failed', 'h_failed'].includes(contract.ai_extraction_status);
}

/**
 * Build budget summary from enriched contracts.
 * Returns totals, counts, and price histories for dashboard/budget pages.
 *
 * `staleInvoiceCutoff` (normally the current FY start) drops invoices whose
 * activity — the later of invoice date and billing-period end — predates it
 * from the TOTALS and price histories, matching the budget table's row set.
 * Contract/vendor COUNTS are unaffected: a past invoice is still a real
 * contract, it just no longer contributes spend. Omit it to keep the legacy
 * behavior (the spend-compare page pins legacy output deliberately).
 */
export function buildBudgetSummary(
  allContracts: ContractWithPricing[],
  options: { staleInvoiceCutoff?: Date } = {},
): BudgetSummary {
  const activeContracts = allContracts.filter(isActiveContract);
  const totalContracts = activeContracts.length;

  // Filter to budget-relevant contracts using pure filter
  const relevant = filterToBudgetContracts(allContracts);
  const budgetContracts = options.staleInvoiceCutoff
    ? excludeStaleInvoices(relevant, options.staleInvoiceCutoff)
    : relevant;

  // Calculate totals
  const budgetTotals = calculateBudgetTotals(budgetContracts);

  // Count unique vendors from all active contracts (including 0 fee)
  const totalVendors = new Set(
    activeContracts.filter((ec) => ec.vendor_id).map((ec) => ec.vendor_id),
  ).size;

  // Get price histories for chart - use centralized aggregation filter
  // This excludes linked child invoices and fully superseded contracts
  const aggregatableContracts = filterForAggregation(budgetContracts);
  const priceHistories = aggregatableContracts.map((ec) => ec.priceHistory);

  return {
    totalContracts,
    totalVendors,
    tcv: budgetTotals.totalContractValue,
    currentSpend: budgetTotals.currentTotal,
    projectedSpend: budgetTotals.projectedTotal,
    priceHistories,
    aggregatableContracts,
  };
}
