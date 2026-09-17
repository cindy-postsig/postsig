import {
  runSpendQuery,
  type SpendQueryResponse,
  type SpendQueryScope,
} from '@/app/api/v2/handlers/spend/query';
import {
  costMethodInput,
  type CostMethod,
} from '@/components/budget/costMethod';
import { getUserMetadata } from '@/data/users';
import {
  fetchOrganizationVendorDetails,
  fetchSingleVendorByUserRoles,
} from '@/data/superuser/vendors';
import { getDefaultCostMethod } from '@/lib/settings/default-cost-method';
import { isSidRollupKey, sidRollupVendorId } from '@/lib/v2/bloomberg-sid/keys';
import { loadSidSpendPopulation } from '@/lib/v2/bloomberg-sid/population';
import {
  EMPTY_VENDOR_ORG_DETAILS,
  type VendorOrgDetails,
} from '@/lib/v2/vendors/details';
import { getInventoryList } from '@/lib/v2/inventory/service';
import { filterInventoryByVendor } from '@/lib/v2/inventory/transforms';
import type { InventoryItem } from '@/lib/v2/inventory/types';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import { ContractWithPricing } from '@/lib/v2/core/types';
import { resolveWindow, toCents } from '@/lib/v2/spend';
import {
  calculateVendorMetrics,
  unpricedSeatProducts,
  type SidVendorTotals,
  type VendorMetrics,
  type VendorProductSpend,
  type VendorSpendIndex,
  type VendorSpendTotals,
} from '@/lib/v2/vendors/transforms';

export type {
  SidVendorTotals,
  VendorMetrics,
  VendorProductSpend,
  VendorSpendIndex,
  VendorSpendTotals,
};

export interface VendorDetailResult extends VendorMetrics {
  vendor: any;
  contracts: ContractWithPricing[];
}

/**
 * Filter contracts by vendor ID and calculate vendor metrics.
 * Use this when you already have contracts from getContractsList().
 */
export function getVendorContractsWithMetrics(
  vendorId: number,
  contracts: EnrichedContract[],
  seatTerms: { start: string; end: string } | null = null,
): { contracts: ContractWithPricing[]; metrics: VendorMetrics } {
  // Filter contracts by vendor ID
  const vendorContracts = contracts.filter((c) => c.vendor_id === vendorId);

  // Calculate summary metrics
  const metrics = calculateVendorMetrics(vendorContracts, seatTerms);

  return { contracts: vendorContracts, metrics };
}

/**
 * Get vendor details (without contracts).
 */
export async function fetchVendorDetails(vendorId: number): Promise<any> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return null;
  }

  const vendorData = await fetchSingleVendorByUserRoles({
    id: vendorId,
    userMetadata,
  });

  return vendorData?.vendor || null;
}

export async function fetchVendorOrgDetails(
  vendorId: number,
): Promise<VendorOrgDetails> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return EMPTY_VENDOR_ORG_DETAILS;
  }
  return fetchOrganizationVendorDetails(userMetadata.organizationId, vendorId);
}

/**
 * The vendor's rows from the same list the Inventory page shows, so the
 * products on a vendor page match the products under that vendor there.
 */
export async function getVendorInventory(
  vendorId: number,
): Promise<InventoryItem[]> {
  const { items: allItems } = await getInventoryList();
  // The vendor page appends its own per-product SID rows, so the Inventory
  // tab's rollup row would double them here.
  const items = allItems.filter((item) => !isSidRollupKey(item.id));
  return filterInventoryByVendor(items, vendorId);
}

export interface VendorCurrentFySpend {
  /** Org base currency. */
  amount: number;
  fiscalYear: number;
  costMethod: CostMethod;
}

type SpendWindow = 'currentFY' | 'nextFY';

/**
 * The same engine runner every other spend surface uses, on the org's
 * default cost method, with Bloomberg seats included so a SID-covered vendor
 * reads one number everywhere.
 */
