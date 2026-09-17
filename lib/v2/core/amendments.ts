/**
 * Generic Amendment Tracking System
 *
 * Provides types and enrichment functions for tracking which fields
 * have been amended from their original values. Works with any data
 * structure that has amendable fields.
 */

import {
  buildContractHierarchyMap,
  findTopmostParentWithProduct,
  findDeepestChildWithProduct,
  HierarchyMap,
  ContractRelationship,
} from '@/lib/inventory/hierarchyUtils';
import {
  generatePriceHistory,
  extractBudgetFromPriceHistory,
  Contract,
} from '@/app/lib/budget';
import { PriceHistory, PricePeriod } from '@/app/lib/budget/types';
import { ProductData } from '@/app/lib/budget/priceHistoryUtils';
import { VendorProductDetail } from './types';
import { buildBaseCurrencyRates } from './baseRates';
import { getContractStartDate } from '@/lib/v2/products/transforms';
import { isInvoiceType } from '@/app/lib/constants';
import { contractOwners, ownerSponsorNames } from '@/lib/v2/owners/embed';
import type { RawContractOwnerRow } from '@/lib/v2/owners/types';

/**
 * Extended contract type with joined relations used in amendments processing
 */
interface AmendmentContract extends Contract {
  contract_types?: { name: string };
  contract_owners?: RawContractOwnerRow[] | null;
  vendor_products_users?: Array<{
    product_id: number;
    number_of_users?: number;
  }>;
  contract_data_delivery_types?: Array<{
    data_delivery_types?: { name: string };
  }>;
}

/**
 * Generic wrapper for a field that may have been amended.
 * Only populated when the field differs from the original contract.
 */
export interface AmendedField<T> {
  /** The original value from the parent/original contract */
  original: T;
  /** Info about which contract amended this field */
  amendedBy: {
    contractId: number;
    contractType?: string;
  };
}

/**
 * Helper type to create an amendments object for any set of fields.
 * Usage: FieldAmendments<{ startDate: string; licensesCount: number }>
 */
export type FieldAmendments<T> = {
  [K in keyof T]?: AmendedField<T[K]>;
};

/**
 * Tracks an effective field value with its source.
 * Value is the current effective value (may come from an amendment).
 * sourceContractId is only set when value differs from original.
 */
export interface EffectiveFieldValue<T = unknown> {
  value: T;
  sourceContractId?: number;
  sourceContractType?: string;
}

/**
 * Dynamic map of effective values for any contract fields.
 * Keys are field names, values track the effective value and its source.
 * Different fields may come from different amendments in the lineage.
 */
export type EffectiveValues = Record<string, EffectiveFieldValue>;

const SKIP_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'organization_id',
  'status_id',
  'type_id',
  'vendor_id',
  'vendors',
  'contract_types',
  'vendor_products_details',
  'contract_users',
  'vendor_products_users',
  'contract_data_delivery_types',
  'contract_business_groups',
  'contract_acl_group',
  'folder_contracts',
  // Sponsors come from the owner rows (psk-1975): the column is frozen and the
  // embed is not a scalar field, so neither is walked; see sponsorNamesOf.
  'business_sponsor',
  'contract_owners',
]);

/**
 * The effective `business_sponsor` value and its amendment diff are keyed by
 * the old column name, which inventory and the amended-by badge read, but the
 * names come from the contract's owner sponsor rows.
 */
function sponsorNamesOf(contract: AmendmentContract): string[] {
  return ownerSponsorNames(contractOwners(contract));
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function normalizeValue(value: unknown): unknown {
  // Date fields stored as arrays: [{ date: '2024-01-01', updated_at: '...' }]
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    'date' in value[0]
  ) {
    return value[0]?.date || null;
  }
  return value;
}

