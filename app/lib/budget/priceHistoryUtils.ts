/**
 * Shared utilities for price history and budget calculations
 * This file contains common functions used across price history generation and budget extraction
 */

import { parseISO, format, isAfter, isBefore } from 'date-fns';
import { PricePeriod, ProductDetail } from './types';

/**
 * Core function to identify an active period based on the current date
 * This is the fundamental logic used by other period-finding functions
 */
export function findActivePeriodByDate(
  periods: PricePeriod[],
  referenceDate: Date = new Date(), // Defaults to today
): PricePeriod | undefined {
  if (!periods.length) return undefined;

  // Find a period that contains the reference date
  const activePeriod = periods.find((period) => {
    const startDate = parseISO(period.startDate);
    const endDate = parseISO(period.endDate);
    return startDate <= referenceDate && endDate >= referenceDate;
  });

  // If no period contains the reference date, default to the first future period
  if (!activePeriod) {
    const futurePeriods = periods
      .filter((p) => parseISO(p.startDate) > referenceDate)
      .sort(
        (a, b) =>
          parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime(),
      );

    return futurePeriods[0];
  }

  return activePeriod;
}

/**
 * Finds the active period and the next period within the current term
 * Focuses on finding the next year within the same term
 */
export function findActivePeriodAndNextPeriod(periods: PricePeriod[]): {
  activePeriod?: PricePeriod;
  nextPeriod?: PricePeriod;
} {
  if (!periods.length)
    return { activePeriod: undefined, nextPeriod: undefined };

  // Use the core function to find the active period
  const activePeriod = findActivePeriodByDate(periods);

  // If no active period was found, use the first period sorted by date
  if (!activePeriod) {
    const sortedByStartDate = [...periods].sort(
      (a, b) =>
        parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime(),
    );
    return {
      activePeriod: sortedByStartDate[0],
      nextPeriod:
        sortedByStartDate.length > 1 ? sortedByStartDate[1] : undefined,
    };
  }

  // Find the next year within the SAME TERM
  // Current term periods should all have the same termIndex, and increasing yearWithinTerm
  const currentYear = activePeriod.yearWithinTerm;
  const termIndex = activePeriod.termIndex;

  // Look for a period in the same term with the next yearWithinTerm
  const nextPeriod = periods.find(
    (p) => p.termIndex === termIndex && p.yearWithinTerm === currentYear + 1,
  );

  return { activePeriod, nextPeriod };
}

/**
 * Calculates the current budget value based on available periods
 * Returns both original currency and USD values
 */
export function calculateCurrentBudget(
  currentFYPeriods: PricePeriod[],
  currentTermPeriods: PricePeriod[],
): { original: number; usd: number } {
  // Prefer current fiscal year periods if available
  if (currentFYPeriods.length > 0) {
    return {
      original: currentFYPeriods.reduce((sum, p) => sum + p.fees, 0),
      usd: currentFYPeriods.reduce((sum, p) => sum + (p.feesUSD || p.fees), 0),
    };
  }

  // Otherwise use first year of current term
  const firstYearCurrentTerm = currentTermPeriods.find(
    (p) => p.yearWithinTerm === 1,
  );

  return {
    original: firstYearCurrentTerm?.fees || 0,
    usd: firstYearCurrentTerm?.feesUSD || firstYearCurrentTerm?.fees || 0,
  };
}

/**
 * Calculates the projected budget based on available periods
 * Returns both original currency and USD values
 */
export function calculateProjectedBudget(
  nextPeriodInCurrentTerm?: PricePeriod,
  projectedPeriods: PricePeriod[] = [],
): { original: number; usd: number } {
  // Priority order for projected value
  if (nextPeriodInCurrentTerm) {
    return {
      original: nextPeriodInCurrentTerm.fees,
      usd: nextPeriodInCurrentTerm.feesUSD || nextPeriodInCurrentTerm.fees,
    };
  }

  if (projectedPeriods.length > 0) {
    const sortedProjectedPeriods = [...projectedPeriods].sort(
      (a, b) =>
        parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime(),
    );
    return {
      original: sortedProjectedPeriods[0].fees,
      usd: sortedProjectedPeriods[0].feesUSD || sortedProjectedPeriods[0].fees,
    };
  }

  return { original: 0, usd: 0 };
}

