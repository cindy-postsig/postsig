/**
 * Contract Transforms
 *
 * Pure functions to transform EnrichedContract to ContractTableRow format.
 * These are the V2-native transforms that produce properly typed output.
 */

import { EnrichedContract } from './service';
import {
  ContractTableRow,
  VendorGroupRow,
  ProductSubRow,
  CurrentProduct,
} from '@/lib/v2/core/types';
import {
  extractBudgetFromPriceHistory,
  getFiscalYearInfo,
} from '@/app/lib/budget';
import { isBefore, parseISO } from 'date-fns';
import { DEFAULT_INVOICE_STATUS } from '@/constants/invoiceStatus';
import _ from 'lodash';
import { sumValuesInUSD } from '@/lib/v2/core/budget';
import {
  contractOwners,
  ownerGroupRefs,
  ownerSponsorNames,
} from '@/lib/v2/owners/embed';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import { nestContractRowsByLineage } from './lineageRows';
import type { RelationshipEdge } from '@/lib/v2/spend';
import { isInvoiceType } from '@/app/lib/constants';

/**
 * Transform an EnrichedContract to ContractTableRow format.
 */
/**
 * Struck-through in tables: superseded by an amendment OR cancelled by a
 * confirmed lineage event (PSK-1830).
 *
 * Invoices are exempt from the cancelled arm. An invoice is never itself
 * cancelled — only the service order or agreement commanding it is — so a
 * later cancellation does not reach back and invalidate billing that already
 * happened on the invoice's own dates. Amendment supersession still strikes
 * on invoices, and cancellation still strikes everywhere else.
 *
 * This also keeps billed products in an invoice's totals: the summing loop
 * skips struck subrows, so the same flag drives both the styling and the money.
 */
const isStruckProduct = (
  p: {
    isSuperseded: boolean;
    isCancelled?: boolean;
  },
  typeId?: number | null,
): boolean =>
  p.isSuperseded || (p.isCancelled === true && !isInvoiceType(typeId));