async function vendorSpendRunner() {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return null;

  const costMethod = await getDefaultCostMethod(userMetadata.organizationId);
  // One seats population serves both fiscal windows, so it is loaded over the
  // span the two of them cover.
  const asOf = new Date();
  const fiscalConfig = { startMonth: userMetadata.organizationFY || 1 };
  const seatWindow = {
    start: resolveWindow('currentFY', asOf, fiscalConfig).start,
    end: resolveWindow('nextFY', asOf, fiscalConfig).end,
  };
  const run = (
    window: SpendWindow,
    groupBy: 'total' | 'vendor' | 'product',
    scope: SpendQueryScope,
  ) =>
    runSpendQuery(
      userMetadata,
      costMethodInput(costMethod, window, 'year', groupBy),
      scope,
    );
  return {
    organizationId: userMetadata.organizationId,
    costMethod,
    seatWindow,
    run,
  };
}

/** One vendor's slice, for the vendor page header. */
export async function getVendorCurrentFySpend(
  vendorId: number,
): Promise<VendorCurrentFySpend | null> {
  const runner = await vendorSpendRunner();
  if (!runner) return null;

  const response = await runner.run('currentFY', 'total', {
    vendorId,
    bloombergSid: true,
  });
  const amount = response.items.reduce((total, item) => total + item.value, 0);
  return {
    amount: toCents(amount),
    fiscalYear: response.window.fiscalYear,
    costMethod: runner.costMethod,
  };
}

const EMPTY_SPEND_INDEX: VendorSpendIndex = {
  byVendorId: new Map(),
  labels: new Map(),
  products: [],
};

function sumByGroupKey(
  items: SpendQueryResponse['items'],
): Map<number, number> {
  const sums = new Map<number, number>();
  for (const item of items) {
    const key = Number(item.groupKey);
    if (!Number.isFinite(key)) continue;
    sums.set(key, (sums.get(key) ?? 0) + item.value);
  }
  return sums;
}

function indexProducts(
  current: SpendQueryResponse,
  projected: SpendQueryResponse,
): VendorProductSpend[] {
  const products = new Map<string, VendorProductSpend>();
  const collect = (
    response: SpendQueryResponse,
    field: 'current' | 'projected',
  ) => {
    for (const item of response.items) {
      const ref = response.refs[item.groupKey];
      // A bucket the engine could not place under a vendor has no row to
      // sit in — the list itself leaves vendor-less contracts out.
      if (ref?.vendorId === undefined) continue;
      const [contractPart, productPart] = item.groupKey.split(':');
      const entry = products.get(item.groupKey) ?? {
        vendorId: ref.vendorId,
        contractId: Number(contractPart),
        productId: ref.productId ?? Number(productPart),
        name: ref.productName ?? ref.label,
        current: 0,
        projected: 0,
      };
      entry[field] += item.value;
      products.set(item.groupKey, entry);
    }
  };
  collect(current, 'current');
  collect(projected, 'projected');
  return [...products.values()].map((product) => ({
    ...product,
    current: toCents(product.current),
    projected: toCents(product.projected),
  }));
}

/**
 * Every vendor's current and next fiscal year at once, by vendor and by
 * product, for the vendors list. The seats population is loaded once and
 * shared by the four runs.
 */