/**
 * Marks the period that contains today's date with isActivePeriod=true
 * This identifies exactly one period (or none) as the active period
 * Falls back to current term if no active period is found
 */
export function markActivePeriod(
  periods: PricePeriod[],
  today: Date = new Date(),
  currentStartDate?: string, // Latest term start date from the database
): void {
  if (!periods.length) return;

  // First, reset all periods' isActivePeriod flag
  periods.forEach((period) => {
    period.isActivePeriod = false;
  });

  // Find the period that contains today's date
  // Using startOf and endOf day would be ideal for timezone handling
  // but we'll stick with simple comparison for consistency with existing code
  const activePeriod = periods.find((period) => {
    const startDate = parseISO(period.startDate);
    const endDate = parseISO(period.endDate);

    // Check if today is within or exactly on the period boundaries
    return startDate <= today && today <= endDate;
  });

  // Mark the found period as active (if any)
  if (activePeriod) {
    activePeriod.isActivePeriod = true;
    return;
  }

  // Fallback: If we have currentStartDate, find the period in the current term
  if (currentStartDate) {
    const currentStartDateFormatted = format(
      parseISO(currentStartDate),
      'yyyy-MM-dd',
    );

    // Look for a period that matches the current start date
    const currentTermFirstPeriod = periods.find(
      (period) => period.startDate === currentStartDateFormatted,
    );

    if (currentTermFirstPeriod) {
      currentTermFirstPeriod.isActivePeriod = true;
      return;
    }
  }

  // If we still don't have an active period, look for periods marked as current term
  const currentTermPeriods = periods.filter((period) => period.isCurrentTerm);
  if (currentTermPeriods.length > 0) {
    // Find the first period in the current term (lowest yearWithinTerm)
    const firstYearInTerm = currentTermPeriods.reduce(
      (min, p) => (p.yearWithinTerm < min ? p.yearWithinTerm : min),
      Number.MAX_SAFE_INTEGER,
    );

    const firstPeriod = currentTermPeriods.find(
      (p) => p.yearWithinTerm === firstYearInTerm,
    );
    if (firstPeriod) {
      firstPeriod.isActivePeriod = true;
    }
  }
}

/**
 * Common function to identify the current term periods
 * Marks all periods in the current term with isCurrentTerm=true
 */
export function markCurrentTerm(
  periods: PricePeriod[],
  today: Date = new Date(),
  nextFiscalYearStart: Date = new Date(),
  currentStartDate?: string, // Latest term start date from the database
): void {
  if (!periods.length) return;

  // Group periods by termIndex
  const termGroups = new Map<number, PricePeriod[]>();
  periods.forEach((period) => {
    if (!termGroups.has(period.termIndex)) {
      termGroups.set(period.termIndex, []);
    }
    termGroups.get(period.termIndex)!.push(period);
  });

  // First, ensure no terms are marked as current
  periods.forEach((period) => {
    period.isCurrentTerm = false;
  });

  // Convert termGroups to an array and sort by termIndex
  const sortedTerms = Array.from(termGroups.entries()).sort(
    ([indexA], [indexB]) => indexA - indexB,
  );

  // First attempt: If we have a current start date from the database, try to match that exactly
  if (currentStartDate) {
    const currentStartDateFormatted = format(
      parseISO(currentStartDate),
      'yyyy-MM-dd',
    );

    // Look for a term that starts on the current start date
    for (const [, termPeriods] of sortedTerms) {
      if (termPeriods[0].startDate === currentStartDateFormatted) {
        // This is the current term according to the database
        termPeriods.forEach((p) => (p.isCurrentTerm = true));
        return; // Found an exact match, no need to continue
      }
    }
  }

  // Second attempt: Find active term based on whether any period in the term is active
  // Try to find a term that contains today first
  for (const [, termPeriods] of sortedTerms) {
    const activePeriodInTerm = findActivePeriodByDate(termPeriods, today);
    if (activePeriodInTerm) {
      // Found a term with an active period - mark all periods in this term as current
      termPeriods.forEach((p) => (p.isCurrentTerm = true));
      return;
    }
  }

  // Third attempt: If no term contains today, find the next upcoming term
  // Sort terms by start date and find the first one that starts after today
  const sortedByStart = [...sortedTerms].sort(([, periodsA], [, periodsB]) => {
    const startA = parseISO(periodsA[0].startDate).getTime();
    const startB = parseISO(periodsB[0].startDate).getTime();
    return startA - startB;
  });

  for (const [, termPeriods] of sortedByStart) {
    const termStart = parseISO(termPeriods[0].startDate);
    if (
      isAfter(termStart, today) &&
      (!nextFiscalYearStart || isBefore(termStart, nextFiscalYearStart))
    ) {
      // This is the next upcoming term - mark all periods as current
      termPeriods.forEach((p) => (p.isCurrentTerm = true));
      return;
    }
  }
}