export function buildContractTableRow(
  contract: EnrichedContract,
): ContractTableRow {
  const c = contract.contract;
  const priceHistory = contract.priceHistory;
  const budgetInfo = priceHistory
    ? extractBudgetFromPriceHistory(priceHistory)
    : null;

  const engine = contract.engineSpend;

  const { termStartDate, termEndDate, cancelByDate } =
    contractRowDates(contract);
  const inheritedCancelByDate = contract.inheritedCancelByDate ?? null;
  const originalStartDate =
    c.term_start_date?.[c.term_start_date.length - 1]?.date || '';
  const originalEndDate =
    c.term_end_date?.[c.term_end_date.length - 1]?.date || '';

  // Build tags array
  const tags =
    c.contract_tags
      ?.map((tagItem: any) => ({
        id: tagItem.tag_id,
        name: tagItem.user_tags?.name,
      }))
      .filter((tag: any) => tag.name)
      .sort((a: any, b: any) => a.name.localeCompare(b.name)) || [];

  const owners = contractOwners(c);
  const businessGroups = ownerGroupRefs(owners);
  const sponsorNames = ownerSponsorNames(owners);
  const currency = c.currency?.toUpperCase() || 'USD';

  // Build current products from enriched products
  const currentProducts: CurrentProduct[] = contract.products.map((p) => ({
    product_id: p.product_id,
    fees: p.currentFee,
    compoundedFees: p.currentFee,
    originalFees: p.fees,
    vendor_products: {
      id: p.product_id,
      name: p.name,
    },
    originalCurrency: currency,
    isSuperseded: isStruckProduct(p, c.type_id),
  }));

  // Current year products filtered to active period from budgetInfo
  // This ensures product subrows match the current budget period
  const currentYearProducts =
    budgetInfo?.currentYearProducts?.map((p: any) => ({
      ...p,
      vendor_products: p.vendor_products || {
        id: p.product_id,
        name: p.name,
      },
      originalCurrency: currency,
      // Find isSuperseded flag from the enriched products
      isSuperseded: contract.products.some(
        (ep) =>
          ep.product_id === p.product_id && isStruckProduct(ep, c.type_id),
      ),
    })) || currentProducts;

  // Financial values: engine stamps win wherever the fetch boundary set them
  // (getContractsList); unstamped paths (archived view, tests) keep the
  // legacy price-history reads. Native pair drives display, base-currency pair
  // drives conversion-dependent consumers — same precedence getUSDValue applies to
  // totals, now at row level (product decision 2026-08-04).
  const isInvoiceRow = isInvoiceType(c.type_id);
  const currentBudget = engine
    ? engine.currentNative
    : budgetInfo?.current || 0;
  const currentUSD = engine ? engine.currentBase : budgetInfo?.currentUSD || 0;
  // An invoice's fee was billed once, on its dates — nothing projects forward
  // (decision #11), so the cell shows blank rather than a phantom carryover.
  const projectedBudget = isInvoiceRow
    ? null
    : engine
      ? engine.projectedNative
      : budgetInfo?.projected || 0;
  const projectedUSD = isInvoiceRow
    ? null
    : engine
      ? engine.projectedBase
      : budgetInfo?.projectedUSD || 0;
  // An invoice's amount is a fact about the document, not about a window, so
  // the invoices folder reads this instead of currentBudget — otherwise a
  // prior-period invoice lists at $0. Only the engine can answer it (the
  // legacy read has no single-month invoice rule); unstamped paths leave it
  // null and the column falls back.
  const recordedAmount = isInvoiceRow ? (engine?.recordedNative ?? null) : null;
  const recordedAmountUSD = isInvoiceRow
    ? (engine?.recordedBase ?? null)
    : null;

  const annualDifference =
    projectedBudget == null
      ? null
      : engine
        ? currentBudget > 0 && projectedBudget > 0
          ? Math.round(
              ((projectedBudget - currentBudget) / currentBudget) * 1000,
            ) / 10
          : 0
        : budgetInfo?.annualDifference || 0;

  const totalContractValue =
    budgetInfo?.effectiveTcv ?? priceHistory?.totalContractValue ?? 0;
  const convertedTotalContractValue =
    budgetInfo?.effectiveTcvUSD ??
    priceHistory?.totalContractValueUSD ??
    totalContractValue;

  // Build supersededProducts array for UI
  const supersededProducts = contract.products
    .filter((p) => isStruckProduct(p, c.type_id))
    .map((p) => `${p.product_id}-${p.year || 1}`);

  // Check if all products are superseded (row should be fully struck out)
  const isFullySuperseded =
    contract.products.length > 0 &&
    contract.products.every((p) => isStruckProduct(p, c.type_id));

  // Get file name from contract docs
  const fileName = c.contract_docs?.[0]?.file_path?.split('/').pop() || '';

  // Check if renewed
  const renewed = c.term_end_date?.length > 1 && c.status === 'active';

  return {
    // Identity
    id: String(contract.id),
    contract_id: String(contract.id),
    vendor: contract.vendor_name,
    vendorId: String(contract.vendor_id),
    vendorDomain: contract.vendor_domain || '',

    // Contract metadata
    type: c.contract_types?.name || '',
    typeId: c.contract_types?.id || 0,
    status: c.status || '',
    status_id: c.status_id || 0,
    contractStatus: c.status_id || 0,
    contract_status: c.status || '',
    invoiceStatus:
      c.invoice_status ||
      (isInvoiceType(c.type_id) ? DEFAULT_INVOICE_STATUS : null),
    invoiceDecisionReason: c.decision_reason || null,
    externalInvoiceStatus: c.external_invoice_status || null,
    externalSource: c.external_source || null,
    renewalType: c.renewal_type || '',
    billingFrequency: c.billing_frequency || '',
    term: c.subscription_term || 0,
    renewalPeriod: c.renewal_period || 0,
    multiYear: c.multi_year,
    renewed,
    currency,
    aiExtractionStatus: c.ai_extraction_status || '',
    fileName,
    orderNumber: sanitizeOrderNumber(c.metadata?.lineage?.order_number),

    // Dates
    termStartDate,
    executionDate: c.execution_date ?? null,
    termEndDate,
    originalStartDate,
    originalEndDate,
    cancelByDate,
    cancelByDateRange: c.cancel_by_date || null,
    cancelByDateInherited: inheritedCancelByDate,

    // Financial values (native currency)
    currentBudget,
    projectedBudget,
    recordedAmount,
    recordedAmountUSD,
    annualCost: currentBudget,
    annualDifference,
    totalContractValue,
    lifetimeContractValue: totalContractValue,
    discount: c.discount || 0,
    annualIncrease: c.annual_increase || 0,

    // Financial values (USD converted)
    convertedCurrentBudget: currentUSD,
    convertedProjectedBudget: projectedUSD,
    convertedAnnualCost: currentUSD,
    convertedTotalContractValue,
    convertedLifetimeContractValue: convertedTotalContractValue,
    originalCurrency: currency,

    // Products
    product: c.vendor_products_details || [],
    currentProducts,
    currentYearProducts,

    // Ownership
    businessSponsor: sponsorNames.length > 0 ? sponsorNames : '',
    businessGroup: businessGroups.map((g) => g.name).join(', '),
    businessGroups,
    uploadedBy: c.uploaded_by,

    // Organization
    tags,
    assetClasses:
      c.contract_asset_classes?.map((ac: any) => ({
        id: ac.asset_class_id,
        name: ac.asset_classes?.name,
      })) || [],
    folderId: c.folder_contracts?.[0]?.folder_id || null,
    folderContracts: c.folder_contracts || [],
    fiscalYearStart: c.users?.organizations?.fiscal_year_start_month,

    // Flags
    isDuplicate: c.is_duplicate || false,
    willNotRenew: c.will_not_renew || false,
    // Reads the row's own displayed end date rather than the raw
    // term_end_date[0], so the badge can never contradict the End Date cell
    // beside it (the historical-FY path shows a generated cycle date).
    willNotRenewNextYear: Boolean(
      c.will_not_renew &&
      termEndDate &&
      isBefore(
        parseISO(termEndDate),
        getFiscalYearInfo(c.users?.organizations?.fiscal_year_start_month ?? 1)
          .nextFiscalYearStart,
      ),
    ),
    isFullySuperseded,
    isLinkedChildInvoice: contract.isLinkedChildInvoice || false,

    // Engine rows carry engine USD here too, so the vendor-group rollups
    // (which prefer effective*) sum the same numbers the rows display; a null
    // projection (invoices) contributes nothing rather than a legacy phantom.
    effectiveCurrentBudgetUSD: engine
      ? currentUSD
      : (budgetInfo?.effectiveCurrentUSD ?? currentUSD),
    effectiveProjectedBudgetUSD:
      projectedUSD == null
        ? undefined
        : engine
          ? projectedUSD
          : (budgetInfo?.effectiveProjectedUSD ?? projectedUSD),
    effectiveTotalContractValueUSD:
      budgetInfo?.effectiveTcvUSD ?? convertedTotalContractValue,

    // Superseded products for UI strikethrough
    supersededProducts,
  };
}

