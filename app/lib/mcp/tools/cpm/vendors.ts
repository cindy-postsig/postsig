import { z } from 'zod';
import {
  getContractsList,
  getVendorContractsWithMetrics,
  getVendorSidProducts,
  fetchVendorDetails,
  filterForAggregation,
  type EnrichedContract,
} from '@/lib/v2';
import { sidProductTermBounds } from '@/lib/v2/bloomberg-sid/transforms';
import { isSidVendorInvoice } from '@/lib/v2/bloomberg-sid/spend';
import { getSidVendorTotals } from '@/lib/v2/vendors/service';
import type { SidVendorTotals } from '@/lib/v2/vendors/transforms';
import { extractBudgetFromPriceHistory } from '@/app/lib/budget';
import { getUSDValue } from '@/lib/v2/core/budget';
import { filterExcludeInvoices } from '@/lib/v2/core/filters';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import { paginate, paginationSchema } from '@/app/lib/mcp/pagination';
import { reverseContractTypeMap } from '@/app/lib/constants';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

/**
 * Pull unique product names from the enriched products, ordered by sort_order,
 * dropping superseded entries. Mirrors what get_contract_lineage exposes so a
 * single get_vendor call carries enough to identify each contract without a
 * follow-up fan-out.
 */
function productNamesFromContract(c: EnrichedContract): string[] {
  const sorted = [...c.products].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
  const names = sorted
    // The struck set: superseded by an amendment OR cancelled by a confirmed
    // lineage event (PSK-1830) — neither is a live licensed product.
    .filter((p) => !p.isSuperseded && p.isCancelled !== true)
    .map((p) => p.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
  return Array.from(new Set(names));
}

const getContractOrgId = (c: EnrichedContract): string | null | undefined =>
  c.contract?.organization_id;

async function loadIctMap(
  vendorIds: number[],
): Promise<Map<number, boolean | null>> {
  const ctx = requireMcpContext();
  if (vendorIds.length === 0) return new Map();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('organization_vendor_settings')
    .select('vendor_id, settings')
    .eq('organization_id', ctx.userMetadata.organizationId)
    .in('vendor_id', vendorIds);
  if (error) {
    logger.warn(
      { err: error, count: vendorIds.length },
      'mcp: failed to load organization_vendor_settings; ict flags will be null',
    );
    return new Map();
  }
  const map = new Map<number, boolean | null>();
  for (const row of data ?? []) {
    const settings = row.settings as
      | { ict_provider?: boolean | null }
      | null
      | undefined;
    map.set(row.vendor_id, settings?.ict_provider ?? null);
  }
  return map;
}

interface VendorRollup {
  id: number | string;
  name: string;
  domain?: string;
  ictProvider: boolean | null;
  contractCount: number;
  currentAnnualSpendBase: number;
  totalContractValueBase: number;
  terminalSeats?: {
    seats: number;
    currentAnnualSpendBase: number;
    projectedAnnualSpendBase: number;
  };
}

/**
 * Bloomberg terminal seats carry no contract rows, so their committed annual
 * figure joins the vendor's rollup — or stands as the rollup when the vendor
 * has no contracts at all. The same merge the dashboard's Top Vendors and the
 * budget table do, so one vendor reads the same everywhere.
 */
export function mergeSidVendorTotals(
  rollups: VendorRollup[],
  totals: SidVendorTotals,
  ictMap: ReadonlyMap<number, boolean | null> = new Map(),
): VendorRollup[] {
  const byId = new Map<number | string, VendorRollup>(
    rollups.map((rollup) => [rollup.id, { ...rollup }]),
  );

  for (const [vendorId, seatSpend] of totals.byVendorId) {
    const label = totals.labels.get(vendorId);
    const existing = byId.get(vendorId);
    const base: VendorRollup = existing ?? {
      id: vendorId,
      name: label?.name ?? String(vendorId),
      domain: label?.domain,
      ictProvider: ictMap.get(vendorId) ?? null,
      contractCount: 0,
      currentAnnualSpendBase: 0,
      totalContractValueBase: 0,
    };
    byId.set(vendorId, {
      ...base,
      currentAnnualSpendBase: base.currentAnnualSpendBase + seatSpend.current,
      terminalSeats: {
        seats: totals.seatCounts.get(vendorId) ?? 0,
        currentAnnualSpendBase: seatSpend.current,
        projectedAnnualSpendBase: seatSpend.projected,
      },
    });
  }

  return Array.from(byId.values()).sort(
    (a, b) => b.currentAnnualSpendBase - a.currentAnnualSpendBase,
  );
}

function rollupVendors(
  contracts: EnrichedContract[],
  ictMap: Map<number, boolean | null>,
): VendorRollup[] {
  const map = new Map<number | string, VendorRollup>();

  // filterForAggregation drops linked child invoices (already counted in
  // their parent) and fully superseded contracts (replaced by amendments).
  // Without this, vendors with invoice ladders or active amendments report
  // inflated spend.
  for (const c of filterForAggregation(contracts)) {
    const key = c.vendor_id ?? c.vendor_name;
    if (key === undefined || key === null) continue;

    const ph = c.priceHistory;
    const budget = ph ? extractBudgetFromPriceHistory(ph) : null;
    const annual = budget?.effectiveCurrentUSD ?? budget?.currentUSD ?? 0;
    const tcv = getUSDValue(c, 'totalContractValue');

    const existing = map.get(key);
    if (existing) {
      existing.contractCount += 1;
      existing.currentAnnualSpendBase += annual;
      existing.totalContractValueBase += tcv;
    } else {
      map.set(key, {
        id: c.vendor_id ?? c.vendor_name,
        name: c.vendor_name,
        domain: c.vendor_domain,
        ictProvider:
          c.vendor_id !== null && c.vendor_id !== undefined
            ? (ictMap.get(c.vendor_id) ?? null)
            : null,
        contractCount: 1,
        currentAnnualSpendBase: annual,
        totalContractValueBase: tcv,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.currentAnnualSpendBase - a.currentAnnualSpendBase,
  );
}

const listInput = z.object({
  min_annual_spend: z
    .number()
    .optional()
    .describe(
      "Only vendors whose current annual spend (in the organization's base display currency) is at or above this value.",
    ),
  ict_provider: z
    .boolean()
    .optional()
    .describe(
      'If true, only ICT-classified vendors (per DORA). If false, only non-ICT. ICT flag is set per organization in organization_vendor_settings.',
    ),
  ...paginationSchema,
});

async function listVendors(input: z.infer<typeof listInput>) {
  const [{ contracts: allContracts }, seatSpend] = await Promise.all([
    getContractsList(),
    getSidVendorTotals(),
  ]);
  assertSameOrg(allContracts, 'list_vendors', getContractOrgId);
  // Bloomberg seats stand in for the seat vendor's invoices, as they do on
  // the dashboard and the budget table, so those bills leave before anything
  // is counted or the seat figure would land on top of them.
  const contracts = allContracts.filter(
    (c) => !isSidVendorInvoice(c, seatSpend.vendorIds),
  );
  const vendorIds = Array.from(
    new Set([
      ...contracts
        .map((c) => c.vendor_id)
        .filter((id): id is number => id !== null && id !== undefined),
      ...seatSpend.vendorIds,
    ]),
  );
  const ictMap = await loadIctMap(vendorIds);

  let vendors = mergeSidVendorTotals(
    rollupVendors(contracts, ictMap),
    seatSpend,
    ictMap,
  );

  if (input.min_annual_spend !== undefined) {
    const min = input.min_annual_spend;
    vendors = vendors.filter((v) => v.currentAnnualSpendBase >= min);
  }
  if (input.ict_provider !== undefined) {
    vendors = vendors.filter((v) => v.ictProvider === input.ict_provider);
  }

  // Totals are computed across the full filtered set, not the current page,
  // so they remain meaningful when paginating.
  const totalAnnualSpendBase = vendors.reduce(
    (s, v) => s + v.currentAnnualSpendBase,
    0,
  );
  const totalContractValueBase = vendors.reduce(
    (s, v) => s + v.totalContractValueBase,
    0,
  );

  const page = paginate(vendors, input);

  return {
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    // Denomination of every *Base figure in this response.
    baseCurrency: requireMcpContext().userMetadata.baseCurrency,
    // Annual run rate — what the org is spending per year right now. Default
    // measure when the user asks about "spend" / "total spend".
    totalAnnualSpendBase,
    // Lifetime commitment summed across full contract terms. Use when the
    // user asks about TCV, lifetime spend, or DORA-style ICT exposure.
    totalContractValueBase,
    vendors: page.items,
  };
}

const getInput = z.object({
  id: z
    .number()
    .int()
    .describe(
      'The VENDOR id — from list_vendors, or the vendor.id field on query_contracts / get_vendor / get_contract rows. ' +
        "NOT a contract id: a contract listing's id / ID column is the contract id and will resolve to the wrong vendor (or one with no contracts) here.",
    ),
});

async function getVendorTool(input: z.infer<typeof getInput>) {
  const [vendor, { contracts: allContracts }, ictMap, sidProducts] =
    await Promise.all([
      fetchVendorDetails(input.id),
      getContractsList(),
      loadIctMap([input.id]),
      getVendorSidProducts(input.id),
    ]);
  if (!vendor) return { found: false as const };
  assertSameOrg(allContracts, 'get_vendor', getContractOrgId);

  const { contracts: vendorContracts, metrics } = getVendorContractsWithMetrics(
    input.id,
    allContracts,
    sidProductTermBounds(sidProducts),
  );

  // Metrics above are computed over the vendor's full set; only the listed
  // rows drop invoices, which are billing records rather than contracts.
  const contractSummaries = filterExcludeInvoices(vendorContracts).map((c) => {
    const ph = c.priceHistory;
    const budget = ph ? extractBudgetFromPriceHistory(ph) : null;
    const contractTypes = c.contract.contract_types as
      | { id?: number | null; name?: string | null }
      | null
      | undefined;
    const contractTypeId = contractTypes?.id ?? c.contract.type_id ?? null;
    return {
      id: c.id,
      name: c.contract.contract_name ?? null,
      contractType: contractTypes?.name ?? null,
      contractTypeAbbreviation:
        contractTypeId !== null
          ? (reverseContractTypeMap[contractTypeId] ?? null)
          : null,
      products: productNamesFromContract(c),
      status: c.contract.status ?? null,
      termStart: c.contract.term_start_date?.[0]?.date ?? null,
      termEnd: c.contract.term_end_date?.[0]?.date ?? null,
      currentAnnualSpendBase:
        budget?.effectiveCurrentUSD ?? budget?.currentUSD ?? 0,
      totalContractValueBase: getUSDValue(c, 'totalContractValue'),
      isSuperseded: Boolean(c.isFullySuperseded),
    };
  });

  // Dedup asset-class names (the join can repeat a class across contracts).
  const assetClasses: string[] = Array.from(
    new Map<number, string>(
      (
        (vendor.asset_classes ?? []) as Array<{
          asset_class?: { id?: number; name?: string };
        }>
      )
        .filter((ac) => ac?.asset_class?.id != null && ac.asset_class.name)
        .map((ac) => [
          ac.asset_class!.id as number,
          ac.asset_class!.name as string,
        ]),
    ).values(),
  );

  return {
    found: true as const,
    // Denomination of every *Base figure in this response.
    baseCurrency: requireMcpContext().userMetadata.baseCurrency,
    vendor: {
      id: vendor.id,
      name: vendor.name,
      domain: vendor.domain,
      ictProvider: ictMap.get(input.id) ?? null,
      assetClasses,
    },
    metrics: {
      totalVendorContractValueBase: metrics.totalVendorContractValue,
      relationshipStartDate: metrics.relationshipStartDate,
      projectedEndDate: metrics.projectedEndDate,
      relationshipLength: metrics.relationshipLengthDisplay,
      contractCount: contractSummaries.length,
    },
    terminals:
      sidProducts.length === 0
        ? null
        : {
            reportMonth: sidProducts[0].reportMonth,
            seats: sidProducts.reduce((total, p) => total + p.seats, 0),
            products: sidProducts.map((p) => ({
              code: p.gptt,
              name: p.description,
              seats: p.seats,
              monthlyCostUSD: p.monthlyCost,
              entitlementsMonthlyCostUSD: p.entitlementsCost,
            })),
          },
    contracts: contractSummaries,
  };
}

export const vendorsTools: McpToolDef[] = [
  {
    name: 'list_vendors',
    description:
      "List vendors in the user's organization, sorted by current annual spend (descending). " +
      "All spend figures (fields suffixed `Base`) are denominated in the organization's base display currency — see the response `baseCurrency`, and format amounts with that currency, never assuming USD. " +
      'Each vendor row includes BOTH currentAnnualSpendBase (annual run-rate — the year-over-year cost right now) ' +
      'and totalContractValueBase (TCV — lifetime commitment summed across full contract terms). ' +
      'The top-level response also reports totalAnnualSpendBase and totalContractValueBase across the filtered set. ' +
      'These totals exclude linked child invoices (already counted in their parent contract) and fully superseded amendments — so summing get_vendor row arrays will not match these totals. ' +
      'When a user asks "total spend" or "how much do we spend", default to the annual run-rate. ' +
      "Use TCV when they explicitly ask about lifetime spend, contracted value, or DORA-style ICT exposure (where multi-year commitment matters more than this year's slice). " +
      'TCV will exceed annual spend whenever any contract is multi-year. ' +
      'Bloomberg (BBG) terminal seat spend is included on the committed basis the dashboard uses: a vendor with seats carries `terminalSeats` (seat count plus the current and projected annual figures, already added into currentAnnualSpendBase) and is listed even when it has no contracts, and its own invoices are left out so the seats are not counted twice. ' +
      'The seat detail — who holds which terminal, per-seat renewal and cancel-by dates, exchange entitlements, monthly USD figures — is in list_bloomberg_terminals and get_bloomberg_spend. Paginated.',
    inputSchema: listInput,
    annotations: {
      title: 'List vendors',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: listVendors as McpToolDef['handler'],
  },
  {
    name: 'get_vendor',
    description:
      "Get a vendor with their contracts, relationship metrics (start date, length), and per-contract spend denominated in the organization's base display currency (fields suffixed `Base`; see the response `baseCurrency` — never assume USD). " +
      'Each contract row carries contractType + contractTypeAbbreviation (e.g. "MSA", "SO", "ADD", "NDA") and a products[] list — enough to identify what each contract is without follow-up get_contract calls. ' +
      'The contracts array excludes invoices (billing records, not contracts — use get_report_data type:"invoices" or query_contracts include_invoices when the user asks for them); superseded amendments are kept and flagged (isSuperseded). ' +
      "metrics.contractCount matches the contracts rows; the spend metrics are computed over the vendor's full set, and metrics.totalVendorContractValueBase excludes superseded amendments, so it will not equal a naive sum of the rows; explain that gap to the user when relevant. " +
      'For the full amendment family tree with localIds (MSA-1 / ADD-2 / SO-3) call get_contract_lineage on a specific contract. ' +
      "`terminals` carries the vendor's Bloomberg (BBG) terminal products for the latest imported SID report month — seats and MONTHLY figures in USD as billed on that report, not the base display currency — and is null for a vendor with no SID report. Call list_bloomberg_terminals for the seat-level list and get_bloomberg_spend for that month's totals and roll-ups.",
    inputSchema: getInput,
    annotations: {
      title: 'Get vendor',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getVendorTool as McpToolDef['handler'],
  },
];
