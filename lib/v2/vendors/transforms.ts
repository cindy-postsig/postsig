import { isAgreementType, isInvoiceType } from '@/app/lib/constants';
import { contractRowDates } from '@/lib/v2/contracts/transforms';
import { getUSDValue, sumValuesInUSD } from '@/lib/v2/core/budget';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import { readTermDateEntries } from '@/lib/v2/spend/contractInput';
import { toCents } from '@/lib/v2/spend';
import { sidContractId, type SidSeat } from '@/lib/v2/bloomberg-sid/spend';
import { toIsoDate } from '@/lib/v2/spend/resolver/resolveFeeSegments';
import logger from '@/utils/pino';
import {
  differenceInMonths,
  differenceInYears,
  format,
  parseISO,
} from 'date-fns';

export interface TopVendor {
  id: number | string;
  name: string;
  domain?: string;
  currentBudget: number;
  projectedBudget: number;
  totalContractValue: number;
  /** Non-invoice agreements only; invoices are counted separately. */
  contractCount: number;
  invoiceCount: number;
}

/**
 * Aggregate the kept contract set by vendor; top N by current spend.
 *
 * Values read through `getUSDValue`, so the engine stamps win exactly as
 * they do on the budget table and summary totals — invoices project no
 * renewals, a no-end-date invoice books single-month, stale invoices are
 * already dropped upstream — with the legacy price-history read only as the
 * unstamped fallback. TCV stays the legacy scalar deliberately (see
 * enrich.ts).
 *
 * Callers pass the same aggregatable set the budget chart uses
 * (`buildBudgetSummary().aggregatableContracts`): budget-filtered, stale
 * invoices excluded, linked child invoices and fully-superseded contracts
 * removed.
 */
export function aggregateTopVendors(
  contracts: ContractWithPricing[],
  limit = 12,
  seatSpend?: SidVendorTotals,
): TopVendor[] {
  const vendorMap = new Map<number | string, TopVendor>();

  for (const ec of contracts) {
    const vendorId = ec.vendor_id ?? ec.vendor_name;
    if (vendorId === undefined || vendorId === null) {
      logger.warn(
        { contractId: ec.id },
        'Missing both vendor_id and vendor name for top-vendor aggregation',
      );
      continue;
    }
    if (ec.vendor_id === undefined || ec.vendor_id === null) {
      logger.debug(
        { contractId: ec.id, vendorName: ec.vendor_name },
        'Using vendor name as key due to missing vendor_id',
      );
    }

    let entry = vendorMap.get(vendorId);
    if (!entry) {
      entry = {
        id: vendorId,
        name: ec.vendor_name,
        domain: ec.vendor_domain ?? undefined,
        currentBudget: 0,
        projectedBudget: 0,
        totalContractValue: 0,
        contractCount: 0,
        invoiceCount: 0,
      };
      vendorMap.set(vendorId, entry);
    }

    if (isInvoiceType(ec.contract.type_id)) entry.invoiceCount += 1;
    else entry.contractCount += 1;
    entry.currentBudget += getUSDValue(ec, 'currentBudget');
    entry.projectedBudget += getUSDValue(ec, 'projectedBudget');
    entry.totalContractValue += getUSDValue(ec, 'totalContractValue');
  }

  // Bloomberg seats have no contract rows: their annual figure joins the
  // vendor's entry, or stands as the entry when the vendor has no agreements.
  for (const [vendorId, totals] of seatSpend?.byVendorId ?? []) {
    const label = seatSpend?.labels.get(vendorId);
    let entry = vendorMap.get(vendorId);
    if (!entry) {
      entry = {
        id: vendorId,
        name: label?.name ?? String(vendorId),
        domain: label?.domain,
        currentBudget: 0,
        projectedBudget: 0,
        totalContractValue: 0,
        contractCount: 0,
        invoiceCount: 0,
      };
      vendorMap.set(vendorId, entry);
    }
    entry.currentBudget += totals.current;
    entry.projectedBudget += totals.projected;
  }

  return [...vendorMap.values()]
    .sort((a, b) => b.currentBudget - a.currentBudget)
    .slice(0, limit);
}