export interface ContractRowDates {
  termStartDate: string | null;
  termEndDate: string | null;
  cancelByDate: string | null;
}

/**
 * The dates a contract's row displays. Point-in-time on the historical-FY
 * path, which stamps the cycle in force for its selected window — term
 * arrays only record some years, and cancel-by exists only as a day offset,
 * so those dates must be generated. Default views leave `cycle` unset and
 * keep the recorded reads.
 */
export function contractRowDates(contract: EnrichedContract): ContractRowDates {
  const c = contract.contract;
  const cycle = contract.engineSpend?.cycle ?? null;
  if (cycle) {
    return {
      termStartDate: cycle.termStart,
      termEndDate: cycle.termEnd,
      cancelByDate: cycle.cancelBy,
    };
  }
  return {
    termStartDate: getDateString(c.term_start_date),
    termEndDate: getDateString(c.term_end_date),
    cancelByDate:
      c.cancel_date?.[0]?.date || contract.inheritedCancelByDate?.date || null,
  };
}

/**
 * Extract date string from date array, returning the most recent date.
 * Defensively sorts by date descending to ensure correct result regardless of input order.
 */
function getDateString(dateArray?: Array<{ date: string }>): string | null {
  if (!dateArray?.length) return null;
  if (dateArray.length === 1) return dateArray[0]?.date ?? null;

  const sorted = [...dateArray].sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? ''),
  );
  return sorted[0]?.date ?? null;
}

