/**
 * Scoped data access for the get_price_history MCP tool.
 *
 * The price-history page enriches and rolls up EVERY org contract. For a
 * single product/vendor question that's almost all wasted compute. These
 * helpers reuse the cached raw contract set (so we never bypass the org cache)
 * but enrich + price only the lineage component(s) actually needed, which keeps
 * results identical to the full-org path (same rows, same enrichment fns).
 */
import {
  fetchContractsBase,
  fetchContracts,
} from '@/app/lib/contracts/actions';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import { getUserMetadata } from '@/data/users';
import {
  enrichWithLineage,
  expandToLineageComponents,
} from '@/lib/v2/core/lineage';
import {
  enrichWithPricing,
  enrichWithEffectiveFees,
} from '@/lib/v2/core/pricing';
import {
  applyDefaultFilters,
  filterToBudgetContracts,
} from '@/lib/v2/core/filters';
import type { ContractWithPricing } from '@/lib/v2/core/types';

export interface RawContext {
  raw: any[];
  relationships: any[];
  fiscalYearStartMonth: number;
  /** Org base display currency, for the pricing enrichment's FX conversion. */
  baseCurrency: string;
}

/**
 * Active + archived raw contracts (pre-enrichment), straight from the cached
 * set — the same merge the price-history page feeds into enrichment. Exposed so
 * the resolve→scope path can load it once and pass it into both calls instead
 * of fetching the (cached) set twice.
 */
export async function loadPriceHistoryContext(): Promise<RawContext | null> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return null;

  const fiscalYearStartMonth = userMetadata.organizationFY || 1;
  const [activeBase, archivedBase] = await Promise.all([
    fetchContractsBase(),
    fetchContracts({ status: 'inactive', hideFailed: true }),
  ]);
  const raw = [...applyDefaultFilters(activeBase), ...archivedBase];
  const relationships = await fetchAllRelationshipsForOrg(
    userMetadata.organizationId,
  );
  return {
    raw,
    relationships,
    fiscalYearStartMonth,
    baseCurrency: userMetadata.baseCurrency,
  };
}

function rawCarriesProduct(contract: any, productId: number): boolean {
  return (contract.vendor_products_details ?? []).some(
    (vpd: any) => (vpd.product_id ?? vpd.vendor_products?.id) === productId,
  );
}

/**
 * Enrich only the lineage component(s) containing the seed contracts.
 *
 * Mirrors getActiveAndArchivedContracts' enrichment exactly, minus the rows
 * outside the seeds' components — which can't affect those components' lineage
 * (a component is closed under the relationship graph).
 */
export async function getScopedPriceHistoryContracts(
  selector: {
    productId?: number;
    vendorId?: number;
  },
  preloaded?: RawContext | null,
): Promise<ContractWithPricing[]> {
  const ctx = preloaded ?? (await loadPriceHistoryContext());
  if (!ctx) return [];
  const { raw, relationships, fiscalYearStartMonth } = ctx;

  const seedIds = raw
    .filter((c) => {
      if (selector.productId != null) {
        return rawCarriesProduct(c, selector.productId);
      }
      if (selector.vendorId != null) return c.vendor_id === selector.vendorId;
      return false;
    })
    .map((c) => c.id as number);

  if (seedIds.length === 0) return [];

  const component = expandToLineageComponents(seedIds, relationships);
  const subset = raw.filter((c) => component.has(c.id));

  const withLineage = enrichWithLineage(subset, relationships);
  const withPricing = await enrichWithPricing(
    withLineage,
    fiscalYearStartMonth,
    {
      baseCurrency: ctx.baseCurrency,
    },
  );
  const withEffectiveFees = enrichWithEffectiveFees(withPricing);
  return filterToBudgetContracts(withEffectiveFees);
}

export interface PriceHistoryNameMatches {
  products: {
    productId: number;
    productName: string;
    vendorId: number | null;
    vendorName: string;
  }[];
  vendors: { vendorId: number; vendorName: string }[];
}

/**
 * Resolve a free-text name to product / vendor candidates by scanning the
 * cached raw set in memory — no enrichment or price-history build. Lets the
 * tool answer name-based questions without an external lookup tool (whose
 * results render as rich cards in the chat UI).
 */
export async function resolvePriceHistoryName(
  query: string,
  preloaded?: RawContext | null,
): Promise<PriceHistoryNameMatches> {
  const ctx = preloaded ?? (await loadPriceHistoryContext());
  if (!ctx) return { products: [], vendors: [] };

  const q = query.toLowerCase();
  const products = new Map<
    number,
    PriceHistoryNameMatches['products'][number]
  >();
  const vendors = new Map<number, PriceHistoryNameMatches['vendors'][number]>();

  for (const c of ctx.raw) {
    const vendorId: number | null = c.vendor_id ?? null;
    const vendorName: string = c.vendors?.name ?? 'Unknown Vendor';

    // Only record vendors with a real id — a null-id match can't drive a
    // follow-up vendor_id call, so it would just be a dead disambiguation row.
    if (vendorId != null && vendorName.toLowerCase().includes(q)) {
      vendors.set(vendorId, { vendorId, vendorName });
    }

    for (const vpd of c.vendor_products_details ?? []) {
      const productId: number | undefined =
        vpd.product_id ?? vpd.vendor_products?.id;
      const productName: string | undefined = vpd.vendor_products?.name;
      if (
        productId != null &&
        productName &&
        productName.toLowerCase().includes(q)
      ) {
        products.set(productId, {
          productId,
          productName,
          vendorId,
          vendorName,
        });
      }
    }
  }

  return {
    products: [...products.values()],
    vendors: [...vendors.values()],
  };
}
