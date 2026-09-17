/**
 * Pure transform functions for products.
 * These can be imported in both server and client components.
 */

import {
  generatePriceHistory,
  extractBudgetFromPriceHistory,
  calculateCompoundedProductFee,
} from '@/app/lib/budget';
import {
  buildBaseCurrencyRates,
  type BaseCurrencyRates,
} from '@/lib/v2/core/baseRates';
import { isInvoiceType } from '@/app/lib/constants';

/**
 * Enriched product for contract detail view.
 * Includes price history, period info, and display metadata.
 */
interface VendorProductDetailRow {
  id?: number | null;
  product_id?: number | null;
  name?: string | null;
  fees?: number | string | null;
  year?: number | null;
  one_time_only?: boolean | null;
  sort_order?: number | null;
  vendor_products?: {
    id?: number | null;
    name?: string | null;
    product_code?: string | null;
    data_delivery_types?: { name?: string | null } | null;
  } | null;
}

export interface ContractProduct {
  /**
   * The `vendor_products_details` row behind this display row, when the row was
   * mapped one for one off that table. Set for invoices, whose lines may repeat
   * a product and so cannot be identified by product and year (psk-996);
   * absent on rows the price-history path builds.
   */
  id?: number | null;
  product_id: number;
  vendor_products: {
    name: string;
    id: number;
    product_code?: string | null;
  };
  fees: number;
  originalFees: number;
  renewalCount: number;
  hasIncrease: boolean;
  compoundedFee: number;
  /** Books once in its recorded year; excluded from renewal terms (psk-1492). */
  one_time_only?: boolean;
  year: number;
  periodInfo: {
    yearWithinTerm: number;
    termIndex: number;
    periodStart: string;
    periodEnd: string;
  } | null;
  startDate: string | null;
  endDate: string | null;
  currency: string | null;
  numberOfUsers: number | null;
  dataDeliveryMethod: string | null;
  enterprise?: boolean;
}

export interface ContractProductsResult {
  productsByYear: Record<string, ContractProduct[]>;
  hasValidTermDate: boolean;
  sortedYears: string[];
  termStartDate: Array<{ date: string | null; updated_at: string }>;
  fiscalYearStartMonth: number;
  currency: string | null;
  hasAnnualIncrease: boolean;
  hasFeeOverrides: boolean;
}

interface VendorProductsDetails {
  id: number;
  product_id: number;
  fees: number;
  one_time_only?: boolean;
  sort_order?: number | null;
  vendor_products?: {
    id: number;
    name: string;
    product_code?: string | null;
    data_delivery_types?: { id: number; name: string } | null;
  };
  vendor_products_details_versions?: Array<{
    changed_data?: Record<string, unknown> | null;
  }>;
}

interface ContractData {
  currency?: string | null;
  annual_increase?: number | null;
  renewal_type?: string | null;
  term_start_date?: Array<{ date: string | null; updated_at: string }>;
  vendor_products_details?: VendorProductsDetails[];
  vendor_products_users?: Array<{
    product_id: number;
    number_of_users: number | null;
  }>;
}

/**
 * Input type for hasFeeOverrides - minimal contract shape needed
 */
export interface HasFeeOverridesInput {
  vendor_products_details?: Array<{
    vendor_products_details_versions?: Array<{
      changed_data?: Record<string, unknown> | null;
    }>;
  }>;
}

/**
 * Check if any product fees have been manually edited.
 *
 * Two row shapes reach this. The contract-set fetches select no `changed_data`
 * at all and instead filter the embed to fee edits in the query, so a row's
 * mere presence is the answer. Rows that do carry `changed_data` (fixtures,
 * and any caller that loads the column unfiltered) still have to be inspected.
 */
export function hasFeeOverrides(contract: HasFeeOverridesInput): boolean {
  return (
    contract.vendor_products_details?.some((vpd) =>
      vpd.vendor_products_details_versions?.some((version) =>
        'changed_data' in version
          ? version.changed_data?.fees !== undefined
          : true,
      ),
    ) ?? false
  );
}

/**
 * Enrich contract with products data including price history.
 * If fees have been manually edited, skips price history and uses raw fees.
 *
 * @param contract - Raw contract data from fetchContractsById
 * @param fiscalYearStartMonth - Organization's fiscal year start month (1-12)
 */
export function enrichContractProducts(
  contract: ContractData,
  fiscalYearStartMonth: number,
): ContractProductsResult {
  const feeOverrides = hasFeeOverrides(contract);

  const termProducts = getCurrentTermProducts(contract, fiscalYearStartMonth, {
    hasFeeOverrides: feeOverrides,
  });

  return {
    ...termProducts,
    currency: contract?.currency || null,
    hasAnnualIncrease:
      !feeOverrides &&
      !!contract?.annual_increase &&
      contract?.renewal_type !== 'One-Time',
    hasFeeOverrides: feeOverrides,
  };
}

/**
 * Resolve a contract's effective start date from its term_start_date history.
 * Entries are versioned; the most recently updated one wins. Values may be full
 * ISO timestamps, so this normalizes to a 'yyyy-MM-dd' date string. Returns null
 * when there is no entry or the latest entry has no date.
 */