/** A `vendor_products_details` row, as the invoice sub-rows read it. */
interface InvoiceLineDetail {
  id?: number | null;
  product_id: number;
  fees?: number | string | null;
  year?: number | null;
  sort_order?: number | null;
  vendor_products?: { name?: string | null } | null;
}

/**
 * One sub-row per invoice line, straight off `vendor_products_details`.
 *
 * Read from the raw rows rather than `contract.products` because enrichment
 * groups those by product id, so two lines billing the same product arrive as
 * a single entry. Nothing here projects: an invoice's fee was billed once, on
 * its own dates (decision #11), which is why `projectedBudget` is null exactly
 * as it is on the parent invoice row.
 */
function buildInvoiceLineSubRows(
  contract: EnrichedContract,
  baseRow: ContractTableRow,
): ProductSubRow[] {
  const details: InvoiceLineDetail[] =
    contract.contract?.vendor_products_details ?? [];
  if (details.length <= 1) return [];

  return [...details]
    .sort((a, b) => {
      const yearA = a.year ?? 1;
      const yearB = b.year ?? 1;
      if (yearA !== yearB) return yearA - yearB;
      const orderA = a.sort_order ?? Infinity;
      const orderB = b.sort_order ?? Infinity;
      if (orderA !== orderB) return orderA - orderB;
      return (a.id ?? 0) - (b.id ?? 0);
    })
    .map((detail) => {
      const fee = Number(detail.fees) || 0;
      return {
        // Keyed on the line's own row id: two lines can share a product, so
        // the product id alone would collide.
        id: `${contract.id}-product-${detail.id ?? detail.product_id}`,
        contract_id: String(contract.id),
        vendor_products: {
          id: detail.product_id,
          name: detail.vendor_products?.name ?? 'Unknown Product',
        },
        fees: fee,
        compoundedFees: fee,
        currentBudget: fee,
        projectedBudget: null,
        currency: baseRow.currency,
        year: detail.year || 1,
        termStartDate: baseRow.termStartDate,
        fiscalYearStart: baseRow.fiscalYearStart,
        isProductRow: true as const,
        isReportRow: false as const,
        isSuperseded: false,
      };
    });
}

/**
 * Build product subRows for a multi-product contract.
 * Returns an empty array if the contract has 1 or fewer products.
 */