/**
 * Type for product data to avoid using 'any'
 */
export type ProductData = {
  product_id: number;
  year?: number;
  fees: number;
  compoundedFees: number;
  convertedFees?: number;
  originalFees?: number;
  one_time_only?: boolean;
  sort_order?: number | null;
  startDate?: string;
  endDate?: string;
  vendor_products?: {
    name: string;
    id: number;
    product_code?: string | null;
    data_delivery_types?: { id: number; name: string };
  };
  periodInfo?: {
    termIndex: number;
    yearWithinTerm: number;
    termType: string;
    isCurrentTerm?: boolean;
    isActivePeriod?: boolean;
  };
};

/**
 * Creates a product map from vendor product details
 */
export function createProductMapFromDetails(
  vendorProductsDetails: ProductDetail[] = [],
): Map<string, ProductData> {
  const productMap = new Map<string, ProductData>();

  vendorProductsDetails.forEach((product) => {
    const productId = product.product_id.toString();
    const fees = Number(product.fees) || 0;

    productMap.set(productId, {
      ...product,
      fees,
      compoundedFees: fees,
      originalFees: fees, // Include originalFees for compatibility
    });
  });

  return productMap;
}

/**
 * Creates a product map from period data
 * Always preserves period-specific data by using composite keys
 *
 * @param periods - The periods to process products from
 * @param vendorProductsDetails - The original product details
 * @returns A map of products with their fees and other details
 */
export function processProductsFromPeriods(
  periods: PricePeriod[],
  vendorProductsDetails: ProductDetail[] = [],
): Map<string, ProductData> {
  const productsMap = new Map<string, ProductData>();

  periods.forEach((period) => {
    period.productFees.forEach((productFee) => {
      // Find the original product info
      const originalProduct = vendorProductsDetails.find(
        (p) => p.product_id === productFee.productId,
      );

      if (originalProduct) {
        // Create a composite key that includes period information
        // This ensures we don't overwrite products from different periods
        const key = `${productFee.productId}_${period.termIndex}_${period.yearWithinTerm}`;

        productsMap.set(key, {
          ...originalProduct,
          startDate: period.startDate,
          endDate: period.endDate,
          fees: productFee.fees,
          compoundedFees: productFee.fees,
          originalFees: productFee.originalFees, // Include originalFees from the productFee
          // Add period information to help identify this product's context
          periodInfo: {
            termIndex: period.termIndex,
            yearWithinTerm: period.yearWithinTerm,
            termType: period.termType,
            isCurrentTerm: period.isCurrentTerm,
            isActivePeriod: period.isActivePeriod,
          },
        });
      }
    });
  });

  return productsMap;
}