export async function getVendorSpendIndex(): Promise<VendorSpendIndex> {
  const runner = await vendorSpendRunner();
  if (!runner) return EMPTY_SPEND_INDEX;

  const sid = await loadSidSpendPopulation(runner.organizationId, {
    window: runner.seatWindow,
  });
  const scope: SpendQueryScope = { bloombergSid: sid };
  const [
    currentByVendor,
    projectedByVendor,
    currentByProduct,
    projectedByProduct,
  ] = await Promise.all([
    runner.run('currentFY', 'vendor', scope),
    runner.run('nextFY', 'vendor', scope),
    runner.run('currentFY', 'product', scope),
    runner.run('nextFY', 'product', scope),
  ]);

  const current = sumByGroupKey(currentByVendor.items);
  const projected = sumByGroupKey(projectedByVendor.items);
  const byVendorId = new Map<number, VendorSpendTotals>();
  const labels = new Map<number, { name: string; domain?: string }>();
  for (const vendorId of new Set([...current.keys(), ...projected.keys()])) {
    byVendorId.set(vendorId, {
      current: toCents(current.get(vendorId) ?? 0),
      projected: toCents(projected.get(vendorId) ?? 0),
    });
    const ref =
      currentByVendor.refs[String(vendorId)] ??
      projectedByVendor.refs[String(vendorId)];
    if (ref)
      labels.set(vendorId, { name: ref.label, domain: ref.vendorDomain });
  }
  const products = indexProducts(currentByProduct, projectedByProduct);
  return {
    byVendorId,
    labels,
    products: [
      ...products,
      ...unpricedSeatProducts(
        sid.seats.map((record) => record.seat),
        products,
      ),
    ],
  };
}

export const EMPTY_SID_VENDOR_TOTALS: SidVendorTotals = {
  byVendorId: new Map(),
  labels: new Map(),
  seatCounts: new Map(),
  vendorIds: new Set(),
};

/**
 * Bloomberg seat spend per vendor for the current and next fiscal year, for
 * the surfaces whose contract figures are the committed engine stamps (Top
 * Vendors, the budget table): seats are priced on that same basis so one row
 * does not carry a different method from its neighbours. The org's default
 * method does not drive this; the vendor header and list, which follow it,
 * keep their own runner. One population serves both windows, and an org
 * without seats gets the empty totals at the cost of one lookup.
 */
export async function getSidVendorTotals(): Promise<SidVendorTotals> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return EMPTY_SID_VENDOR_TOTALS;

  const asOf = new Date();
  const fiscalConfig = { startMonth: userMetadata.organizationFY || 1 };
  const sid = await loadSidSpendPopulation(userMetadata.organizationId, {
    window: {
      start: resolveWindow('currentFY', asOf, fiscalConfig).start,
      end: resolveWindow('nextFY', asOf, fiscalConfig).end,
    },
  });
  if (sid.contracts.length === 0) return EMPTY_SID_VENDOR_TOTALS;

  // Contract grouping is where the runner rolls seats up per vendor, and the
  // seats-only population keeps the org's contracts out of a run that reads
  // twenty rollup keys.
  const run = (window: SpendWindow) =>
    runSpendQuery(
      userMetadata,
      costMethodInput('committed', window, 'year', 'contract'),
      { bloombergSid: sid, population: 'seats' },
    );
  const [current, projected] = await Promise.all([
    run('currentFY'),
    run('nextFY'),
  ]);

  const byVendorId = new Map<number, VendorSpendTotals>();
  const labels = new Map<number, { name: string; domain?: string }>();
  const collect = (
    response: SpendQueryResponse,
    field: keyof VendorSpendTotals,
  ) => {
    for (const item of response.items) {
      const vendorId = sidRollupVendorId(item.groupKey);
      if (vendorId === null) continue;
      const totals = byVendorId.get(vendorId) ?? { current: 0, projected: 0 };
      totals[field] = toCents(totals[field] + item.value);
      byVendorId.set(vendorId, totals);
      const ref = response.refs[item.groupKey];
      if (ref && !labels.has(vendorId)) {
        labels.set(vendorId, { name: ref.label, domain: ref.vendorDomain });
      }
    }
  };
  collect(current, 'current');
  collect(projected, 'projected');

  const seatCounts = new Map<number, number>();
  for (const { seat } of sid.seats) {
    if (seat.lastReportMonth !== null) continue;
    seatCounts.set(seat.vendorId, (seatCounts.get(seat.vendorId) ?? 0) + 1);
  }

  return { byVendorId, labels, seatCounts, vendorIds: sid.vendorIds };
}