export function buildProductSubRows(
  contract: EnrichedContract,
  baseRow: ContractTableRow,
): ProductSubRow[] {
  // An invoice records billing that already happened, one entry per line on the
  // document, and it may bill the same product on more than one line (psk-996).
  // Neither branch below can represent that: `contract.products` holds one
  // entry per product, the engine answers per product per window, and the
  // price-history fallback reads the FIRST fee entry for the current value and
  // the LAST for the projected one — which quietly split a two-line invoice
  // into "current $810,000" and "projected $2,000" instead of showing two lines.
  if (isInvoiceType(contract.contract?.type_id)) {
    return buildInvoiceLineSubRows(contract, baseRow);
  }

  if (contract.products.length <= 1) {
    return [];
  }

  // Per-product engine stamps (budget table under a selected historical FY,
  // QA 2026-08-04): each product answers the same windows as its parent row,
  // so one row per product replaces the per-year recorded schedule.
  // Superseded products have no engine value — the resolver excludes their
  // fees — so they keep the recorded fee, which the table already renders
  // struck through.
  const engineProducts = contract.engineSpend?.products;

  const sorted = [...contract.products].sort((a, b) => {
    const yearA = a.year ?? 1;
    const yearB = b.year ?? 1;
    if (yearA !== yearB) return yearA - yearB;
    const orderA = a.sort_order ?? Infinity;
    const orderB = b.sort_order ?? Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return (a.product_id ?? 0) - (b.product_id ?? 0);
  });

  const buildRow = (
    product: (typeof sorted)[number],
    fee: number,
    projectedFee: number,
  ): ProductSubRow => ({
    id: `${contract.id}-product-${product.product_id}`,
    contract_id: String(contract.id),
    vendor_products: {
      id: product.product_id,
      name: product.name,
    },
    fees: fee,
    compoundedFees: projectedFee,
    currentBudget: fee,
    projectedBudget: projectedFee,
    currency: baseRow.currency,
    year: product.year || 1,
    termStartDate: baseRow.termStartDate,
    fiscalYearStart: baseRow.fiscalYearStart,
    isProductRow: true as const,
    isReportRow: false as const,
    isSuperseded: isStruckProduct(product, contract.contract?.type_id),
  });

  if (engineProducts) {
    const seen = new Set<number>();
    const rows: ProductSubRow[] = [];
    for (const product of sorted) {
      // One row per product: multi-year deals record a products entry per
      // year, but the engine answers per product per window.
      if (seen.has(product.product_id)) continue;
      seen.add(product.product_id);
      const engine = engineProducts[product.product_id];
      if (product.isSuperseded && !engine) {
        const recorded = product.currentFee || 0;
        rows.push(buildRow(product, recorded, recorded));
        continue;
      }
      rows.push(
        buildRow(
          product,
          engine?.currentNative ?? 0,
          engine?.projectedNative ?? 0,
        ),
      );
    }
    return rows;
  }

  const budgetInfo = contract.priceHistory
    ? extractBudgetFromPriceHistory(contract.priceHistory)
    : null;

  const projectedProducts = budgetInfo?.projectedProducts?.length
    ? budgetInfo.projectedProducts
    : budgetInfo?.currentProducts || [];
  const projectedProductsMap = new Map(
    projectedProducts.map((p: any) => [p.product_id, p]),
  );

  return sorted.map((product) => {
    const productFee = product.currentFee || 0;

    // A one-time product books nothing beyond its recorded year (psk-1492),
    // so it is absent from projected periods — the absent-entry fallback
    // below must not revive its fee as a projection.
    const projectedProduct = projectedProductsMap.get(product.product_id);
    const projectedFee = product.one_time_only
      ? 0
      : projectedProduct?.compoundedFees
        ? parseFloat(projectedProduct.compoundedFees.toString())
        : productFee;

    return buildRow(product, productFee, projectedFee);
  });
}

/**
 * Build multiple contract table rows from enriched contracts.
 * Automatically adds product subRows when contracts have multiple products.
 *
 * @param contracts - Array of enriched contracts
 * @param options - Configuration options
 * @param options.groupByVendor - If true, groups by vendor and disables product subRows
 * @param options.includeProductSubRows - Explicit control over product subRows (overrides groupByVendor inference)
 */