export function getContractStartDate(contract: {
  term_start_date?: Array<{
    date: string | null;
    updated_at?: string | null;
  }> | null;
}): string | null {
  const entries = contract?.term_start_date;
  if (!entries?.length) return null;
  // Rows fetched without `updated_at` keep their query order, where index 0 is
  // already the current term.
  const latest = [...entries].sort(
    (a, b) =>
      new Date(b.updated_at ?? 0).getTime() -
      new Date(a.updated_at ?? 0).getTime(),
  )[0];
  const date = latest?.date;
  if (!date) return null;
  return date.slice(0, 10);
}

/**
 * Extract current term products and fees for a contract, handling multi-year terms.
 * Groups products by year within the current term using price history data.
 */
export function getCurrentTermProducts(
  contractData: any,
  fiscalYearStartMonth: number = 1,
  options?: { hasFeeOverrides?: boolean },
): {
  productsByYear: Record<string, any[]>;
  hasValidTermDate: boolean;
  sortedYears: string[];
  termStartDate: any[];
  fiscalYearStartMonth: number;
} {
  const hasProducts = contractData?.vendor_products_details?.length > 0;
  const currency = contractData?.currency;

  // Build lookup map for number of users and enterprise flag by product_id
  const usersByProductId = new Map<
    number,
    { numberOfUsers: number | null; enterprise: boolean }
  >();
  if (contractData?.vendor_products_users?.length > 0) {
    contractData.vendor_products_users.forEach((pu: any) => {
      if (pu.product_id) {
        usersByProductId.set(pu.product_id, {
          numberOfUsers: pu.number_of_users ?? null,
          enterprise: pu.enterprise ?? false,
        });
      }
    });
  }

  // Always generate price history for structure; hasFeeOverrides controls fee compounding
  const priceHistory = generatePriceHistory(
    contractData,
    fiscalYearStartMonth,
    'minimal',
    { hasFeeOverrides: options?.hasFeeOverrides },
  );
  const currentProducts =
    extractBudgetFromPriceHistory(priceHistory).currentProducts;

  // Check if the most recent (latest updated) term_start_date has a valid date
  const hasValidTermDate = getContractStartDate(contractData) !== null;

  /** One display row straight off a vendor_products_details row. */
  const rowFromDetail = (
    product: VendorProductDetailRow,
    year: number,
  ): ContractProduct & { sort_order: number | null } => {
    // Falls back to 0 the way the rest of this file treats a missing id: the
    // row still renders, it simply has no product to link to.
    const productId =
      product.product_id ?? product.vendor_products?.id ?? product.id ?? 0;
    return {
      // The vendor_products_details row this came from. One invoice may bill
      // the same product on several lines, and product-and-year cannot tell
      // those lines apart, so edits need the row's own id (psk-996).
      id: typeof product.id === 'number' ? product.id : null,
      product_id: productId,
      vendor_products: {
        name:
          product.name || product.vendor_products?.name || 'Unknown Product',
        id: productId,
        product_code: product.vendor_products?.product_code ?? null,
      },
      fees: Number(product.fees) || 0,
      originalFees: Number(product.fees) || 0,
      renewalCount: 0,
      hasIncrease: false,
      compoundedFee: Number(product.fees) || 0,
      one_time_only: product.one_time_only ?? false,
      year,
      periodInfo: null,
      startDate: null,
      endDate: null,
      currency,
      numberOfUsers: usersByProductId.get(productId)?.numberOfUsers ?? null,
      dataDeliveryMethod:
        product.vendor_products?.data_delivery_types?.name ?? null,
      enterprise: usersByProductId.get(productId)?.enterprise ?? false,
      sort_order: product.sort_order ?? null,
    };
  };

  // Group products by year within term
  let productsByYear: Record<string, any[]> = {};

  if (hasProducts) {
    if (isInvoiceType(contractData?.type_id)) {
      // An invoice records billing that already happened, one entry per line on
      // the document, and it may bill the same product on more than one line
      // (psk-996). The price-history path below is built for renewals and
      // compounding: it keys on (product, term index), so a repeated product
      // collapses to a single row and the second line disappears from Products
      // Licensed. Map the rows one for one instead.
      productsByYear = (
        contractData.vendor_products_details as VendorProductDetailRow[]
      ).reduce((acc: Record<string, ContractProduct[]>, product) => {
        const year = Number(product.year) || 1;
        const yearKey = String(year);
        if (!acc[yearKey]) acc[yearKey] = [];
        acc[yearKey].push(rowFromDetail(product, year));
        return acc;
      }, {});
    }
    // First try to use price history products if we have valid term dates and the products have periodInfo
    else if (currentProducts.length > 0 && hasValidTermDate) {
      productsByYear = currentProducts.reduce<Record<string, any[]>>(
        (acc, product) => {
          if (!product.periodInfo) return acc;

          const yearKey = product.periodInfo.yearWithinTerm.toString();

          if (!acc[yearKey]) {
            acc[yearKey] = [];
          }

          // Check if this product is already in the array for this year
          const exists = acc[yearKey].some(
            (p) =>
              p.product_id === product.product_id &&
              p.periodInfo?.termIndex === product.periodInfo?.termIndex,
          );

          if (!exists) {
            const vendorProductsDefault = {
              name: 'Unknown Product',
              id: product.product_id,
            };

            const vendorProducts = product.vendor_products
              ? {
                  name: product.vendor_products.name || 'Unknown Product',
                  id: product.vendor_products.id || product.product_id,
                  product_code: product.vendor_products.product_code ?? null,
                }
              : vendorProductsDefault;

            acc[yearKey].push({
              product_id: product.product_id,
              vendor_products: vendorProducts,
              fees: Number(product.fees) || 0,
              originalFees: Number(product.originalFees || product.fees) || 0,
              renewalCount:
                product.periodInfo.termIndex > 0
                  ? product.periodInfo.termIndex
                  : 0,
              hasIncrease:
                Number(product.fees) >
                Number(product.originalFees || product.fees),
              compoundedFee:
                Number(product.compoundedFees || product.fees) || 0,
              one_time_only: product.one_time_only ?? false,
              year: parseInt(yearKey, 10),
              periodInfo: product.periodInfo,
              startDate: product.startDate,
              endDate: product.endDate,
              currency,
              numberOfUsers:
                usersByProductId.get(product.product_id)?.numberOfUsers ?? null,
              dataDeliveryMethod:
                (product.vendor_products as any)?.data_delivery_types?.name ??
                null,
              enterprise:
                usersByProductId.get(product.product_id)?.enterprise ?? false,
              sort_order: product.sort_order ?? null,
            });
          }

          return acc;
        },
        {},
      );
    }

    // Always fallback to vendor_products_details if we don't have any products to show
    if (Object.keys(productsByYear).length === 0) {
      productsByYear['1'] = (
        contractData.vendor_products_details as VendorProductDetailRow[]
      ).map((product) => rowFromDetail(product, 1));
    }
  }

  // Sort the years in ascending order
  const sortedYears = Object.keys(productsByYear).sort(
    (a, b) => Number(a) - Number(b),
  );

  for (const year of sortedYears) {
    productsByYear[year].sort((a: any, b: any) => {
      const orderA = a.sort_order ?? Infinity;
      const orderB = b.sort_order ?? Infinity;
      if (orderA !== orderB) return orderA - orderB;

      const idA = a.vendor_products?.id ?? a.product_id ?? 0;
      const idB = b.vendor_products?.id ?? b.product_id ?? 0;
      return idA - idB;
    });
  }

  return {
    productsByYear,
    hasValidTermDate,
    sortedYears,
    termStartDate: contractData.term_start_date || [],
    fiscalYearStartMonth,
  };
}