export interface ProductWithAmendments {
  product_id: number;
  name: string;
  fees: number;
  year: number;
  sourceContractId: number;
  isSuperseded: boolean;
  supersededByContractId?: number;
  isSuperseding: boolean;
  supersedesProductInContractId?: number;
  currentFee: number;
  currency: string;
  currentFeeUSD: number;
  currentProducts?: ProductData[];
  effectiveFeeUSD: number;
  /**
   * The effective fee before conversion, in `effectiveFeeCurrency` — the
   * currency of whichever contract sources the fee (this one, or the
   * superseding amendment's). Single-product rows display these (PSK-1796).
   */
  effectiveFee: number;
  effectiveFeeCurrency: string;
  feeSourceContractId?: number;
  /**
   * Pre-computed effective values for product-level fields.
   */
  effectiveValues: EffectiveValues;
  amendments?: FieldAmendments<{
    fees: number;
    licensesCount: number;
    deliveryMethods: string[];
  }>;
}

export interface ContractWithAmendments {
  id: number;
  vendor_id: number | null;
  vendor_name: string;
  vendor_domain?: string;
  contract: AmendmentContract;
  products: ProductWithAmendments[];
  priceHistory: PriceHistory;
  isLinkedChildInvoice: boolean;
  excludedFromOverallSpend?: boolean;
  isFullySuperseded?: boolean;
  /**
   * Pre-computed effective values for all amendable fields.
   * Each field tracks its effective value and which contract it came from.
   * Different fields may come from different amendments.
   */
  effectiveValues: EffectiveValues;
  /**
   * @deprecated Use effectiveValues instead. Kept for backwards compatibility.
   */
  effectiveContract?: AmendmentContract;
  amendments?: FieldAmendments<{
    term_start_date: string;
    term_end_date: string;
    annual_increase: number | null;
    end_users: string;
    permitted_entities: string;
    business_sponsor: string | string[];
  }>;
}

export interface AmendmentEnrichmentOptions {
  skipExchangeRates?: boolean;
  /**
   * Org base display currency to convert fees into; defaults to USD. Each fee
   * converts at the rate of the day ITS OWN contract started, so a superseding
   * amendment uses the amendment's rate rather than the parent's.
   */
  baseCurrency?: string;
}

function getProductId(vp: VendorProductDetail): number | undefined {
  return vp.vendor_products?.id ?? vp.product_id;
}

function compareContractFields(
  original: AmendmentContract,
  amendment: AmendmentContract,
): FieldAmendments<Record<string, unknown>> | undefined {
  const amendments: FieldAmendments<Record<string, unknown>> = {};
  const amendedBy = {
    contractId: amendment.id,
    contractType: amendment.contract_types?.name,
  };

  const originalRecord = original as unknown as Record<string, unknown>;
  const amendmentRecord = amendment as unknown as Record<string, unknown>;

  const allKeys = new Set([
    ...Object.keys(originalRecord || {}),
    ...Object.keys(amendmentRecord || {}),
  ]);

  for (const fieldKey of allKeys) {
    if (SKIP_FIELDS.has(fieldKey)) continue;

    const originalValue = normalizeValue(originalRecord?.[fieldKey]);
    const amendedValue = normalizeValue(amendmentRecord?.[fieldKey]);

    if (
      !isEmpty(amendedValue) &&
      JSON.stringify(originalValue) !== JSON.stringify(amendedValue)
    ) {
      amendments[fieldKey] = { original: originalValue, amendedBy };
    }
  }

  const originalSponsors = sponsorNamesOf(original);
  const amendedSponsors = sponsorNamesOf(amendment);
  if (
    amendedSponsors.length > 0 &&
    !sameValue(originalSponsors, amendedSponsors)
  ) {
    amendments.business_sponsor = { original: originalSponsors, amendedBy };
  }

  return Object.keys(amendments).length > 0 ? amendments : undefined;
}

