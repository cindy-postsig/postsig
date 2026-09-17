export interface HierarchyProductsData {
  contractId: number;
  products: any; // productsByYear object
  contractData: {
    id: number;
    localId?: string;
    localAmendmentId?: string;
    contract_types?: any;
    // Populated by buildHierarchyProductsData and read by
    // getOriginalTermStartDate below; declared so callers can order the chain
    // without casting.
    term_start_date?: unknown;
  };
}

/**
 * Helper to get the original (oldest) term start date from a contract
 * For HierarchyProductsData, the structure is: hierarchyData.contractData.term_start_date
 */
export function getOriginalTermStartDate(hierarchyData: any): Date | null {
  // Access term_start_date from the contractData property
  const termStartDate = hierarchyData?.contractData?.term_start_date;

  if (!termStartDate) return null;

  // Handle array format - use LAST element (oldest/original date)
  if (Array.isArray(termStartDate)) {
    if (termStartDate.length === 0) return null;
    const originalEntry = termStartDate[termStartDate.length - 1];
    const dateStr = originalEntry?.date || null;
    return dateStr ? new Date(dateStr) : null;
  }
  // Handle string format
  else if (typeof termStartDate === 'string') {
    return new Date(termStartDate);
  }

  return null;
}

/**
 * Helper to get the current (newest) term start date from a contract
 * This is index [0] and matches what the sidebar uses for ordering siblings
 */
export function getCurrentTermStartDate(hierarchyData: any): Date | null {
  const termStartDate = hierarchyData?.contractData?.term_start_date;

  if (!termStartDate) return null;

  // Handle array format - use FIRST element (current/newest date)
  if (Array.isArray(termStartDate)) {
    if (termStartDate.length === 0) return null;
    const currentEntry = termStartDate[0];
    const dateStr = currentEntry?.date || null;
    return dateStr ? new Date(dateStr) : null;
  }
  // Handle string format
  else if (typeof termStartDate === 'string') {
    return new Date(termStartDate);
  }

  return null;
}

/**
 * Helper function to create product comparison data using normalized hierarchy data
 */
