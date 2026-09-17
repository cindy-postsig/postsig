import { fetchContractsBase } from '@/app/lib/contracts/actions';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import { getUserMetadata } from '@/data/users';
import { getSidVendorInventoryItems } from '@/lib/v2/bloomberg-sid/service';
import { loadSeatRoster } from '@/lib/v2/seats/roster';
import { InventoryItem, InventoryResult } from './types';
import { buildInventoryItem } from './transforms';
import { filterToOnePerFamily } from '@/lib/v2/core/lineage';
import { enrichWithAmendments } from '@/lib/v2/core/amendments';
import {
  excludeRemovedProducts,
  extractProducts,
} from '@/lib/v2/core/products';
import { contractsToChainContracts } from '@/lib/contracts/productLineageResolution';
import { resolveRemovedProductsAcrossChains } from '@/lib/contracts/resolveRemovedProductsForContracts';
import {
  filterActiveContracts,
  filterExcludeInvoices,
} from '@/lib/v2/core/filters';

export type { InventoryItem, InventoryResult } from './types';

/**
 * Get inventory list - one product per contract family.
 * Fetches base data and enriches with amendment information.
 */
export async function getInventoryList(): Promise<InventoryResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { items: [], count: 0 };
  }

  const fiscalYearStartMonth = userMetadata.organizationFY || 1;

  const rosterLoad = loadSeatRoster(userMetadata.organizationId);
  const [contractsBase, relationships, seatItems, roster] = await Promise.all([
    fetchContractsBase(),
    fetchAllRelationshipsForOrg(userMetadata.organizationId),
    getSidVendorInventoryItems(userMetadata.organizationId, rosterLoad),
    rosterLoad,
  ]);

  // Exclude invoices — they belong only in the Invoices sub-view, not inventory.
  const activeContracts = filterExcludeInvoices(
    filterActiveContracts(contractsBase),
  );

  // Confirmed cancellation declarations (PSK-1830). Chain input is built from
  // the UNFILTERED base set: a declaring addendum must stay resolvable even
  // when the active/invoice filters would hide it from the inventory itself.
  const removedByContract = await resolveRemovedProductsAcrossChains({
    organizationId: userMetadata.organizationId,
    chainContracts: contractsToChainContracts(contractsBase),
    relationships,
  });

  // Single enrichment step - handles lineage, pricing, and amendment tracking
  const enrichedContracts = await enrichWithAmendments(
    activeContracts,
    relationships,
    fiscalYearStartMonth,
    { baseCurrency: userMetadata.baseCurrency },
  );

  // Exclusion must precede the family dedupe so a family whose elected
  // member is cancelled can re-elect a surviving sibling.
  const products = excludeRemovedProducts(
    extractProducts(enrichedContracts),
    removedByContract,
  );
  const inventoryProducts = filterToOnePerFamily(products);

  const contractsMap = new Map(contractsBase.map((c) => [c.id, c]));
  const enrichedContractsMap = new Map(enrichedContracts.map((c) => [c.id, c]));

  const contractItems = inventoryProducts
    .map((product) => {
      const sourceContract = contractsMap.get(product.sourceContractId);
      if (!sourceContract) return null;

      const enrichedSourceContract = enrichedContractsMap.get(
        product.sourceContractId,
      );

      return buildInventoryItem({
        product,
        sourceContract,
        fiscalYearStartMonth,
        contractsMap,
        enrichedSourceContract,
        enrichedPricingContract: enrichedContractsMap.get(product.contract_id),
        baseCurrency: userMetadata.baseCurrency,
        roster,
      });
    })
    .filter((item): item is InventoryItem => item !== null);

  // Bloomberg seats are one row per vendor here; the vendor page lists them
  // per product itself and leaves these out (getVendorInventory).
  const inventoryItems = [...contractItems, ...seatItems];

  return {
    items: inventoryItems,
    count: inventoryItems.length,
  };
}