export function buildContractTableRows(
  contracts: EnrichedContract[],
  options: {
    groupByVendor?: boolean;
    includeProductSubRows?: boolean;
    /** Nest contracts under their MSA/SO parents. Requires `relationships`. */
    nestByLineage?: boolean;
    relationships?: readonly RelationshipEdge[];
  } = {},
): (ContractTableRow | VendorGroupRow)[] {
  const includeProductSubRows = options.includeProductSubRows ?? true;

  const tableRows = contracts.map((contract) => {
    const baseRow = buildContractTableRow(contract);

    // Skip product subRows if disabled or contract has only one product
    if (!includeProductSubRows || contract.products.length <= 1) {
      return baseRow;
    }

    const subRows = buildProductSubRows(contract, baseRow);

    // Engine-stamped rows keep the engine's FY-windowed values: the subrows
    // show the recorded per-product fee schedule, a different question, and
    // their sum would clobber the stamped numbers (computeContractBudgetValues
    // short-circuits the same way for totals).
    if (contract.engineSpend) {
      return { ...baseRow, subRows };
    }

    let summedCurrentBudget = 0;
    let summedProjectedBudget = 0;
    for (const row of subRows) {
      if (row.isSuperseded) continue;
      summedCurrentBudget += row.currentBudget ?? 0;
      summedProjectedBudget += row.projectedBudget ?? 0;
    }

    return {
      ...baseRow,
      currentBudget: summedCurrentBudget,
      projectedBudget: summedProjectedBudget,
      annualCost: summedCurrentBudget,
      subRows,
    };
  });

  const lineageEdges =
    options.nestByLineage && options.relationships?.length
      ? options.relationships
      : undefined;

  // Group by vendor if requested
  if (options.groupByVendor) {
    return groupContractsByVendor(tableRows, lineageEdges);
  }

  return lineageEdges
    ? nestContractRowsByLineage(tableRows, lineageEdges).roots
    : tableRows;
}

/**
 * Group contracts by vendor for display.
 * Creates vendor group rows with summed financials and subRows.
 */
