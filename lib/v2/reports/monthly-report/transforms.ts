/**
 * V2 Transforms for Monthly Report
 *
 * Pure functions that shape per-contract engine values (see engine.ts) into
 * UI rows. Monthly numbers come exclusively from the spend engine; enriched
 * contracts supply display metadata (vendor, products, tags, superseded
 * styling).
 */

import { addMonths, parseISO } from 'date-fns';
import { buildContractHierarchyMap } from '@/lib/inventory/hierarchyUtils';
import { sharedNameBreadcrumbs } from '@/lib/v2/cost-allocation/target-path';
import { ContractWithPricing } from '@/lib/v2/core/types';
import type { OrgUnitNode } from '@/lib/v2/org-units';
import {
  contractOwners,
  ownerSponsorNames,
  type OwnerGroup,
} from '@/lib/v2/owners';
import {
  splitByAllocation,
  toCents,
  UNASSIGNED_KEY,
  type AllocationShares,
  type RelationshipEdge,
} from '@/lib/v2/spend';
import type { MonthlyValues, ProductMonthlyValues } from './engine';

/**
 * PSK-1796 denomination split, shared by both row levels.
 *
 * `currentMonth` / `nextMonth` / `change` are ALWAYS the org base currency.
 * They are what rolls up — the overview tiles sum the sponsor rows, and the
 * tables sort and rank on them — so they have to stay in one denomination no
 * matter what the row displays.
 *
 * `display*` with `currency` is what the row renders. A child row is a single
 * contract, so it displays that contract's own currency, unconverted. A parent
 * row displays its children's shared currency when they all agree (no reason to
 * translate a group that is entirely USD into EUR) and falls back to base when
 * they do not, because a sum across mixed denominations is only meaningful
 * once translated.
 *
 * Consequence, accepted deliberately: in a mixed-currency org a natively
 * displayed parent row will not visibly add up to the base-denominated tile
 * above it.
 */
export interface DisplayAmounts {
  currency: string;
  displayCurrentMonth: number;
  displayNextMonth: number;
  displayChange: number;
}

/**
 * The denomination a parent row takes from the children it currently shows.
 *
 * Exported because the tag filter rebuilds parent rows client-side from a
 * SUBSET of the children: filtering can change the answer (a mixed group whose
 * remaining children are all USD becomes a USD row), so the rule has to be
 * re-applied there rather than carried over from the unfiltered row.
 */
export function summarizeRowDenomination(
  subRows: Array<
    Pick<ProductData, keyof DisplayAmounts | 'currentMonth' | 'nextMonth'>
  >,
  baseCurrency: string,
): DisplayAmounts {
  const base = normalizeCurrency(baseCurrency);
  const currencies = new Set(subRows.map((r) => normalizeCurrency(r.currency)));
  const currency = currencies.size === 1 ? [...currencies][0] : base;
  const native = currency !== base;

  const sum = (pick: (r: (typeof subRows)[number]) => number) =>
    subRows.reduce((total, row) => toCents(total + (pick(row) || 0)), 0);

  const currentMonth = native
    ? sum((r) => r.displayCurrentMonth)
    : sum((r) => r.currentMonth);
  const nextMonth = native
    ? sum((r) => r.displayNextMonth)
    : sum((r) => r.nextMonth);

  return {
    currency,
    displayCurrentMonth: currentMonth,
    displayNextMonth: nextMonth,
    displayChange: nextMonth - currentMonth,
  };
}

/**
 * Rebuilds a sponsor/group parent row from the children a tag filter kept.
 *
 * Base totals re-sum with the builder's per-add cents rounding (a raw float
 * reduce would drift from the server-computed parents), the vendor count is
 * distinct vendors — two matching contracts from one vendor are still one
 * vendor, matching the builder's validVendorIds — and the denomination is
 * re-derived rather than inherited, because filtering can change which
 * currency the remaining children share.
 */