function findDeepestChild(
  contractId: number,
  hierarchyMap: HierarchyMap,
  contractsMap: Map<number, AmendmentContract>,
  visited: Set<number> = new Set(),
): { contract: AmendmentContract; depth: number } | null {
  if (visited.has(contractId)) {
    return null; // Cycle detected
  }
  visited.add(contractId);

  const contract = contractsMap.get(contractId);
  if (!contract) return null;

  // Skip invoices - they don't supersede
  if (isInvoiceType(contract.type_id)) {
    return null;
  }

  const children = hierarchyMap.children.get(contractId) || [];

  if (children.length === 0) {
    return { contract, depth: 0 };
  }

  let deepest: { contract: AmendmentContract; depth: number } | null = null;

  for (const childId of children) {
    const childResult = findDeepestChild(
      childId,
      hierarchyMap,
      contractsMap,
      visited,
    );

    if (childResult) {
      const newDepth = childResult.depth + 1;
      if (!deepest || newDepth > deepest.depth) {
        deepest = { contract: childResult.contract, depth: newDepth };
      }
    }
  }

  return deepest || { contract, depth: 0 };
}

function getLicensesCount(
  contract: AmendmentContract,
  productId: number,
): number {
  const allSeats = contract.vendor_products_users || [];
  const productSeats = allSeats.filter((vpu) => vpu.product_id === productId);
  return productSeats.reduce(
    (sum, seat) => sum + (seat.number_of_users || 0),
    0,
  );
}

function getDeliveryMethods(
  contract: AmendmentContract,
  productId: number,
): string[] {
  const productDetail = contract.vendor_products_details?.find(
    (vpd) => getProductId(vpd as VendorProductDetail) === productId,
  ) as VendorProductDetail | undefined;

  if (productDetail?.vendor_products?.data_delivery_types?.name) {
    return [productDetail.vendor_products.data_delivery_types.name];
  }

  return (
    contract.contract_data_delivery_types
      ?.map((dt) => dt.data_delivery_types?.name)
      .filter((name): name is string => Boolean(name)) || []
  );
}

/**
 * Collect all amendments in the lineage, ordered from oldest to newest.
 * Excludes invoices as they don't amend contract terms.
 *
 * Ordering relies on tree structure (parent before children) rather than dates,
 * since contract dates can shift with renewals. Siblings are sorted by
 * original term_start_date to ensure consistent ordering at each level.
 */
function collectAmendmentsInOrder(
  contractId: number,
  hierarchyMap: HierarchyMap,
  contractsMap: Map<number, AmendmentContract>,
  visited: Set<number> = new Set(),
): AmendmentContract[] {
  if (visited.has(contractId)) return [];
  visited.add(contractId);

  const contract = contractsMap.get(contractId);
  if (!contract) return [];

  // Skip invoices - they don't amend contract terms
  if (isInvoiceType(contract.type_id)) return [];

  const childIds = hierarchyMap.children.get(contractId) || [];
  const amendments: AmendmentContract[] = [];

  // Sort siblings by original term_start_date to ensure consistent ordering
  const sortedChildIds = [...childIds].sort((a, b) => {
    const contractA = contractsMap.get(a);
    const contractB = contractsMap.get(b);
    return (
      getOriginalTermStartDate(contractA) - getOriginalTermStartDate(contractB)
    );
  });

  for (const childId of sortedChildIds) {
    const childAmendments = collectAmendmentsInOrder(
      childId,
      hierarchyMap,
      contractsMap,
      visited,
    );
    amendments.push(...childAmendments);
  }

  // Add this contract at the beginning (parent before children in subtree)
  amendments.unshift(contract);

  return amendments;
}

/**
 * Get the original term start date for sorting siblings.
 * Uses the last element of term_start_date array (oldest/original date).
 *
 * When term_start_date is missing or empty, returns 0 which sorts those
 * contracts to the beginning of sibling lists (treated as oldest). This is
 * intentional: amendments with known dates will be processed after and can
 * overwrite values from contracts with unknown dates, which is the safer
 * default for computing effective values.
 */
function getOriginalTermStartDate(
  contract: AmendmentContract | undefined,
): number {
  const termStartDates = contract?.term_start_date;
  if (termStartDates && termStartDates.length > 0) {
    const originalDate = termStartDates[termStartDates.length - 1]?.date;
    if (originalDate) {
      return new Date(originalDate).getTime();
    }
  }
  return 0;
}

