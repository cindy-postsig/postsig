import { fetchContractsBase } from '@/app/lib/contracts/actions';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import { getUserMetadata } from '@/data/users';
import { enrichWithLineage } from '@/lib/v2/core/lineage';
import { enrichWithPricing } from '@/lib/v2/core/pricing';
import { extractProducts } from '@/lib/v2/core/products';
import { filterActiveContracts } from '@/lib/v2/core/filters';
import { EnrichedProduct, ContractWithPricing } from '@/lib/v2/core/types';

// Re-export transform types and functions for convenience
export type { ContractProduct, ContractProductsResult } from './transforms';
export { enrichContractProducts } from './transforms';

export interface ProductDetailRow {
  id: number;
  product_id: number;
  contract_id: number;
  year: number;
  fees: number;
  start_date: any[];
  end_date: any[];
}

export interface ProductsResult {
  products: EnrichedProduct[];
  count: number;
}

/**
 * Helper to extract products from already-enriched contracts.
 * Use when contracts have already been fetched/enriched.
 */
export function enrichProductsFromContracts(
  contracts: ContractWithPricing[],
): EnrichedProduct[] {
  return extractProducts(contracts);
}

/**
 * Get enriched products list - one product per contract.
 * Fetches base data and composes enrichments independently.
 */
export async function getProductsList(): Promise<ProductsResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { products: [], count: 0 };
  }

  const fiscalYearStartMonth = userMetadata.organizationFY || 1;

  const contractsBase = await fetchContractsBase();
  const relationships = await fetchAllRelationshipsForOrg(
    userMetadata.organizationId,
  );

  const activeContracts = filterActiveContracts(contractsBase);

  const withLineage = enrichWithLineage(activeContracts, relationships);
  const withPricing = await enrichWithPricing(
    withLineage,
    fiscalYearStartMonth,
    { baseCurrency: userMetadata.baseCurrency },
  );
  const products = extractProducts(withPricing);

  return {
    products,
    count: products.length,
  };
}
