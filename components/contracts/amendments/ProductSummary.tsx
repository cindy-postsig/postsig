import { HierarchyProductsData } from './productComparisonUtils';

interface ProductSummaryProps {
  fieldKey: string;
  hierarchyProductsData: HierarchyProductsData[];
}

export function ProductSummary({
  fieldKey,
  hierarchyProductsData,
}: ProductSummaryProps) {
  if (fieldKey !== 'products_licensed' || !hierarchyProductsData.length) {
    return null;
  }

  // First contract in hierarchy is the original
  const originalContract = hierarchyProductsData[0];
  if (!originalContract) return null;

  // Count changes by comparing each contract against its predecessor
  let priceChanges = 0;
  let addedProducts = new Set();
  let addedYears = new Set();

  // Track all products and years we've seen to identify truly new additions
  const allProductIds = new Set();
  const allYears = new Set();

  for (let i = 0; i < hierarchyProductsData.length; i++) {
    const hierarchyContract = hierarchyProductsData[i];
    if (!hierarchyContract.products) continue;

    const contractProducts = Object.values(hierarchyContract.products).flat();

    // For the first contract, just track what exists
    if (i === 0) {
      contractProducts.forEach((product: any) => {
        allProductIds.add(product.vendor_products?.id || product.product_id);
        allYears.add(product.year);
      });
      continue;
    }

    // Temporary set to collect years for this contract
    // This ensures all products see the same state of allYears
    const currentContractYears = new Set<number>();

    // For subsequent contracts, compare against the immediate predecessor
    const previousHierarchyContract = hierarchyProductsData[i - 1];
    const previousProducts = Object.values(
      previousHierarchyContract.products || {},
    ).flat();

    contractProducts.forEach((product: any) => {
      const productId = product.vendor_products?.id || product.product_id;
      const productYear = product.year;
      const currentFee = product.compoundedFee || product.fees || 0;

      const isNewProduct = !allProductIds.has(productId);
      const isNewYear = !allYears.has(productYear);

      // Check if this product ID is entirely new (never seen before)
      if (isNewProduct) {
        addedProducts.add(productId);
        allProductIds.add(productId);
      }

      // Only count "added year" if an EXISTING product appears in a new year
      // Don't count it if it's just a new product (which inherently comes with a year)
      if (isNewYear && !isNewProduct) {
        addedYears.add(productYear);
      }

      // Track years for this contract (defer adding to allYears)
      currentContractYears.add(productYear);

      // Check for price changes against immediate predecessor
      const previousProduct = previousProducts.find(
        (prevProduct: any) =>
          (prevProduct.vendor_products?.id || prevProduct.product_id) ===
            productId && prevProduct.year === productYear,
      );

      if (previousProduct) {
        const previousFee =
          (previousProduct as any).compoundedFee ||
          (previousProduct as any).fees ||
          0;

        if (currentFee !== previousFee) {
          priceChanges++;
        }
      }
    });

    // Now merge the years from this contract into allYears
    // This happens after processing all products, preventing order-dependent bugs
    currentContractYears.forEach((year) => allYears.add(year));
  }

  const contractTypeName =
    originalContract.contractData.contract_types?.name || 'contract';

  // Build the summary text with legal precision
  const parts: string[] = [];
  if (priceChanges > 0) {
    parts.push(`${priceChanges} price change${priceChanges > 1 ? 's' : ''}`);
  }
  if (addedProducts.size > 0) {
    parts.push(
      `${addedProducts.size} added product${addedProducts.size > 1 ? 's' : ''}`,
    );
  }
  if (addedYears.size > 0) {
    parts.push(
      `${addedYears.size} added year${addedYears.size > 1 ? 's' : ''}`,
    );
  }

  const totalChanges = priceChanges + addedProducts.size + addedYears.size;
  let summaryText: string;

  if (totalChanges === 0) {
    summaryText = 'no changes';
  } else if (parts.length === 1) {
    summaryText = `a total of ${totalChanges} change${totalChanges > 1 ? 's' : ''}: ${parts[0]}`;
  } else if (parts.length === 2) {
    summaryText = `a total of ${totalChanges} changes: ${parts[0]} and ${parts[1]}`;
  } else {
    summaryText = `a total of ${totalChanges} changes: ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  }

  const verb = totalChanges === 0 ? 'have' : 'has';

  return (
    <div className="mb-3 font-serif text-lg">
      Since the original {contractTypeName}, there {verb} been {summaryText}.
    </div>
  );
}