/**
 * Compute effective values by walking the amendment lineage.
 * For each field, uses the most recent non-empty value from any amendment.
 * Tracks which contract each field's value came from.
 *
 * Expects amendments to be pre-sorted oldest-to-newest by collectAmendmentsInOrder,
 * which uses tree structure (not dates) to determine ordering.
 */
function computeEffectiveValues(
  sourceContract: AmendmentContract,
  amendments: AmendmentContract[],
): EffectiveValues {
  const effectiveValues: EffectiveValues = {};
  const sourceRecord = sourceContract as unknown as Record<string, unknown>;

  // Initialize with source contract values
  for (const [key, value] of Object.entries(sourceRecord)) {
    if (SKIP_FIELDS.has(key)) continue;
    const normalizedValue = normalizeValue(value);
    effectiveValues[key] = { value: normalizedValue };
  }
  effectiveValues.business_sponsor = { value: sponsorNamesOf(sourceContract) };

  // Overlay amendments in order (oldest to newest, as provided by collectAmendmentsInOrder)
  for (const amendment of amendments) {
    if (amendment.id === sourceContract.id) continue;

    const amendmentRecord = amendment as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(amendmentRecord)) {
      if (SKIP_FIELDS.has(key)) continue;

      const normalizedValue = normalizeValue(value);
      if (!isEmpty(normalizedValue)) {
        const originalValue = effectiveValues[key]?.value;
        // Only update if value is different from current effective value
        if (JSON.stringify(originalValue) !== JSON.stringify(normalizedValue)) {
          effectiveValues[key] = {
            value: normalizedValue,
            sourceContractId: amendment.id,
            sourceContractType: amendment.contract_types?.name,
          };
        }
      }
    }

    const sponsors = sponsorNamesOf(amendment);
    if (
      sponsors.length > 0 &&
      !sameValue(effectiveValues.business_sponsor.value, sponsors)
    ) {
      effectiveValues.business_sponsor = {
        value: sponsors,
        sourceContractId: amendment.id,
        sourceContractType: amendment.contract_types?.name,
      };
    }
  }

  return effectiveValues;
}

/**
 * Compute effective values for a specific product.
 * Handles product-level fields like fees, licenses, and delivery methods.
 */
function computeProductEffectiveValues(
  sourceContract: AmendmentContract,
  amendments: AmendmentContract[],
  productId: number,
  effectiveFeeUSD: number,
  feeSourceContractId: number | undefined,
  feeSourceContractType: string | undefined,
): EffectiveValues {
  const effectiveValues: EffectiveValues = {};

  // Initialize with source contract values
  const sourceLicenses = getLicensesCount(sourceContract, productId);
  const sourceDelivery = getDeliveryMethods(sourceContract, productId);

  effectiveValues.licensesCount = { value: sourceLicenses };
  effectiveValues.deliveryMethods = { value: sourceDelivery };
  effectiveValues.fees = { value: effectiveFeeUSD };

  if (feeSourceContractId) {
    effectiveValues.fees.sourceContractId = feeSourceContractId;
    effectiveValues.fees.sourceContractType = feeSourceContractType;
  }

  // Overlay amendments for licenses and delivery
  for (const amendment of amendments) {
    if (amendment.id === sourceContract.id) continue;

    // Check if amendment has license data for this product
    const amendmentHasLicenseData = (
      amendment.vendor_products_users || []
    ).some((vpu) => vpu.product_id === productId);

    if (amendmentHasLicenseData) {
      const amendedLicenses = getLicensesCount(amendment, productId);
      if (amendedLicenses !== effectiveValues.licensesCount.value) {
        effectiveValues.licensesCount = {
          value: amendedLicenses,
          sourceContractId: amendment.id,
          sourceContractType: amendment.contract_types?.name,
        };
      }
    }

    const amendedDelivery = getDeliveryMethods(amendment, productId);
    if (
      amendedDelivery.length > 0 &&
      JSON.stringify(amendedDelivery) !==
        JSON.stringify(effectiveValues.deliveryMethods.value)
    ) {
      effectiveValues.deliveryMethods = {
        value: amendedDelivery,
        sourceContractId: amendment.id,
        sourceContractType: amendment.contract_types?.name,
      };
    }
  }

  return effectiveValues;
}