export function createProductComparison(
  currentContractId: number,
  hierarchyProductsData: HierarchyProductsData[],
  topmostParentId?: number,
  /**
   * Product ids struck on this contract by confirmed lineage declarations
   * (PSK-1830), from resolveRemovedProductIds. Omitted means no declarations
   * apply and behavior is identical to before this parameter existed.
   */
  removedProductIds?: Set<number>,
) {
  if (!hierarchyProductsData.length) {
    return {
      productDifferences: new Map(),
      supersededProducts: new Set(),
      removedProducts: new Set(),
    };
  }

  // Find current contract in hierarchy
  const currentIndex = hierarchyProductsData.findIndex(
    (h) => h.contractId === currentContractId,
  );
  if (currentIndex < 0) {
    return {
      productDifferences: new Map(),
      supersededProducts: new Set(),
      removedProducts: new Set(),
    };
  }

  // Check if this is the topmost parent in the actual hierarchy
  const isTopmostParent =
    topmostParentId !== undefined && currentContractId === topmostParentId;

  const currentContractData = hierarchyProductsData[currentIndex];
  const currentProducts = Object.values(
    currentContractData.products || {},
  ).flat();

  const productDifferences = new Map<
    string,
    'added' | 'price_increased' | 'price_decreased' | 'unchanged' | 'removed'
  >();

  // Track which products in this contract have been superseded by later amendments
  const supersededProducts = new Set<string>();

  // Get the current contract's original date for chronological comparison
  const currentDate = getOriginalTermStartDate(currentContractData);

  // Track which years existed in the immediate predecessor
  const predecessorData =
    currentIndex > 0 ? hierarchyProductsData[currentIndex - 1] : null;
  let predecessorYears: Set<number> | undefined;
  if (predecessorData?.products) {
    predecessorYears = new Set<number>();
    Object.values(predecessorData.products)
      .flat()
      .forEach((product: any) => {
        predecessorYears!.add(product.year);
      });
  }

  // For each current product, find the most recent predecessor that has this product
  currentProducts.forEach((currentProduct: any) => {
    const productKey = `${currentProduct.vendor_products?.id || currentProduct.product_id}-${currentProduct.year}`;
    const currentFee = currentProduct.compoundedFee || currentProduct.fees || 0;

    // Search backwards through hierarchy to find the most recent predecessor with this product
    let foundPredecessorProduct = null;
    let foundPredecessorContractId = null;

    for (let i = currentIndex - 1; i >= 0; i--) {
      const predecessorData = hierarchyProductsData[i];
      const predecessorProducts = Object.values(
        predecessorData.products || {},
      ).flat();

      // Look for matching product in this predecessor
      const matchingProduct = predecessorProducts.find((product: any) => {
        const key = `${product.vendor_products?.id || product.product_id}-${product.year}`;
        return key === productKey;
      });

      if (matchingProduct) {
        foundPredecessorProduct = matchingProduct;
        foundPredecessorContractId = predecessorData.contractId;
        break;
      }
    }

    if (foundPredecessorProduct) {
      const predecessorFee =
        (foundPredecessorProduct as any).compoundedFee ||
        (foundPredecessorProduct as any).fees ||
        0;

      if (currentFee !== predecessorFee) {
        if (currentFee > predecessorFee) {
          productDifferences.set(productKey, 'price_increased');
        } else {
          productDifferences.set(productKey, 'price_decreased');
        }
      } else {
        productDifferences.set(productKey, 'unchanged');
      }
    } else if (!isTopmostParent) {
      // Mark as 'added' if not found in any predecessor AND not the topmost parent
      // This handles cases where topmost parent has no products but children do
      productDifferences.set(productKey, 'added');
    }
  });

  // Check if any products in the current contract are superseded by later amendments
  // Compare using original dates first, then fallback to hierarchy position
  // Track which product IDs (not year-specific) have been superseded
  const supersededProductIds = new Set<string | number>();

  hierarchyProductsData.forEach((otherContractData, otherIndex) => {
    if (otherIndex === currentIndex) return; // Skip self

    const otherDate = getOriginalTermStartDate(otherContractData);

    // Determine if otherContract is "later" than current contract
    // Strategy: Use dates when both available, otherwise use hierarchy position
    let isLater = false;

    if (currentDate && otherDate) {
      // Both have dates - compare dates first
      if (otherDate.getTime() === currentDate.getTime()) {
        // Edge case: Dates are equal - use hierarchy position as tiebreaker
        isLater = otherIndex > currentIndex;
      } else {
        // Normal case: Dates are different - chronological order wins
        isLater = otherDate > currentDate;
      }
    } else {
      // Fallback: Missing date(s) - rely on hierarchy position
      isLater = otherIndex > currentIndex;
    }

    if (!isLater) return; // Skip contracts that are not chronologically later

    const otherProducts = Object.values(
      otherContractData.products || {},
    ).flat();

    // For each product in the current contract, check if ANY year of it was superseded
    currentProducts.forEach((currentProduct: any) => {
      const productId =
        currentProduct.vendor_products?.id || currentProduct.product_id;
      const currentYear = currentProduct.year;
      const currentFee =
        currentProduct.compoundedFee || currentProduct.fees || 0;

      // Check if this exact product+year exists in the chronologically later contract
      const laterProduct = otherProducts.find((product: any) => {
        const laterProductId =
          product.vendor_products?.id || product.product_id;
        const laterYear = product.year;
        return laterProductId === productId && laterYear === currentYear;
      });

      if (laterProduct) {
        const laterFee =
          (laterProduct as any).compoundedFee ||
          (laterProduct as any).fees ||
          0;

        // If the price changed in the later amendment, mark the entire product as superseded
        // This means ALL years of this product in the current contract should be struck out
        if (laterFee !== currentFee) {
          supersededProductIds.add(productId);
        }
      }
    });
  });

  // Now mark all year instances of superseded products
  currentProducts.forEach((currentProduct: any) => {
    const productId =
      currentProduct.vendor_products?.id || currentProduct.product_id;
    const productKey = `${productId}-${currentProduct.year}`;

    if (supersededProductIds.has(productId)) {
      supersededProducts.add(productKey);
    }
  });

  // Products a later contract declared cancelled (PSK-1830). Applied last, and
  // only to the difference map, so the fee comparison above — and therefore
  // every surviving product's compounded fee — is computed exactly as it was
  // before removals existed. Keyed on product_id only: normalizeProductsList
  // stores 1-indexed relative years, so a year is not comparable across
  // contracts.
  const removedProducts = new Set<string>();

  currentProducts
    .filter((product: any) =>
      removedProductIds?.has(product.vendor_products?.id || product.product_id),
    )
    .forEach((product: any) => {
      const productId = product.vendor_products?.id || product.product_id;
      const productKey = `${productId}-${product.year}`;
      removedProducts.add(productKey);
      productDifferences.set(productKey, 'removed');
    });

  return {
    productDifferences,
    predecessorYears,
    supersededProducts,
    removedProducts,
  };
}