export function groupContractsByVendor(
  contracts: ContractTableRow[],
  lineageEdges?: readonly RelationshipEdge[],
): (ContractTableRow | VendorGroupRow)[] {
  const groupedData = _.groupBy(contracts, 'vendorId');
  const results: (ContractTableRow | VendorGroupRow)[] = [];

  for (const [vendorId, contractsPerVendor] of Object.entries(groupedData)) {
    if (contractsPerVendor.length === 1) {
      results.push(contractsPerVendor[0]);
    } else {
      const vendor = contractsPerVendor[0].vendor;
      const vendorDomain = contractsPerVendor[0].vendorDomain;

      // Check if all contracts are invoices (invoice-only view)
      const allAreInvoices = contractsPerVendor.every((c) =>
        isInvoiceType(c.typeId),
      );

      // Filter out linked child invoices to avoid double-counting
      // (unless all are invoices, then include all)
      const contractsToSum = allAreInvoices
        ? contractsPerVendor
        : contractsPerVendor.filter((c) => !c.isLinkedChildInvoice);

      // Sum the same fields the contract rows render. sumValuesInUSD filters
      // fully-superseded rows and (by default) linked child invoices, so the
      // sum lines up with what's visible. For invoice-only views we opt in to
      // counting linked children — they're the only thing in the view, so
      // there's no parent row to double-count against.
      const sumOpts = { includeLinkedChildInvoices: allAreInvoices };

      const totalContractValue = sumValuesInUSD(
        contractsToSum,
        (c) =>
          c.effectiveTotalContractValueUSD ??
          c.convertedTotalContractValue ??
          c.totalContractValue ??
          0,
        sumOpts,
      );
      const annualCost = sumValuesInUSD(
        contractsToSum,
        (c) =>
          c.effectiveCurrentBudgetUSD ??
          c.convertedCurrentBudget ??
          c.currentBudget ??
          0,
        sumOpts,
      );
      const projectedBudget = sumValuesInUSD(
        contractsToSum,
        (c) =>
          c.effectiveProjectedBudgetUSD ??
          c.convertedProjectedBudget ??
          c.projectedBudget ??
          0,
        sumOpts,
      );
      // Invoice-only groups (the invoices folder collapses each vendor to one
      // row): the parent must aggregate the same window-independent value its
      // children display, or a vendor whose invoices are all prior-period
      // shows $0 collapsed — the exact symptom recordedAmount exists to fix.
      // Per-row fallback mirrors the column's own currentBudget fallback.
      const recordedAmountUSD = allAreInvoices
        ? sumValuesInUSD(
            contractsToSum,
            (c) =>
              c.recordedAmountUSD ??
              c.effectiveCurrentBudgetUSD ??
              c.convertedCurrentBudget ??
              c.currentBudget ??
              0,
            sumOpts,
          )
        : null;

      // Collect all unique tags
      const allTagsMap = new Map<number, { id: number; name: string }>();
      contractsToSum.forEach((contract) => {
        if (contract.tags && Array.isArray(contract.tags)) {
          contract.tags.forEach((tag: any) => {
            if (tag && tag.id && tag.name) {
              allTagsMap.set(tag.id, tag);
            }
          });
        }
      });
      const vendorTags = Array.from(allTagsMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      // Collect all unique types
      const allTypesSet = new Set<string>();
      contractsToSum.forEach((contract) => {
        if (contract.type) {
          allTypesSet.add(contract.type as string);
        }
      });
      const vendorTypes = Array.from(allTypesSet).sort((a, b) =>
        a.localeCompare(b),
      );

      // Get earliest dates
      const allStartDates = contractsToSum
        .map((contract) => contract.termStartDate)
        .filter(Boolean)
        .sort();
      const allEndDates = contractsToSum
        .map((contract) => contract.termEndDate)
        .filter(Boolean)
        .sort();
      const allCancelDates = contractsToSum
        .map((contract) => contract.cancelByDate)
        .filter(Boolean)
        .sort();

      const vendorGroupRow: VendorGroupRow = {
        // Identity
        id: `vendor-${vendorId}`,
        contract_id: `vendor-${vendorId}`,
        vendor,
        vendorId,
        vendorDomain,

        // Contract metadata (defaults for group)
        type: vendorTypes,
        typeId: 0,
        status: '',
        status_id: 0,
        contractStatus: 0,
        contract_status: '',
        renewalType: '',
        billingFrequency: '',
        term: 0,
        renewalPeriod: 0,
        renewed: false,
        currency: 'USD',
        aiExtractionStatus: '',
        fileName: '',

        // Dates
        termStartDate: allStartDates[0] || null,
        executionDate: null,
        termEndDate: allEndDates[0] || null,
        originalStartDate: '',
        originalEndDate: '',
        cancelByDate: allCancelDates[0] || null,
        cancelByDateRange: null,
        cancelByDateInherited: null,

        // Financial values
        currentBudget: annualCost,
        projectedBudget,
        recordedAmount: recordedAmountUSD,
        recordedAmountUSD,
        annualCost,
        annualDifference: 0,
        totalContractValue,
        lifetimeContractValue: totalContractValue,
        discount: 0,
        annualIncrease: 0,

        // USD converted (already in USD)
        convertedCurrentBudget: annualCost,
        convertedProjectedBudget: projectedBudget,
        convertedAnnualCost: annualCost,
        convertedTotalContractValue: totalContractValue,
        convertedLifetimeContractValue: totalContractValue,
        originalCurrency: 'USD',

        // Products (empty for group)
        product: [],
        currentProducts: [],

        // Ownership
        businessSponsor: '',
        businessGroup: '',

        // Organization
        tags: vendorTags,

        // Flags
        isDuplicate: false,
        isGroup: true,

        // Subrows. Nesting happens here and nowhere earlier, so every sum
        // above still runs over the flat per-vendor list and is unaffected.
        subRows: lineageEdges
          ? nestContractRowsByLineage(contractsPerVendor, lineageEdges).roots
          : contractsPerVendor,
      };

      results.push(vendorGroupRow);
    }
  }

  return results;
}