export interface VendorMetrics {
  totalVendorContractValue: number;
  relationshipStartDate: Date | null;
  projectedEndDate: Date | null;
  relationshipLengthDisplay: string | null;
}

function isoBound(
  pick: 'earliest' | 'latest',
  dates: readonly (string | null | undefined)[],
): string | null {
  let bound: string | null = null;
  for (const iso of dates) {
    if (!iso) continue;
    if (bound === null || (pick === 'earliest' ? iso < bound : iso > bound)) {
      bound = iso;
    }
  }
  return bound;
}

/**
 * Term dates are jsonb the app never validated on the way in, so a hand-typed
 * "01/31/2022" sits beside ISO strings. Every entry goes through the engine's
 * lenient reader: recoverable dates are normalised, the rest are dropped, and
 * nothing here ever builds a Date that `format` would throw on.
 */
function termDateBounds(
  contracts: ContractWithPricing[],
  column: 'term_start_date' | 'term_end_date',
  pick: 'earliest' | 'latest',
): string | null {
  return isoBound(
    pick,
    contracts.flatMap(({ contract }) =>
      readTermDateEntries(contract[column]).map((entry) =>
        toIsoDate(entry.date),
      ),
    ),
  );
}

const toDate = (iso: string | null): Date | null =>
  iso === null ? null : parseISO(iso);

/**
 * `seatTerms` is the span of a vendor's Bloomberg seat terms, `yyyy-MM-dd`;
 * it widens the contract bounds, so a vendor billed only through invoices
 * still reads its seats' first contract date and last renewal.
 */
export function calculateVendorMetrics(
  contracts: ContractWithPricing[],
  seatTerms: { start: string; end: string } | null = null,
): VendorMetrics {
  const totalVendorContractValue = sumValuesInUSD(contracts, (contract) =>
    getUSDValue(contract, 'totalContractValue'),
  );
  const relationshipStartDate = toDate(
    isoBound('earliest', [
      termDateBounds(contracts, 'term_start_date', 'earliest'),
      seatTerms?.start,
    ]),
  );
  const projectedEndDate = toDate(
    isoBound('latest', [
      termDateBounds(contracts, 'term_end_date', 'latest'),
      seatTerms?.end,
    ]),
  );

  let relationshipLengthDisplay: string | null = null;
  if (relationshipStartDate) {
    const today = new Date();
    const years = differenceInYears(today, relationshipStartDate);

    if (years < 1) {
      const months = differenceInMonths(today, relationshipStartDate);
      relationshipLengthDisplay = `${months} month${months !== 1 ? 's' : ''}`;
    } else {
      relationshipLengthDisplay = `${years} year${years !== 1 ? 's' : ''}`;
    }
  }

  return {
    totalVendorContractValue,
    relationshipStartDate,
    projectedEndDate,
    relationshipLengthDisplay,
  };
}

export interface VendorProductRow {
  kind: 'product';
  id: string;
  name: string;
  /** The dates of the contract the product is on; null for Bloomberg seats. */
  cancelByDate: string | null;
  termEndDate: string | null;
  /** Org base currency, same engine and cost method as the vendor row. */
  currentSpend: number;
  projectedSpend: number;
}