/**
 * Single comprehensive enrichment step.
 * Replaces: enrichWithLineage, enrichWithPricing, enrichWithEffectiveFees
 *
 * For each contract:
 * 1. Builds hierarchy map
 * 2. Finds deepest child (amendment) in lineage
 * 3. Compares ALL contract-level fields
 * 4. Compares ALL product-level fields (fees, licenses, delivery)
 * 5. Attaches amendments metadata + effective values
 */
export async function enrichWithAmendments(
  contracts: AmendmentContract[],
  relationships: ContractRelationship[],
  fiscalYearStartMonth: number,
  options?: AmendmentEnrichmentOptions,
): Promise<ContractWithAmendments[]> {
  const hierarchyMap = buildContractHierarchyMap(contracts, relationships);
  const contractsMap = new Map<number, AmendmentContract>(
    contracts.map((c) => [c.id, c]),
  );

  // One prefetch for the whole set; no fetch at all when every contract is
  // already in the base currency.
  const rates = options?.skipExchangeRates
    ? null
    : await buildBaseCurrencyRates(
        contracts.map((c) => ({
          currency: c.currency,
          startDate: getContractStartDate(c),
        })),
        options?.baseCurrency || 'USD',
      );
  const convert = (
    value: number,
    from: string,
    source: AmendmentContract | undefined,
  ) =>
    rates
      ? // No source contract means no start date to price at, which the
        // provider reads as "use the latest rate" — say that explicitly
        // rather than asking for the start date of an empty object.
        value *
        rates.multiplier(from, source ? getContractStartDate(source) : null)
      : value;

  const enrichedContracts: ContractWithAmendments[] = [];

  for (const contract of contracts) {
    // Collect all amendments in the lineage (ordered oldest to newest)
    const amendmentsInOrder = collectAmendmentsInOrder(
      contract.id,
      hierarchyMap,
      contractsMap,
    );

    // Compute effective values by walking the lineage
    const effectiveValues = computeEffectiveValues(contract, amendmentsInOrder);

    // Keep legacy support for deepest child
    const deepestChildResult = findDeepestChild(
      contract.id,
      hierarchyMap,
      contractsMap,
    );
    const deepestChild = deepestChildResult?.contract;
    const hasContractAmendment =
      deepestChild && deepestChild.id !== contract.id;

    const contractAmendments = hasContractAmendment
      ? compareContractFields(contract, deepestChild)
      : undefined;

    const effectiveContract = hasContractAmendment ? deepestChild : contract;
    const currency = contract.currency?.toUpperCase() || 'USD';

    const priceHistory = generatePriceHistory(
      contract,
      fiscalYearStartMonth,
      'minimal',
    );

    const productDetailsMap = new Map<number, VendorProductDetail[]>();
    contract.vendor_products_details?.forEach((vpd) => {
      const productId = getProductId(vpd as VendorProductDetail);
      if (!productId) return;

      if (!productDetailsMap.has(productId)) {
        productDetailsMap.set(productId, []);
      }
      productDetailsMap.get(productId)!.push(vpd as VendorProductDetail);
    });

    const enrichedProducts: ProductWithAmendments[] = [];
    const supersedingPriceHistoryCache = new Map<number, PriceHistory>();

    for (const [productId, details] of productDetailsMap) {
      const topmostWithProduct = findTopmostParentWithProduct(
        contract.id,
        productId,
        hierarchyMap,
        contractsMap,
      );
      const sourceContractId = topmostWithProduct?.id || contract.id;

      const deepestProductChild = findDeepestChildWithProduct(
        contract.id,
        productId,
        hierarchyMap,
        contractsMap,
      );
      const deepestChildIsInvoice = isInvoiceType(
        deepestProductChild?.contract.type_id,
      );
      const isSuperseded =
        deepestProductChild !== null &&
        deepestProductChild.contract.id !== contract.id &&
        !deepestChildIsInvoice;
      const supersededByContractId = isSuperseded
        ? deepestProductChild!.contract.id
        : undefined;

      const isSuperseding = sourceContractId !== contract.id;
      const supersedesProductInContractId = isSuperseding
        ? sourceContractId
        : undefined;

      const productName =
        details[0]?.vendor_products?.name || 'Unknown Product';
      // An invoice may bill the same product on several lines in one year
      // and this map keys on product_id alone, so taking details[0]
      // would silently drop every line after the first. Sum within the year
      // details[0] reports instead — the multi-year case still reads the first
      // year's row, exactly as before.
      const firstYear = details[0]?.year || 1;
      const baseFees = isInvoiceType(contract.type_id)
        ? details
            .filter((detail) => (detail.year || 1) === firstYear)
            .reduce((sum, detail) => sum + (detail.fees || 0), 0)
        : details[0]?.fees || 0;

      const { currentProducts } = extractBudgetFromPriceHistory(priceHistory);
      const activePeriod = priceHistory.periods?.find(
        (p: PricePeriod) => p.isActivePeriod,
      );
      // Use nullish coalescing to preserve legitimate zero fees
      const productFee = activePeriod?.productFees?.find(
        (pf) => pf.productId === productId,
      );
      const currentFee = productFee?.fees ?? baseFees;

      const currentFeeUSD = convert(currentFee, currency, contract);

      let effectiveFeeUSD = currentFeeUSD;
      // The same fee before conversion, in the currency of whichever contract
      // sources it — this contract's, or the superseding amendment's. A single
      // product's cost displays unconverted (PSK-1796), and the display
      // currency follows the fee source, not the row's contract.
      let effectiveFee = currentFee;
      let effectiveFeeCurrency = currency;
      let feeSourceContractId: number | undefined;

      if (isSuperseded && supersededByContractId) {
        const supersedingContract = contractsMap.get(supersededByContractId);
        if (supersedingContract) {
          let supersedingPriceHistory = supersedingPriceHistoryCache.get(
            supersededByContractId,
          );
          if (!supersedingPriceHistory) {
            supersedingPriceHistory = generatePriceHistory(
              supersedingContract,
              fiscalYearStartMonth,
              'minimal',
            );
            supersedingPriceHistoryCache.set(
              supersededByContractId,
              supersedingPriceHistory,
            );
          }
          const supersedingActivePeriod = supersedingPriceHistory.periods?.find(
            (p: PricePeriod) => p.isActivePeriod,
          );
          const supersedingCurrency =
            supersedingContract.currency?.toUpperCase() || 'USD';

          // Use nullish coalescing to preserve legitimate zero fees
          const supersedingProductFee =
            supersedingActivePeriod?.productFees?.find(
              (pf) => pf.productId === productId,
            );
          const supersedingDetail =
            supersedingContract.vendor_products_details?.find(
              (vpd) => getProductId(vpd as VendorProductDetail) === productId,
            ) as VendorProductDetail | undefined;
          const supersedingFee =
            supersedingProductFee?.fees ?? supersedingDetail?.fees ?? 0;

          effectiveFeeUSD = convert(
            supersedingFee,
            supersedingCurrency,
            supersedingContract,
          );
          effectiveFee = supersedingFee;
          effectiveFeeCurrency = supersedingCurrency;
          feeSourceContractId = supersededByContractId;
        }
      }

      let productAmendments:
        | FieldAmendments<{
            fees: number;
            licensesCount: number;
            deliveryMethods: string[];
          }>
        | undefined;

      if (hasContractAmendment || isSuperseded) {
        const amendmentContract = isSuperseded
          ? contractsMap.get(supersededByContractId!)
          : deepestChild;

        if (amendmentContract) {
          const originalLicenses = getLicensesCount(contract, productId);
          const amendedLicenses = getLicensesCount(
            amendmentContract,
            productId,
          );
          const originalDelivery = getDeliveryMethods(contract, productId);
          const amendedDelivery = getDeliveryMethods(
            amendmentContract,
            productId,
          );

          const amendedBy = {
            contractId: amendmentContract.id,
            contractType: amendmentContract.contract_types?.name,
          };

          const amendments: FieldAmendments<{
            fees: number;
            licensesCount: number;
            deliveryMethods: string[];
          }> = {};

          if (feeSourceContractId && effectiveFeeUSD !== currentFeeUSD) {
            amendments.fees = {
              original: currentFeeUSD,
              amendedBy,
            };
          }

          // Only track if amendment has license data for this product (not just missing)
          const amendmentHasLicenseData = (
            amendmentContract.vendor_products_users || []
          ).some((vpu) => vpu.product_id === productId);
          if (amendmentHasLicenseData && originalLicenses !== amendedLicenses) {
            amendments.licensesCount = {
              original: originalLicenses,
              amendedBy,
            };
          }

          if (
            amendedDelivery.length > 0 &&
            JSON.stringify(originalDelivery) !== JSON.stringify(amendedDelivery)
          ) {
            amendments.deliveryMethods = {
              original: originalDelivery,
              amendedBy,
            };
          }

          if (Object.keys(amendments).length > 0) {
            productAmendments = amendments;
          }
        }
      }

      const productCurrentProducts = currentProducts.filter(
        (cp) => cp.product_id === productId,
      );

      // Compute product-level effective values
      const feeSourceContract = feeSourceContractId
        ? contractsMap.get(feeSourceContractId)
        : undefined;
      const productEffectiveValues = computeProductEffectiveValues(
        contract,
        amendmentsInOrder,
        productId,
        effectiveFeeUSD,
        feeSourceContractId,
        feeSourceContract?.contract_types?.name,
      );

      enrichedProducts.push({
        product_id: productId,
        name: productName,
        fees: baseFees,
        year: firstYear,
        sourceContractId,
        isSuperseded,
        supersededByContractId,
        isSuperseding,
        supersedesProductInContractId,
        currentFee,
        currency,
        currentFeeUSD,
        currentProducts: productCurrentProducts,
        effectiveFeeUSD,
        effectiveFee,
        effectiveFeeCurrency,
        feeSourceContractId,
        effectiveValues: productEffectiveValues,
        amendments: productAmendments,
      });
    }

    const supersededProductIds = new Set(
      enrichedProducts.filter((p) => p.isSuperseded).map((p) => p.product_id),
    );

    if (priceHistory.periods) {
      for (const period of priceHistory.periods) {
        if (period.productFees) {
          for (const productFee of period.productFees) {
            const productId =
              typeof productFee.productId === 'string'
                ? parseInt(productFee.productId, 10)
                : productFee.productId;
            productFee.isSuperseded = supersededProductIds.has(productId);
          }
        }
      }
    }

    const isInvoice = isInvoiceType(contract.type_id);
    const hasParent = hierarchyMap.parents.has(contract.id);
    const isLinkedChildInvoice = isInvoice && hasParent;
    // An invoice counts toward overall spend only when a reviewer says so
    // Everything else always counts.
    const excludedFromOverallSpend =
      isInvoice && contract.apply_to_overall_spend !== true;

    const allProductsSuperseded =
      enrichedProducts.length > 0 &&
      enrichedProducts.every((p) => p.isSuperseded);

    enrichedContracts.push({
      id: contract.id,
      vendor_id: contract.vendor_id,
      vendor_name: contract.vendors?.name || 'Unknown Vendor',
      vendor_domain: contract.vendors?.domain,
      contract,
      products: enrichedProducts,
      priceHistory,
      isLinkedChildInvoice,
      excludedFromOverallSpend,
      isFullySuperseded: allProductsSuperseded,
      effectiveValues,
      effectiveContract,
      amendments: contractAmendments,
    });
  }

  return enrichedContracts;
}
