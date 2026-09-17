import { parseISO, isAfter } from 'date-fns';
import { Contract, Product } from './contractStatusUtils';
import { calculateContractYear } from './dateUtils';
import { isContractActive, isContractRenewed } from './contractStatusUtils';

/**
 * Group products by their year value
 * @param products Array of products to group
 * @param contract Optional contract to check if it's renewed
 * @returns Map of year numbers to arrays of products
 */
export function groupProductsByYear(
  products: Product[],
  contract?: Contract,
): Map<number, Product[]> {
  // For renewed contracts, remap product years to be sequential
  if (contract && isContractRenewed(contract)) {
    // First group by original years to maintain product groupings
    const productsByOriginalYear = products.reduce((acc, product) => {
      const year = product.year;
      if (!acc.has(year)) acc.set(year, []);
      acc.get(year)?.push(product);
      return acc;
    }, new Map<number, Product[]>());

    // Get all years, sorted
    const originalYears = Array.from(productsByOriginalYear.keys()).sort(
      (a, b) => a - b,
    );

    // Create new Map with remapped sequential years
    const result = new Map<number, Product[]>();

    // Remap years to be sequential (1, 2, 3...)
    let newYearCounter = 1;
    originalYears.forEach((originalYear) => {
      // For each original year, get its products and assign a new sequential year
      const productsForYear = productsByOriginalYear.get(originalYear) || [];

      // Add to result with remapped year number
      result.set(
        newYearCounter,
        productsForYear.map((product) => ({
          ...product,
          originalYear: product.year, // Store original year as reference
          year: newYearCounter, // Remap to sequential year
        })),
      );

      newYearCounter++;
    });

    return result;
  }

  // For non-renewed contracts, just use the original grouping
  return products.reduce((acc, product) => {
    const year = product.year;
    if (!acc.has(year)) acc.set(year, []);
    acc.get(year)?.push(product);
    return acc;
  }, new Map<number, Product[]>());
}

/**
 * Core utility to determine which product year to use based on contract state
 * @param contract The contract to evaluate
 * @param options Optional parameters including forProjection flag
 * @returns The selected product year to use
 */
export function determineProductYear(
  contract: Contract,
  options: { forProjection?: boolean; asOfDate?: Date } = {},
): number {
  if (!contract.vendor_products_details?.length) return 1;

  const forProjection = options.forProjection === true;
  const asOfDate = options.asOfDate;
  const availableYears = Array.from(
    new Set(contract.vendor_products_details.map((p) => p.year)),
  ).sort((a, b) => a - b);

  // Edge case: Contract hasn't started yet
  if (contract.term_start_date?.[0]?.date) {
    const startDate = parseISO(contract.term_start_date[0].date);
    if (isAfter(startDate, asOfDate ?? new Date())) {
      return 1;
    }
  }

  const isRenewed = isContractRenewed(contract);
  const renewalPeriodYears = contract.renewal_period
    ? Math.ceil(contract.renewal_period / 12)
    : 1;
  const currentContractYear = calculateContractYear(
    contract.term_start_date?.[0]?.date,
    asOfDate,
  );

  // Case 1: Renewed contracts with standard 12-month renewal
  if (isRenewed && renewalPeriodYears === 1 && isContractActive(contract)) {
    // Use the latest year for 12-month renewals
    return Math.max(...availableYears);
  }

  // Case 2: For projection of non-renewed contracts
  if (forProjection && !isRenewed) {
    const contractHasMultipleYears = availableYears.length > 1;

    if (contractHasMultipleYears) {
      // For a contract in year 2 of 3, we want to show year 3's products for projection
      if (availableYears.includes(currentContractYear + 1)) {
        return currentContractYear + 1;
      }
    }

    // Fallback for standard contracts or if next year isn't available
    const nextYear = availableYears.find((y) => y > currentContractYear);
    if (nextYear !== undefined) {
      return nextYear;
    }
  }

  // Case 3: Try to use current contract year if available
  if (availableYears.includes(currentContractYear)) {
    return currentContractYear;
  }

  // Case 4: Find closest year not exceeding current year
  const availableYearsNotExceeding = availableYears.filter(
    (y) => y <= currentContractYear,
  );
  if (availableYearsNotExceeding.length > 0) {
    return Math.max(...availableYearsNotExceeding);
  }

  // Case 5: Fallback to year 1 if available, otherwise lowest year
  return availableYears.includes(1) ? 1 : Math.min(...availableYears);
}

/**
 * Determine if we should use exact product fees (without annual increases)
 * @param contract Contract to evaluate
 * @param productYear Selected product year
 * @param isProjected Whether this is for a projection calculation
 * @returns True if we should use exact product fees
 */
export function shouldUseExactProductFees(
  contract: Contract,
  productYear: number,
  isProjected: boolean,
): boolean {
  if (!isProjected) return false;
  if (isContractRenewed(contract)) return false;

  const availableYears = Array.from(
    new Set(contract.vendor_products_details.map((p) => p.year)),
  );
  const hasMultipleYears = availableYears.length > 1;

  return hasMultipleYears && productYear > 1;
}