export interface VendorListRow {
  kind: 'vendor';
  id: number;
  name: string;
  domain?: string;
  /** Org base currency; the same figure the vendor page header shows. */
  currentSpend: number;
  /** Next fiscal year, same engine and cost method as `currentSpend`. */
  projectedSpend: number;
  /** `yyyy-MM-dd`; the same figure the vendor page shows as Relationship Start. */
  relationshipStartDate: string | null;
  /** Fraction (0–1) of the listed vendors' combined current spend. */
  spendShare: number;
  /** MSAs, service orders and amendments only (`AGREEMENT_TYPE_IDS`). */
  activeAgreements: number;
  assetClasses: string[];
  /**
   * One row per product with spend in the current or next fiscal year: the
   * engine's product buckets rolled up by product within the vendor, so the
   * rows sum to the vendor's own figures. A product on two of the vendor's
   * contracts (a renewal that split the fiscal year) is one row carrying the
   * dates of the contract that ends last; Bloomberg seats roll up to their
   * product and carry no dates.
   */
  subRows: VendorProductRow[];
}

export type VendorTableRow = VendorListRow | VendorProductRow;

export interface VendorSpendTotals {
  current: number;
  projected: number;
}

/** One engine product bucket, placed under its vendor by the engine's refs. */
export interface VendorProductSpend {
  vendorId: number;
  contractId: number;
  /** Catalog product id, or the Bloomberg product code for a seat. */
  productId: number;
  name: string;
  current: number;
  projected: number;
}

/**
 * Bloomberg seat spend per vendor for the current and next fiscal year, on the
 * committed basis the Top Vendors bars and the budget table's columns already
 * use. Vendors with seats are also the vendors whose invoices those surfaces
 * must drop.
 */
export interface SidVendorTotals {
  byVendorId: ReadonlyMap<number, VendorSpendTotals>;
  labels: ReadonlyMap<number, { name: string; domain?: string }>;
  /** Live seats per vendor in the latest report. */
  seatCounts: ReadonlyMap<number, number>;
  vendorIds: ReadonlySet<number>;
}

/**
 * Bloomberg products the engine never priced — every seat of the product is
 * on a zero price — as product rows at zero, so the vendors list names the
 * same products the vendor page and Assignments do. Keyed by vendor and
 * product code; a product with any priced seat is already in `priced`.
 */
export function unpricedSeatProducts(
  seats: readonly SidSeat[],
  priced: readonly VendorProductSpend[],
): VendorProductSpend[] {
  const seen = new Set(
    priced
      .filter((product) => product.contractId < 0)
      .map((product) => `${product.vendorId}:${product.productId}`),
  );
  const rows = new Map<string, VendorProductSpend>();
  for (const seat of seats) {
    if (seat.lastReportMonth !== null) continue;
    const key = `${seat.vendorId}:${seat.gptt}`;
    if (seen.has(key) || rows.has(key)) continue;
    rows.set(key, {
      vendorId: seat.vendorId,
      contractId: sidContractId(seat.custNum),
      productId: seat.gptt,
      name: seat.gpttDescription,
      current: 0,
      projected: 0,
    });
  }
  return [...rows.values()];
}

/** The engine's current and next FY spend, by vendor and by product. */
export interface VendorSpendIndex {
  byVendorId: ReadonlyMap<number, VendorSpendTotals>;
  /** Display data the engine returned for the vendor keys it spent on. */
  labels: ReadonlyMap<number, { name: string; domain?: string }>;
  products: readonly VendorProductSpend[];
}

const NO_SPEND: VendorSpendTotals = { current: 0, projected: 0 };

/**
 * One row per vendor from the contract set the vendor page itself reads, so
 * every figure here matches the header of the page the row links to. Spend
 * comes from the same engine query the header runs, so a vendor whose spend
 * is seats rather than contracts still gets a row — labelled from the
 * engine's refs, with nothing to count or date. Contracts with no vendor id
 * cannot be linked to a vendor page and are left out.
 */