export function refilterParentRow<T extends BusinessSponsorAndGroupData>(
  parent: T,
  selectedTag: string,
  baseCurrency: string,
): T {
  const filteredSubRows =
    parent.subRows?.filter((vendor) => vendor.tags?.includes(selectedTag)) ||
    [];

  const currentMonth = filteredSubRows.reduce(
    (sum, vendor) => toCents(sum + (vendor.currentMonth || 0)),
    0,
  );
  const nextMonth = filteredSubRows.reduce(
    (sum, vendor) => toCents(sum + (vendor.nextMonth || 0)),
    0,
  );

  return {
    ...parent,
    subRows: filteredSubRows,
    vendors: new Set(filteredSubRows.map((row) => row.vendor)).size,
    currentMonth,
    nextMonth,
    change: nextMonth - currentMonth,
    ...summarizeRowDenomination(filteredSubRows, baseCurrency),
  };
}

export interface BusinessSponsorAndGroupData extends DisplayAmounts {
  id: number;
  name: string;
  vendors: number;
  currentMonth: number;
  nextMonth: number;
  change: number;
  subRows: ProductData[];
}

export interface ProductData extends DisplayAmounts {
  id: string;
  contractId: number;
  name: string;
  vendor: string;
  vendorDomain?: string;
  product: string;
  currentMonth: number;
  nextMonth: number;
  change: number;
  tags: string[];
  isSplit?: boolean;
  businessGroups?: string[];
  groupCount?: number;
  businessSponsors?: string[];
  sponsorCount?: number;
  billingFrequency?: string | null;
  // V2: Superseded info for styling
  supersededProducts: string[];
  currentYearProducts: any[];
}

export interface PriceChangeData {
  id: number;
  contractId: number;
  vendor: string;
  vendorDomain?: string;
  product: string;
  logo: string;
  previousPrice: number;
  newPrice: number;
  change: number;
  reasonForChange: string;
  tags: string[];
  /**
   * Currency the three amounts above are denominated in. A price change is a
   * single contract, so it reports in that contract's own currency (PSK-1796).
   */
  currency: string;
  /**
   * The same change in the org base currency, for the one figure that spans
   * rows: the "net price change across N products" summary. Rows are selected
   * on the constant-currency change above, so no row here is a pure FX
   * artefact; this is that real set of changes stated as-reported in base.
   */
  changeBase: number;
}

export interface TopVendorData {
  name: string;
  spend: number;
}

// The engine keys sponsor-less/group-less contracts 'unassigned'
// (grouping.ts); the report has always displayed 'Unassigned'.
function displayName(key: string): string {
  return key === 'unassigned' ? 'Unassigned' : key;
}

function extractContractTags(contract: any): string[] {
  if (!contract.contract_tags) return [];

  return contract.contract_tags
    .map((tagItem: any) => tagItem.user_tags?.name)
    .filter(Boolean);
}

function formatProductNames(vendorProductDetails: any[]): string {
  if (!vendorProductDetails?.length) return '';

  const productNames = vendorProductDetails
    .map((detail) => detail.vendor_products?.name)
    .filter(Boolean);

  if (productNames.length === 0) return '';
  if (productNames.length === 1) return productNames[0];

  return productNames.join(', ');
}

interface DimensionEntry {
  ec: ContractWithPricing;
  allKeys: string[];
  currentPiece: number;
  nextPiece: number;
  nativeCurrentPiece: number;
  nativeNextPiece: number;
}

/**
 * One split unit: a whole contract (productId null) or one product, with the
 * percentage shares its value splits across. Both report dimensions are one
 * whole-contract scope at equal shares — owner rows have no product dimension.
 */
interface DimensionScope {
  productId: number | null;
  shares: AllocationShares;
}

type ScopesOf = (
  ec: ContractWithPricing,
  productIds: number[],
) => DimensionScope[];

const UNASSIGNED_SHARES: AllocationShares = [[UNASSIGNED_KEY, 100]];

