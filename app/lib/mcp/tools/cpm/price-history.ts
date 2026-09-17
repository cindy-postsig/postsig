import { z } from 'zod';
import { getActiveAndArchivedContracts } from '@/lib/v2';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import {
  getScopedPriceHistoryContracts,
  resolvePriceHistoryName,
  loadPriceHistoryContext,
} from '@/lib/v2/contracts/priceHistoryScope';
import {
  buildVendorPriceSummaries,
  type VendorPriceSummary,
  type ProductPriceSummary,
} from '@/lib/v2/reports/price-history/summary';
import type { CurrencyPolicy, RelationshipEdge } from '@/lib/v2/spend';
import { buildSpendRateProvider } from '@/lib/v2/core/spendRates';
import { contractsToChainContracts } from '@/lib/contracts/productLineageResolution';
import { resolveProductFeeCutoffs } from '@/lib/contracts/resolveRemovedProductsForContracts';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import { NotFoundToolError, ValidationToolError } from '@/app/lib/mcp/errors';
import { paginate, paginationSchema } from '@/app/lib/mcp/pagination';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

const input = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Resolve by NAME in a single call — case-insensitive substring match on ' +
        'product names first, then vendor names. Use this whenever the user names ' +
        'a product or vendor (e.g. "EMEA Public Reporting License"); do NOT look ' +
        'the id up with list_contracts / search / query_* first. One match returns ' +
        'that trajectory; multiple returns a compact disambiguation list.',
    ),
  vendor_id: z
    .number()
    .int()
    .optional()
    .describe(
      "Roll up all of this vendor's contracts into one per-year fee trajectory " +
        '(historical → current → projected), broken down by product.',
    ),
  product_id: z
    .number()
    .int()
    .optional()
    .describe(
      "Drill into a single product's price history — the core view: its " +
        'year-over-year fees stitched across every contract that licensed it ' +
        '(amendments/renewals included), the renewal % change, and the ' +
        'contributing contracts.',
    ),
  ...paginationSchema,
});

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round1 = (n: number | null): number | null =>
  n === null ? null : Math.round(n * 10) / 10;

function projectPeriods(periods: { label: string; fees: number }[]) {
  return periods.map((p) => ({ year: p.label, fees: round2(p.fees) }));
}

function projectProduct(p: ProductPriceSummary) {
  return {
    productId: p.productId,
    productName: p.productName,
    renewalPercent: round1(p.renewalPercent),
    periods: projectPeriods(p.periods),
    contracts: p.contracts.map((c) => ({
      contractId: c.contractId,
      contractType: c.contractType,
      isArchived: c.isArchived,
      renewalPercent: round1(c.renewalPercent),
      amendsContractId: c.amendsContractId,
      amendsContractType: c.amendsContractType,
      periods: projectPeriods(c.periods),
    })),
  };
}

function projectVendor(v: VendorPriceSummary) {
  return {
    vendorId: v.vendorId,
    vendorName: v.vendorName,
    vendorDomain: v.vendorDomain,
    contractCount: v.contractCount,
    currency: v.currency,
    currentACV: round2(v.currentACV),
    renewalPercent: round1(v.renewalPercent),
    periods: v.periods.map((p) => ({
      year: p.label,
      fees: round2(p.fees),
      status: p.status,
    })),
    products: v.products.map(projectProduct),
  };
}

function productResponse(vendor: VendorPriceSummary, p: ProductPriceSummary) {
  return {
    mode: 'product' as const,
    productId: p.productId,
    vendor: {
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      vendorDomain: vendor.vendorDomain,
    },
    product: projectProduct(p),
  };
}

function findProduct(
  vendors: VendorPriceSummary[],
  productId: number | string,
) {
  const wanted = String(productId);
  for (const vendor of vendors) {
    const product = vendor.products.find((p) => String(p.productId) === wanted);
    if (product) return { vendor, product };
  }
  return null;
}