export function buildVendorListRows(
  contracts: ContractWithPricing[],
  spend: VendorSpendIndex,
): VendorListRow[] {
  const byVendor = new Map<number, ContractWithPricing[]>();
  for (const ec of contracts) {
    if (ec.vendor_id === null || ec.vendor_id === undefined) continue;
    const group = byVendor.get(ec.vendor_id);
    if (group) group.push(ec);
    else byVendor.set(ec.vendor_id, [ec]);
  }
  const productsByVendor = buildVendorProductRows(spend.products, contracts);

  const vendors: Omit<VendorListRow, 'spendShare'>[] = [
    ...byVendor.entries(),
  ].map(([id, vendorContracts]) => {
    const { relationshipStartDate } = calculateVendorMetrics(vendorContracts);
    const [first] = vendorContracts;
    const totals = spend.byVendorId.get(id) ?? NO_SPEND;
    return {
      kind: 'vendor',
      id,
      name: first.vendor_name,
      domain: first.vendor_domain,
      currentSpend: totals.current,
      projectedSpend: totals.projected,
      relationshipStartDate: relationshipStartDate
        ? format(relationshipStartDate, 'yyyy-MM-dd')
        : null,
      activeAgreements: vendorContracts.filter((ec) =>
        isAgreementType(ec.contract.type_id),
      ).length,
      assetClasses: uniqueAssetClassNames(vendorContracts),
      subRows: productsByVendor.get(id) ?? [],
    };
  });
  for (const [id, totals] of spend.byVendorId) {
    if (byVendor.has(id)) continue;
    const label = spend.labels.get(id);
    vendors.push({
      kind: 'vendor',
      id,
      name: label?.name ?? `#${id}`,
      domain: label?.domain,
      currentSpend: totals.current,
      projectedSpend: totals.projected,
      relationshipStartDate: null,
      activeAgreements: 0,
      assetClasses: [],
      subRows: productsByVendor.get(id) ?? [],
    });
  }
  const totalSpend = vendors.reduce((sum, v) => sum + v.currentSpend, 0);

  return vendors
    .map((vendor) => ({
      ...vendor,
      spendShare: totalSpend > 0 ? vendor.currentSpend / totalSpend : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildVendorProductRows(
  products: readonly VendorProductSpend[],
  contracts: ContractWithPricing[],
): Map<number, VendorProductRow[]> {
  const datesByContract = new Map(
    contracts.map((ec) => [ec.id, contractRowDates(ec)]),
  );
  const byVendor = new Map<number, Map<string, VendorProductRow>>();

  for (const product of products) {
    // Seat keys live in the negative contract id space (bloomberg-sid/spend.ts),
    // so a Bloomberg product code can never merge with a catalog product id.
    const rollupKey = `${product.contractId < 0 ? 'seat' : 'product'}:${product.productId}`;
    const rows = byVendor.get(product.vendorId) ?? new Map();
    byVendor.set(product.vendorId, rows);

    const dates = datesByContract.get(product.contractId);
    const existing = rows.get(rollupKey);
    if (!existing) {
      rows.set(rollupKey, {
        kind: 'product',
        id: `${product.vendorId}:${rollupKey}`,
        name: product.name,
        cancelByDate: dates?.cancelByDate ?? null,
        termEndDate: dates?.termEndDate ?? null,
        currentSpend: product.current,
        projectedSpend: product.projected,
      });
      continue;
    }
    existing.currentSpend += product.current;
    existing.projectedSpend += product.projected;
    if (dates && (dates.termEndDate ?? '') > (existing.termEndDate ?? '')) {
      existing.termEndDate = dates.termEndDate;
      existing.cancelByDate = dates.cancelByDate;
    }
  }

  return new Map(
    [...byVendor].map(([vendorId, rows]) => [
      vendorId,
      [...rows.values()]
        .map((row) => ({
          ...row,
          currentSpend: toCents(row.currentSpend),
          projectedSpend: toCents(row.projectedSpend),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ]),
  );
}

function uniqueAssetClassNames(contracts: ContractWithPricing[]): string[] {
  const names = new Set<string>();
  for (const ec of contracts) {
    for (const link of ec.contract.contract_asset_classes ?? []) {
      const name = link.asset_classes?.name;
      if (name) names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