/**
 * Convert every product on a contract into the org's base display currency,
 * at the rate of the day the contract STARTED.
 *
 * The historical rate is the point: a 2019 EUR contract is worth what it was
 * worth when it was signed, not what today's rate says. `fees` stays the
 * recorded native amount; `convertedFees` is the stamp downstream reads, and
 * fxRate/fxDate disclose which rate produced it (null when none was needed, or
 * when the provider had no quote — never a fabricated 1.0).
 *
 * COHERENCE: `convertedFees` is only safe to denominate in the ORG BASE (as
 * opposed to USD) because every spend-engine consumer now states its own
 * currency policy and reads native fees under 'base' — nothing left in the
 * engine path assumes this stamp is USD.
 */
export async function convertAllProductsToUSD(
  contract: any,
  targetCurrency: string = 'USD',
  prefetchedRates?: BaseCurrencyRates,
) {
  if (!contract.vendor_products_details) return [];

  const currency = contract.currency?.toUpperCase() || 'USD';
  const target = targetCurrency?.toUpperCase() || 'USD';
  const startDate = getContractStartDate(contract);
  // Without a set-wide prefetch, one fetch per contract — and none at all when
  // the contract is already in the target, since rate requests count against
  // the provider quota.
  const rates =
    prefetchedRates ??
    (await buildBaseCurrencyRates([{ currency, startDate }], target));

  const quote = rates.quote(currency, startDate);
  const multiplier = quote ?? 1;
  const convert = (value: number) => (value ? value * multiplier : 0);

  const fxRate = currency === target ? null : quote;
  const fxDate = fxRate == null ? null : startDate;

  return contract.vendor_products_details.map((product: any) => {
    const feesInTarget = convert(product.fees);

    let compoundedFees = feesInTarget;
    if (contract.annual_increase && contract.renewal_type !== 'One-Time') {
      const { compoundedFee } = calculateCompoundedProductFee(
        product,
        contract,
      );
      compoundedFees = convert(compoundedFee);
    }

    return {
      ...product,
      fees: product.fees,
      convertedFees: feesInTarget,
      compoundedFees,
      fxRate,
      fxDate,
      fxTargetCurrency: target,
    };
  });
}