async function getPriceHistoryTool(payload: z.infer<typeof input>) {
  const ctx = requireMcpContext();
  const fiscalYearStartMonth = ctx.userMetadata.organizationFY ?? 1;
  // Cap projections at ~1 year out — matches the price-history page framing.
  const targetYear = new Date().getFullYear() + 1;

  // Selectors are mutually exclusive — reject rather than silently pick one.
  const selectorCount = [
    payload.query,
    payload.product_id,
    payload.vendor_id,
  ].filter((s) => s != null).length;
  if (selectorCount > 1) {
    throw new ValidationToolError(
      'Pass only one of query, product_id, or vendor_id.',
    );
  }

  const build = async (
    contracts: ContractWithPricing[],
    relationships: RelationshipEdge[],
  ) => {
    assertSameOrg(
      contracts,
      'get_price_history',
      (c: ContractWithPricing) => c.contract?.organization_id,
    );
    // Confirmed cancellation cutoffs (PSK-1830). Scoped sets are
    // component-complete (see expandToLineageComponents), so resolving
    // against them cannot miss a declaring contract in the same chain.
    const eventCutoffs = await resolveProductFeeCutoffs({
      organizationId: ctx.userMetadata.organizationId,
      chainContracts: contractsToChainContracts(
        contracts.map((c) => c.contract),
      ),
      relationships,
    });
    // Same window the page uses (epoch floor → the FY after targetYear); the
    // rate provider clamps the fetch to a sane earliest date.
    const asOf = new Date();
    const target = ctx.userMetadata.baseCurrency;
    const currency: CurrencyPolicy = {
      mode: 'base',
      target,
      rates: await buildSpendRateProvider({
        contracts: contracts.map((c) => c.contract),
        target,
        asOf,
        span: {
          start: new Date('1970-01-01T00:00:00.000Z'),
          end: new Date(
            `${targetYear + 1}-${String(fiscalYearStartMonth).padStart(2, '0')}-01T00:00:00.000Z`,
          ),
        },
      }),
    };
    return buildVendorPriceSummaries(
      contracts,
      fiscalYearStartMonth,
      targetYear,
      relationships,
      asOf,
      'committed',
      eventCutoffs,
      currency,
    );
  };

  const vendorResponse = (
    vendor: VendorPriceSummary,
    periodLabels: string[],
  ) => ({
    mode: 'vendor' as const,
    periodLabels,
    vendor: projectVendor(vendor),
  });

  // Product drill-down — the core view. Fetch only this product's lineage chain.
  if (payload.product_id != null) {
    const scopedContext = await loadPriceHistoryContext();
    const contracts = await getScopedPriceHistoryContracts(
      { productId: payload.product_id },
      scopedContext ?? undefined,
    );
    const { vendors } = await build(
      contracts,
      scopedContext?.relationships ?? [],
    );
    const hit = findProduct(vendors, payload.product_id);
    if (!hit) throw new NotFoundToolError('Product', payload.product_id);
    return productResponse(hit.vendor, hit.product);
  }

  // Vendor drill-down — fetch only this vendor's contracts.
  if (payload.vendor_id != null) {
    const scopedContext = await loadPriceHistoryContext();
    const contracts = await getScopedPriceHistoryContracts(
      { vendorId: payload.vendor_id },
      scopedContext ?? undefined,
    );
    const { vendors, periodLabels } = await build(
      contracts,
      scopedContext?.relationships ?? [],
    );
    const vendor = vendors.find((v) => v.vendorId === payload.vendor_id);
    if (!vendor) throw new NotFoundToolError('Vendor', payload.vendor_id);
    return vendorResponse(vendor, periodLabels);
  }

  // Name resolution — match in-memory over the cached set (no rich-card lookup
  // tool, no full price-history build), then scope-fetch the resolved id. The
  // raw context is loaded once and reused for both steps.
  if (payload.query) {
    const rawContext = await loadPriceHistoryContext();
    const { products, vendors: vendorMatches } = await resolvePriceHistoryName(
      payload.query,
      rawContext,
    );

    if (products.length === 1) {
      const contracts = await getScopedPriceHistoryContracts(
        { productId: products[0].productId },
        rawContext,
      );
      const hit = findProduct(
        (await build(contracts, rawContext?.relationships ?? [])).vendors,
        products[0].productId,
      );
      if (!hit) {
        throw new NotFoundToolError(
          'Price history for product',
          products[0].productName,
        );
      }
      return productResponse(hit.vendor, hit.product);
    }
    if (products.length > 1) {
      return {
        mode: 'matches' as const,
        query: payload.query,
        matches: products.map((p) => ({
          type: 'product' as const,
          productId: p.productId,
          productName: p.productName,
          vendorId: p.vendorId,
          vendorName: p.vendorName,
        })),
        note: 'Multiple products matched. Re-call with product_id for the one you want.',
      };
    }

    if (vendorMatches.length === 1) {
      const vendorId = vendorMatches[0].vendorId;
      const contracts = await getScopedPriceHistoryContracts(
        { vendorId },
        rawContext,
      );
      const { vendors, periodLabels } = await build(
        contracts,
        rawContext?.relationships ?? [],
      );
      const vendor = vendors.find((v) => v.vendorId === vendorId);
      if (vendor) return vendorResponse(vendor, periodLabels);
    }
    if (vendorMatches.length > 1) {
      return {
        mode: 'matches' as const,
        query: payload.query,
        matches: vendorMatches.map((v) => ({
          type: 'vendor' as const,
          vendorId: v.vendorId,
          vendorName: v.vendorName,
        })),
        note: 'Multiple vendors matched. Re-call with vendor_id for the one you want.',
      };
    }

    throw new NotFoundToolError('Price history for', payload.query);
  }

  // Default: paginated list of every vendor's rollup, biggest spenders first.
  // This genuinely needs the whole org, so it uses the full cached fetch.
  const { contracts, relationships } = await getActiveAndArchivedContracts();
  const { vendors, periodLabels } = await build(contracts, relationships ?? []);
  const page = paginate(vendors, payload);
  return {
    mode: 'vendors' as const,
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    periodLabels,
    vendors: page.items.map(projectVendor),
  };
}

export const priceHistoryTools: McpToolDef[] = [
  {
    name: 'get_price_history',
    description:
      'Per-year fee TRAJECTORY over time — how fees have moved across historical, ' +
      'current, and projected terms, with year-over-year renewal % deltas. ' +
      "The data is product-first (each product's fees stitched across the contracts " +
      'and amendments that carried it), rolled up to vendor — mirroring the in-app ' +
      'Price History page. Fees are bucketed by the calendar year each term starts ' +
      "and converted to the organization's base display currency (see each " +
      "vendor's `currency`); archived contracts are included and per-product " +
      'supersession across amendment chains is netted out. ' +
      'query = resolve a product or vendor by NAME in one call (use this when the ' +
      'user names something — no separate lookup tool needed). ' +
      "product_id = one product's trajectory + contributing contracts (the core view). " +
      "vendor_id = that vendor's rollup, broken down by product. " +
      'No args = every vendor, biggest current ACV first (paginated). ' +
      'Use this for "how has our spend on X changed", "what\'s the renewal increase", ' +
      '"price trend" questions. For spend in a specific month/quarter use get_spend; ' +
      'for what renews and when use get_upcoming_renewals / get_renewal_summary.',
    inputSchema: input,
    annotations: {
      title: 'Get price history',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getPriceHistoryTool as McpToolDef['handler'],
  },
];