/** Currency codes reach here in whatever case the row was written in. */
function normalizeCurrency(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase() || 'USD';
}

/**
 * Shared sponsor/group table builder. Splits each scope's engine values across
 * its dimension shares with the engine's own cents-preserving splitter, so
 * table totals reconcile with the engine's sponsor/allocation output by
 * construction (additivity: pieces sum back to the scope value exactly).
 *
 * Exported for the backfill equality gate, which replays the legacy group
 * derivation through this same body — the gate then isolates exactly what the
 * allocation cutover changed: the key derivation and the shares.
 */
export function buildSpendByShares(
  contracts: ContractWithPricing[],
  values: Map<number, MonthlyValues>,
  scopesOf: ScopesOf,
  dimension: 'sponsor' | 'group',
  denomination?: DenominationContext,
  productValues?: ProductMonthlyValues,
): BusinessSponsorAndGroupData[] {
  // key → contract id → the contract's one entry under that key. Product
  // scopes (and a duplicate key within one scope) merge into it, so a
  // contract keeps one sub-row per group; pieces are additive, so the parent
  // totals are unchanged by the merge.
  const dimensionMap = new Map<string, Map<number, DimensionEntry>>();
  const nativeValues = denomination?.nativeValues;
  const nativeProductValues = denomination?.nativeProductValues;
  const base = normalizeCurrency(denomination?.baseCurrency);

  contracts.forEach((ec) => {
    const contractValues = values.get(ec.id);

    // Absent from the native map means the contract is already denominated in
    // the base currency, so `values` holds its native amounts too.
    const nativeContractValues = nativeValues?.get(ec.id) ?? contractValues;

    const contractProductValues = productValues?.get(ec.id);
    const scopes = scopesOf(ec, [...(contractProductValues?.keys() ?? [])]).map(
      (scope) => ({
        productId: scope.productId,
        shares: scope.shares.map(
          ([key, percent]) => [displayName(key), percent] as [string, number],
        ),
      }),
    );

    const allKeys: string[] = [];
    for (const scope of scopes) {
      for (const [key] of scope.shares) {
        if (!allKeys.includes(key)) allKeys.push(key);
      }
    }

    for (const scope of scopes) {
      const scoped =
        scope.productId === null
          ? contractValues
          : contractProductValues?.get(scope.productId);
      const scopedNative =
        scope.productId === null
          ? nativeContractValues
          : (nativeProductValues?.get(ec.id)?.get(scope.productId) ?? scoped);

      const currentPieces = splitByAllocation(
        scoped?.currentMonth ?? 0,
        scope.shares,
      );
      const nextPieces = splitByAllocation(
        scoped?.nextMonth ?? 0,
        scope.shares,
      );
      // Split the native amounts across the same shares, so a contract shared
      // by two keys donates the same fraction in both denominations.
      const nativeCurrentPieces = splitByAllocation(
        scopedNative?.currentMonth ?? 0,
        scope.shares,
      );
      const nativeNextPieces = splitByAllocation(
        scopedNative?.nextMonth ?? 0,
        scope.shares,
      );

      scope.shares.forEach(([key], index) => {
        let byContract = dimensionMap.get(key);
        if (!byContract) {
          byContract = new Map();
          dimensionMap.set(key, byContract);
        }
        const existing = byContract.get(ec.id);
        const entry: DimensionEntry = existing ?? {
          ec,
          allKeys,
          currentPiece: 0,
          nextPiece: 0,
          nativeCurrentPiece: 0,
          nativeNextPiece: 0,
        };
        // Same per-add cents rounding as the accumulators below.
        entry.currentPiece = toCents(
          entry.currentPiece + currentPieces[index][1],
        );
        entry.nextPiece = toCents(entry.nextPiece + nextPieces[index][1]);
        entry.nativeCurrentPiece = toCents(
          entry.nativeCurrentPiece + nativeCurrentPieces[index][1],
        );
        entry.nativeNextPiece = toCents(
          entry.nativeNextPiece + nativeNextPieces[index][1],
        );
        if (!existing) byContract.set(ec.id, entry);
      });
    }
  });

  const rows: BusinessSponsorAndGroupData[] = [];
  let rowId = 1;

  dimensionMap.forEach((entriesByContract, name) => {
    const subRows: ProductData[] = [];
    let rowCurrentMonth = 0;
    let rowNextMonth = 0;
    let contractIndex = 1;
    const validVendorIds = new Set<number>();

    entriesByContract.forEach(
      ({
        ec,
        allKeys,
        currentPiece,
        nextPiece,
        nativeCurrentPiece,
        nativeNextPiece,
      }) => {
        const contractValues = values.get(ec.id);
        // Skip contracts with zero fees for both current and next month
        if (
          !contractValues ||
          (contractValues.currentMonth === 0 && contractValues.nextMonth === 0)
        ) {
          return;
        }

        const contract = ec.contract;
        const tags = extractContractTags(contract);
        const vendorName = ec.vendor_name || 'Unknown Vendor';
        const vendorDomain = ec.vendor_domain;
        const productNames = formatProductNames(
          contract.vendor_products_details || [],
        );

        if (ec.vendor_id !== null) {
          validVendorIds.add(ec.vendor_id);
        }

        const supersededProducts = ec.products
          .filter((p) => p.isSuperseded)
          .map((p) => `${p.product_id}-${p.year || 1}`);

        const currentYearProducts = ec.products.map((p) => ({
          id: p.product_id,
          year: p.year || 1,
          vendor_products: { id: p.product_id, name: p.name },
        }));

        const childCurrency = normalizeCurrency(contract.currency);

        subRows.push({
          id: `${rowId}-${contractIndex}`,
          contractId: ec.id,
          name: vendorName,
          vendor: vendorName,
          vendorDomain,
          product: productNames,
          currentMonth: currentPiece,
          nextMonth: nextPiece,
          change: nextPiece - currentPiece,
          // A child row is a single contract, so it shows unconverted.
          currency: childCurrency,
          displayCurrentMonth: nativeCurrentPiece,
          displayNextMonth: nativeNextPiece,
          displayChange: nativeNextPiece - nativeCurrentPiece,
          tags,
          isSplit: allKeys.length > 1,
          ...(dimension === 'sponsor'
            ? { businessSponsors: allKeys, sponsorCount: allKeys.length }
            : { businessGroups: allKeys, groupCount: allKeys.length }),
          billingFrequency: ec.priceHistory?.billingFrequency,
          supersededProducts,
          currentYearProducts,
        });

        // Same per-add cents rounding as the engine's line-item accumulator, so
        // dimension totals match engine groupBy:'sponsor'/'group' output exactly.
        rowCurrentMonth = toCents(rowCurrentMonth + currentPiece);
        rowNextMonth = toCents(rowNextMonth + nextPiece);
        contractIndex++;
      },
    );

    if (subRows.length > 0) {
      rows.push({
        id: rowId,
        name,
        vendors: validVendorIds.size,
        currentMonth: rowCurrentMonth,
        nextMonth: rowNextMonth,
        change: rowNextMonth - rowCurrentMonth,
        // One code path owns the parent-denomination rule — the same helper
        // the client-side tag filter re-derives with, so a filtered and an
        // unfiltered parent can never disagree. Its per-add cents rounding
        // matches the accumulators above, so nothing moves.
        ...summarizeRowDenomination(subRows, base),
        subRows,
      });
    }

    rowId++;
  });

  return rows.sort((a, b) => {
    if (b.currentMonth !== a.currentMonth) {
      return b.currentMonth - a.currentMonth;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * The conversion context the builders denominate against. The two fields are
 * one unit: `nativeValues` is only meaningful against the base currency it was
 * derived from, so a caller cannot state one without the other. Omitting the
 * whole object means "no conversion happened" — every value is already native
 * (a single-currency org, or a pre-converted legacy fixture).
 */
export interface DenominationContext {
  /** Contracts priced outside the base currency; others are native in `values`. */
  nativeValues?: Map<number, MonthlyValues>;
  /** Per-product companion to `nativeValues`, for product-scoped allocation splits. */
  nativeProductValues?: ProductMonthlyValues;
  baseCurrency: string;
}

export function buildSpendByBusinessSponsor(
  contracts: ContractWithPricing[],
  values: Map<number, MonthlyValues>,
  denomination?: DenominationContext,
): BusinessSponsorAndGroupData[] {
  return buildSpendByShares(
    contracts,
    values,
    (ec) => {
      const names = ownerSponsorNames(contractOwners(ec.contract));
      return [
        {
          productId: null,
          shares:
            names.length === 0
              ? UNASSIGNED_SHARES
              : names.map((name) => [name, 1] as [string, number]),
        },
      ];
    },
    'sponsor',
    denomination,
  );
}

/**
 * Two owner groups can share a name on different branches, and the row is
 * keyed by that name, so a shared name carries its parent path. The path can
 * only be built from groups that are themselves owned somewhere in the org —
 * the embed joins each unit but not its ancestors — so a collision whose
 * parents nobody owns falls back to the bare name and the two merge.
 */
function ownerGroupNamer(groups: OwnerGroup[]): (group: OwnerGroup) => string {
  const unitsById = new Map<number, OrgUnitNode>(
    groups.map((group) => [
      group.id,
      {
        id: group.id,
        level: group.level,
        name: group.name,
        parent_id: group.parentId,
      },
    ]),
  );
  const breadcrumbs = sharedNameBreadcrumbs([...unitsById.values()], unitsById);
  return (group) => {
    const breadcrumb = breadcrumbs.get(group.id);
    return breadcrumb ? `${group.name} (${breadcrumb})` : group.name;
  };
}

/**
 * Spend by Business Group over the contract's owner groups (psk-1975), keyed
 * by the group's display name and split with the shared cents-preserving
 * splitter. Owner rows carry no product dimension, so every scope is the
 * whole contract.
 *
 * A contract with no owner groups takes the nearest owned ancestor's, walking
 * the same hierarchy every other spend surface walks: an invoice is paperwork
 * under an owned contract, and without the walk every invoice's spend would
 * land in Unassigned on the Actual Cost basis. The sponsor section
 * deliberately does not inherit.
 */
export function buildSpendByBusinessGroup(
  contracts: ContractWithPricing[],
  values: Map<number, MonthlyValues>,
  relationships: RelationshipEdge[],
  denomination?: DenominationContext,
): BusinessSponsorAndGroupData[] {
  const groupsByContract = new Map<number, OwnerGroup[]>(
    contracts.map((ec) => [ec.id, contractOwners(ec.contract).groups]),
  );
  const nameOf = ownerGroupNamer([...groupsByContract.values()].flat());
  const { parents } = buildContractHierarchyMap(contracts, relationships);

  const ownedGroups = (contractId: number): OwnerGroup[] => {
    const visited = new Set<number>();
    let current: number | undefined = contractId;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const groups = groupsByContract.get(current);
      if (groups && groups.length > 0) return groups;
      current = parents.get(current);
    }
    return [];
  };

  return buildSpendByShares(
    contracts,
    values,
    (ec) => {
      const groups = ownedGroups(ec.id);
      return [
        {
          productId: null,
          shares:
            groups.length === 0
              ? UNASSIGNED_SHARES
              : groups.map((group) => [nameOf(group), 1] as [string, number]),
        },
      ];
    },
    'group',
    denomination,
  );
}

function generateVendorLogo(vendorName: string): string {
  const words = vendorName.split(' ');
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
}

function detectPriceChangeReason(
  contract: any,
  change: number,
  asOf: Date,
): string {
  const currentMonth = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const nextMonth = addMonths(currentMonth, 1);

  if (contract.will_not_renew && contract.term_end_date?.[0]?.date) {
    const contractEndDate = parseISO(contract.term_end_date[0].date);
    const contractEndMonth = new Date(
      contractEndDate.getFullYear(),
      contractEndDate.getMonth(),
      1,
    );

    if (contractEndMonth.getTime() === currentMonth.getTime()) {
      return 'Contract will not renew';
    }
    if (contractEndMonth.getTime() === nextMonth.getTime()) {
      return 'Contract will not renew';
    }
  }

  if (change > 0) {
    return 'Price increase';
  } else if (change < 0) {
    return 'Price decrease';
  }
  return 'No change';
}

export function transformToTopVendorsBySpend(
  contracts: ContractWithPricing[],
  values: Map<number, MonthlyValues>,
): TopVendorData[] {
  const vendorSpendMap = new Map<string, number>();

  contracts.forEach((ec) => {
    const currentMonthSpend = values.get(ec.id)?.currentMonth ?? 0;
    const vendorName = ec.vendor_name || 'Unknown Vendor';
    const existingSpend = vendorSpendMap.get(vendorName) || 0;
    vendorSpendMap.set(vendorName, existingSpend + currentMonthSpend);
  });

  const topVendors: TopVendorData[] = [];
  vendorSpendMap.forEach((spend, vendor) => {
    topVendors.push({ name: vendor, spend });
  });

  return topVendors.sort((a, b) => b.spend - a.spend).slice(0, 10);
}

/**
 * Rows are per contract, so both the figures and the change that selects them
 * read in the contract's own currency.
 *
 * `nativeValues` carries those amounts for contracts priced outside the org
 * base currency; a contract absent from it is already native in `values`.
 * Selecting on the base figures instead would admit rows whose only movement is
 * the FX rate differing between the two months, reported to the reader as a
 * price increase the vendor never made (PSK-1796).
 */
export function transformToPriceChanges(
  contracts: ContractWithPricing[],
  values: Map<number, MonthlyValues>,
  asOf: Date,
  nativeValues?: Map<number, MonthlyValues>,
): PriceChangeData[] {
  const priceChanges: PriceChangeData[] = [];
  let changeId = 1;

  contracts.forEach((ec) => {
    const contractValues = nativeValues?.get(ec.id) ?? values.get(ec.id);
    if (
      !contractValues ||
      (contractValues.currentMonth === 0 && contractValues.nextMonth === 0)
    ) {
      return;
    }

    // Include if there's any non-zero change and current month > 0
    if (contractValues.change !== 0 && contractValues.currentMonth > 0) {
      const contract = ec.contract;
      const tags = extractContractTags(contract);
      const vendorName = ec.vendor_name || 'Unknown Vendor';
      const vendorDomain = ec.vendor_domain;
      const productName = formatProductNames(
        contract.vendor_products_details || [],
      );
      const reasonForChange = detectPriceChangeReason(
        contract,
        contractValues.change,
        asOf,
      );

      priceChanges.push({
        id: changeId,
        contractId: ec.id,
        vendor: vendorName,
        vendorDomain,
        product: productName,
        logo: generateVendorLogo(vendorName),
        previousPrice: contractValues.currentMonth,
        newPrice: contractValues.nextMonth,
        change: contractValues.change,
        reasonForChange,
        tags,
        currency: normalizeCurrency(ec.contract.currency),
        changeBase: values.get(ec.id)?.change ?? contractValues.change,
      });

      changeId++;
    }
  });

  // Ranked on the base-denominated change: rows display in their own
  // currencies, and magnitudes across currencies only compare once
  // translated (a large native yen change can be a small euro one).
  return priceChanges.sort((a, b) => {
    const absA = Math.abs(a.changeBase);
    const absB = Math.abs(b.changeBase);
    if (absA !== absB) {
      return absB - absA;
    }
    return a.changeBase - b.changeBase;
  });
}
