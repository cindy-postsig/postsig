/**
 * Extract budget information from a price history in a format compatible with the budget calculator.
 * This module handles the budget extraction logic from price history data.
 */

import { parseISO } from 'date-fns';
import { PriceHistory, PricePeriod, ProductDetail } from './types';
import {
  ProductData,
  findActivePeriodAndNextPeriod,
  calculateCurrentBudget,
  calculateProjectedBudget,
  createProductMapFromDetails,
  processProductsFromPeriods,
} from './priceHistoryUtils';

// Define return type for better type safety
export type BudgetResult = {
  currentProducts: ProductData[];
  currentYearProducts: ProductData[];
  projectedProducts: ProductData[];
  current: number;
  currentUSD: number;
  projected: number;
  projectedUSD: number;
  annualDifference: number;
  effectiveCurrentUSD?: number;
  effectiveProjectedUSD?: number;
  effectiveTcvUSD?: number;
  effectiveTcv?: number;
};

/**
 * Gets the default budget from raw product data when no periods are available
 */
function getDefaultProductBudget(
  vendorProductsDetails: ProductDetail[] = [],
): BudgetResult {
  const productMap = createProductMapFromDetails(vendorProductsDetails);
  const products = Array.from(productMap.values());

  // Sum up the fees for current budget (original and USD)
  const current = products.reduce((sum, p) => sum + p.fees, 0);
  const currentUSD = products.reduce(
    (sum, p) => sum + (p.convertedFees || p.fees),
    0,
  );

  return {
    currentProducts: products,
    currentYearProducts: products,
    projectedProducts: [],
    current,
    currentUSD,
    projected: 0,
    projectedUSD: 0,
    annualDifference: 0,
  };
}

/**
 * Extract budget information from a price history
 * This function takes a price history object and extracts current and projected budget information
 */
export function extractBudgetFromPriceHistory(
  priceHistory: PriceHistory,
): BudgetResult {
  // Default values
  const result: BudgetResult = {
    currentProducts: [],
    currentYearProducts: [],
    projectedProducts: [],
    current: 0,
    currentUSD: 0,
    projected: 0,
    projectedUSD: 0,
    annualDifference: 0,
  };

  // Get vendor product details from price history
  const vendorProductDetails = priceHistory.vendorProductDetails || [];

  // Handle cases with no periods or no proper data
  if (!priceHistory.periods.length) {
    return getDefaultProductBudget(vendorProductDetails);
  }

  // Get current term periods
  const currentTermPeriods = priceHistory.periods.filter(
    (p) => p.isCurrentTerm,
  );

  // If no current term periods, fall back to default products
  if (currentTermPeriods.length === 0) {
    return getDefaultProductBudget(vendorProductDetails);
  }

  const currentActivePeriods = priceHistory.periods.filter(
    (p) => p.isActivePeriod,
  );

  const nextActivePeriod = priceHistory.periods.filter(
    (p) =>
      p.termIndex === currentActivePeriods[0]?.termIndex &&
      p.yearWithinTerm === currentActivePeriods[0]?.yearWithinTerm + 1, // get next immediate period if possible
  )[0];

  const nextActiveRenewal = priceHistory.periods.filter(
    (p) => p.termIndex === currentActivePeriods[0]?.termIndex + 1, // get next renewal period
  )[0];

  const nextPeriodToUse = nextActivePeriod || nextActiveRenewal;

  // Process products from current term
  const currentTermProductsMap = processProductsFromPeriods(
    currentTermPeriods,
    vendorProductDetails,
  );
  result.currentProducts = Array.from(currentTermProductsMap.values());

  // Process products from current period year
  if (currentActivePeriods) {
    const currentPeriodProductsMap = processProductsFromPeriods(
      currentActivePeriods,
      vendorProductDetails,
    );
    result.currentYearProducts = Array.from(currentPeriodProductsMap.values());
  }

  // Store both original and USD values
  // Check if we have an active period before accessing its properties
  if (currentActivePeriods && currentActivePeriods.length > 0) {
    result.current = currentActivePeriods[0].fees;
    result.currentUSD = currentActivePeriods[0].feesUSD;
    result.effectiveCurrentUSD =
      currentActivePeriods[0].effectiveFeesUSD ?? result.currentUSD;
  }

  // Check if we have a next period before accessing its properties
  if (nextPeriodToUse) {
    result.projected = nextPeriodToUse.fees;
    result.projectedUSD = nextPeriodToUse.feesUSD;
    result.effectiveProjectedUSD =
      nextPeriodToUse.effectiveFeesUSD ?? result.projectedUSD;

    // Extract per-product fees from the projected period
    const projectedProductsMap = processProductsFromPeriods(
      [nextPeriodToUse],
      vendorProductDetails,
    );
    result.projectedProducts = Array.from(projectedProductsMap.values());
  }

  // Effective TCV: sum effective fees across all current term periods
  // Only set if any period has effectiveFeesUSD (avoids overriding raw TCV when no amendments)
  const hasEffectiveFees = currentTermPeriods.some(
    (p) => p.effectiveFeesUSD != null,
  );
  if (hasEffectiveFees) {
    result.effectiveTcvUSD = currentTermPeriods.reduce(
      (sum, p) => sum + (p.effectiveFeesUSD ?? p.feesUSD ?? p.fees ?? 0),
      0,
    );
    result.effectiveTcv = currentTermPeriods.reduce(
      (sum, p) => sum + (p.effectiveFees ?? p.fees ?? 0),
      0,
    );
  }

  // Calculate annual difference if both values exist
  // Use effective USD values (which exclude superseded fees) when available
  const effectiveCurrent = result.effectiveCurrentUSD ?? result.currentUSD;
  const effectiveProjected =
    result.effectiveProjectedUSD ?? result.projectedUSD;
  if (effectiveCurrent > 0 && effectiveProjected > 0) {
    result.annualDifference =
      Math.round(
        ((effectiveProjected - effectiveCurrent) / effectiveCurrent) * 1000,
      ) / 10;
  } else if (result.current > 0 && result.projected > 0) {
    result.annualDifference =
      Math.round(
        ((result.projected - result.current) / result.current) * 1000,
      ) / 10;
  }

  return result;
}
