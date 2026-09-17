import {
  EnrichedProduct,
  ContractWithAmendments,
  ContractBase,
  FieldAmendments,
  EffectiveValues,
} from '@/lib/v2/core/types';
import { InventoryItem, AmendableInventoryFields } from './types';
import { buildTermProducts, TermProductsResult } from '@/lib/v2/core/products';
import { getProductYearLabel } from '@/app/lib/budget';
import {
  contractOwners,
  ownerGroupRefs,
  ownerSponsorNames,
} from '@/lib/v2/owners/embed';
import type { BusinessGroupRef } from '@/lib/v2/owners/types';
import type { SeatRoster } from '@/lib/v2/seats/types';
import _ from 'lodash';

function dedupeBusinessGroups(groups: BusinessGroupRef[]): BusinessGroupRef[] {
  const map = new Map<string, BusinessGroupRef>();
  groups.forEach((g) => map.set(g.id, g));
  return Array.from(map.values());
}

/**
 * Helper to get a value from EffectiveValues with a fallback.
 */
function getEffectiveValue<T>(
  effectiveValues: EffectiveValues | undefined,
  key: string,
  fallback: T,
): T {
  if (!effectiveValues || !(key in effectiveValues)) return fallback;
  return (effectiveValues[key].value as T) ?? fallback;
}

/**
 * Normalize business sponsor to array format.
 */
function normalizeBusinessSponsor(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(Boolean) as string[];
  if (value) return [value as string];
  return [];
}

interface BuildInventoryItemParams {
  product: EnrichedProduct;
  sourceContract: ContractBase;
  fiscalYearStartMonth: number;
  contractsMap: Map<number, ContractBase>;
  enrichedSourceContract?: ContractWithAmendments;
  enrichedPricingContract?: ContractWithAmendments;
  /** Org base display currency — the denomination `cost` already carries. */
  baseCurrency: string;
  /** Which of the contract's seats count as active users. */
  roster: SeatRoster;
}

/**
 * Build amendments field by mapping pre-computed amendments to inventory field names.
 * Uses amendments already computed in enrichWithAmendments() - no re-comparison needed.
 */
function buildAmendmentsField(
  enrichedSourceContract: ContractWithAmendments | undefined,
  productId: number,
): FieldAmendments<AmendableInventoryFields> | undefined {
  if (!enrichedSourceContract) return undefined;

  const amendments: FieldAmendments<AmendableInventoryFields> = {};

  // Map contract-level amendments (already computed in amendments.ts)
  const contractAmendments = enrichedSourceContract.amendments;
  if (contractAmendments) {
    // Map field names from contract schema to inventory schema
    if (contractAmendments.term_start_date) {
      amendments.startDate = {
        original: contractAmendments.term_start_date.original,
        amendedBy: contractAmendments.term_start_date.amendedBy,
      };
    }
    if (contractAmendments.term_end_date) {
      amendments.endDate = {
        original: contractAmendments.term_end_date.original,
        amendedBy: contractAmendments.term_end_date.amendedBy,
      };
    }
    if (contractAmendments.end_users) {
      amendments.endUsers = {
        original: contractAmendments.end_users.original,
        amendedBy: contractAmendments.end_users.amendedBy,
      };
    }
    if (contractAmendments.annual_increase) {
      amendments.annualIncrease = {
        original: contractAmendments.annual_increase.original,
        amendedBy: contractAmendments.annual_increase.amendedBy,
      };
    }
    if (contractAmendments.business_sponsor) {
      amendments.businessSponsor = {
        original: normalizeBusinessSponsor(
          contractAmendments.business_sponsor.original,
        ),
        amendedBy: contractAmendments.business_sponsor.amendedBy,
      };
    }
  }

  // Get product-level amendments (already computed in amendments.ts)
  const enrichedProduct = enrichedSourceContract.products?.find(
    (p) => p.product_id === productId,
  );

  if (enrichedProduct?.amendments) {
    const productAmendments = enrichedProduct.amendments;

    if (productAmendments.licensesCount) {
      amendments.licensesCount = productAmendments.licensesCount;
    }
    if (productAmendments.deliveryMethods) {
      amendments.deliveryMethods = productAmendments.deliveryMethods;
    }
    if (productAmendments.fees) {
      amendments.cost = {
        // The pre-amendment fee, unconverted: it belongs to the original
        // contract, so it reads in that contract's own currency — the amended
        // figure beside it may be denominated differently (PSK-1796).
        original: {
          amount: enrichedProduct.currentFee,
          currency: enrichedProduct.currency?.toUpperCase() || 'USD',
        },
        amendedBy: productAmendments.fees.amendedBy,
      };
    }
  }

  return Object.keys(amendments).length > 0 ? amendments : undefined;
}

/**
 * Pure transformation: builds InventoryItem from enriched data
 * Handles term products building and amendment fee merging
 */
export function buildInventoryItem({
  product,
  sourceContract,
  fiscalYearStartMonth,
  contractsMap,
  enrichedSourceContract,
  enrichedPricingContract,
  baseCurrency,
  roster,
}: BuildInventoryItemParams): InventoryItem {
  // Get pricing source info - for inventory, check if product comes from an amendment
  // (different from monthly report where we check feeSourceContractId for superseded products)
  const pricingSourceContractId =
    product.contract_id !== product.sourceContractId
      ? product.contract_id
      : undefined;
  const pricingSourceContractType = pricingSourceContractId
    ? contractsMap.get(pricingSourceContractId)?.contract_types?.name
    : undefined;
  // Build term products with merged amendment fees
  const sourceTermProducts = enrichedSourceContract
    ? buildTermProducts(
        sourceContract,
        enrichedSourceContract.priceHistory,
        fiscalYearStartMonth,
      )
    : buildTermProducts(sourceContract, {}, fiscalYearStartMonth);

  // For amendments, use enrichedPricingContract's underlying contract data
  const pricingContractData = enrichedPricingContract?.contract;
  const pricingTermProducts =
    product.contract_id !== product.sourceContractId &&
    enrichedPricingContract &&
    pricingContractData
      ? buildTermProducts(
          pricingContractData,
          enrichedPricingContract.priceHistory,
          fiscalYearStartMonth,
        )
      : null;

  const currentTermProducts = mergeAmendmentFees(
    sourceTermProducts,
    pricingTermProducts,
    fiscalYearStartMonth,
  );

  // Base figure — what vendor rollups sum and what the Cost column sorts on.
  const cost = product.effectiveFeeUSD ?? 0;
  // Display pair — a row is one product on one contract, so it shows the fee
  // unconverted, in the currency of whichever contract sources it (PSK-1796).
  // The stamps travel as a PAIR: with either half missing, the only amount in
  // hand is the base `cost`, and labeling it anything but the base currency
  // would put the wrong symbol on a converted figure.
  const hasNativePair =
    product.effectiveFee !== undefined && !!product.effectiveFeeCurrency;
  const costNative = hasNativePair ? product.effectiveFee! : cost;
  const costCurrency = hasNativePair
    ? product.effectiveFeeCurrency!
    : baseCurrency;
  const productUsers = (sourceContract.contract_users ?? []).filter(
    (user) =>
      user.product_id === product.product_id &&
      roster.isActiveEmployee(user.org_employee_id ?? null),
  );

  const sourceDeliveryMethods = getDeliveryMethods(
    sourceContract,
    product.product_id,
  );
  const status = sourceContract.status === 'active' ? 'Active' : 'Inactive';
  const owners = contractOwners(sourceContract);
  const businessGroups = ownerGroupRefs(owners);

  // Get pre-computed effective values from enrichment
  const contractEffectiveValues = enrichedSourceContract?.effectiveValues;
  const productEffectiveValues = enrichedSourceContract?.products?.find(
    (p) => p.product_id === product.product_id,
  )?.effectiveValues;

  // Use pre-computed effective values with source contract as fallback
  const effectiveStartDate = getEffectiveValue(
    contractEffectiveValues,
    'term_start_date',
    getDateString(sourceContract.term_start_date),
  );
  const effectiveEndDate = getEffectiveValue(
    contractEffectiveValues,
    'term_end_date',
    getDateString(sourceContract.term_end_date),
  );
  const effectiveAnnualIncrease = getEffectiveValue(
    contractEffectiveValues,
    'annual_increase',
    sourceContract.annual_increase ?? null,
  );
  const effectiveEndUsers = getEffectiveValue(
    contractEffectiveValues,
    'end_users',
    sourceContract.end_users || '',
  );
  const effectiveBusinessSponsor = normalizeBusinessSponsor(
    getEffectiveValue(
      contractEffectiveValues,
      'business_sponsor',
      ownerSponsorNames(owners),
    ),
  );

  // Product-level effective values
  const effectiveLicensesCount = getEffectiveValue(
    productEffectiveValues,
    'licensesCount',
    getSeatUsageForProduct(sourceContract, product.product_id).allocated,
  );
  const effectiveDeliveryMethods = getEffectiveValue(
    productEffectiveValues,
    'deliveryMethods',
    sourceDeliveryMethods,
  );

  // Build amendments by mapping pre-computed data
  const amendments = buildAmendmentsField(
    enrichedSourceContract,
    product.product_id,
  );

  return {
    id: `${product.sourceContractId}-product-${product.product_id}`,
    vendor: product.vendor_name,
    vendorId: product.vendor_id,
    vendorDomain: product.vendor_domain,
    productName: [product.name],
    licensesCount: effectiveLicensesCount,
    endUsers: effectiveEndUsers,
    startDate: effectiveStartDate,
    endDate: effectiveEndDate,
    cost,
    costNative,
    currency: costCurrency,
    deliveryMethods: effectiveDeliveryMethods,
    status,
    activeUsers: productUsers.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      product_id: u.product_id,
      employee_id: u.employee_id,
      region: u.region,
      country: u.country,
      division: u.division,
      department: u.department,
      cost_center: u.cost_center,
      entity: u.org_employees?.entity ?? null,
      business_unit: u.org_employees?.business_unit ?? null,
      team: u.org_employees?.team ?? null,
      businessGroup: u.org_employees?.businessGroup ?? null,
      start_date: u.start_date,
      leave_date: u.leave_date,
      org_employee_id: u.org_employee_id ?? null,
    })),
    // Alert fields
    contractedLicenses: effectiveLicensesCount,
    activeLicenses: productUsers.length,
    isExpiredButActive:
      status === 'Active' &&
      !!effectiveEndDate &&
      new Date(effectiveEndDate) < new Date(),
    hasMissingDeployment: status === 'Active' && productUsers.length === 0,
    contractedTeams: 1,
    deployedTeams: productUsers.length > 0 ? 1 : 0,
    // Contract fields
    contractId: String(product.sourceContractId),
    contractType: sourceContract.contract_types?.name || 'Unknown',
    executionDate: sourceContract.execution_date || '',
    businessSponsor: effectiveBusinessSponsor,
    businessGroup: businessGroups.map((g) => g.name).join(', '),
    businessGroups,
    product_id: product.product_id,
    enterprise: (sourceContract.vendor_products_users || []).some(
      (vpu) => vpu.product_id === product.product_id && vpu.enterprise === true,
    ),
    annualIncrease: effectiveAnnualIncrease,
    currentTermProducts,
    vendor_products_details: sourceContract.vendor_products_details?.filter(
      (vpd) =>
        (vpd.product_id || vpd.vendor_products?.id) === product.product_id,
    ) as InventoryItem['vendor_products_details'],
    // Track if pricing comes from an amendment (from effectiveFees enrichment)
    pricingSourceContractId,
    pricingSourceContractType,
    // Per-field amendment tracking
    amendments,
  };
}

/**
 * Get seat usage for a specific product from a contract
 */
function getSeatUsageForProduct(
  contract: Pick<ContractBase, 'vendor_products_users' | 'contract_users'>,
  productId: number,
): { used: number; allocated: number } {
  const productSeatsData = (contract.vendor_products_users || []).filter(
    (seat) => seat.product_id === productId,
  );
  const contractUsers = (contract.contract_users || []).filter(
    (user) => user.product_id === productId,
  );

  const usedSeats = contractUsers.length;
  const allocatedSeats = productSeatsData.reduce(
    (sum, seat) => sum + (seat.number_of_users || 0),
    0,
  );

  return {
    used: usedSeats,
    allocated: allocatedSeats,
  };
}

/**
 * Extract delivery methods from contract
 */
function getDeliveryMethods(
  contract: ContractBase,
  productId: number,
): string[] {
  const productDetail = contract.vendor_products_details?.find(
    (vpd) => (vpd.product_id || vpd.vendor_products?.id) === productId,
  );

  if (productDetail?.vendor_products?.data_delivery_types?.name) {
    return [productDetail.vendor_products.data_delivery_types.name];
  }

  return (
    contract.contract_data_delivery_types
      ?.map((dt: any) => dt.data_delivery_types?.name)
      .filter(Boolean) || []
  );
}

/**
 * Extract date string from date array, returning the most recent date.
 * Defensively sorts by date descending to ensure correct result regardless of input order.
 */
function getDateString(dateArray?: Array<{ date: string }> | null): string {
  if (!dateArray?.length) return '';
  if (dateArray.length === 1) return dateArray[0]?.date ?? '';

  const sorted = [...dateArray].sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? ''),
  );
  return sorted[0]?.date ?? '';
}

/**
 * Merge source contract years with amendment fees
 */
function mergeAmendmentFees(
  sourceTermProducts: TermProductsResult,
  pricingTermProducts: TermProductsResult | null,
  fiscalYearStartMonth: number,
): TermProductsResult {
  if (!pricingTermProducts) {
    return sourceTermProducts;
  }

  // Helper to get fiscal year label
  const getSourceFYLabel = (year: number) =>
    getProductYearLabel(
      year,
      sourceTermProducts.termStartDate,
      fiscalYearStartMonth,
    );
  const getAmendmentFYLabel = (year: number) =>
    getProductYearLabel(
      year,
      pricingTermProducts.termStartDate,
      fiscalYearStartMonth,
    );

  // Build amendment product map by product_id and fiscal year
  const amendmentProductMap = new Map<string, any>();
  let earliestAmendmentYear: number | null = null;

  for (const [year, yearProducts] of Object.entries(
    pricingTermProducts.productsByYear,
  )) {
    const amendmentYear = parseInt(year, 10);
    const fyLabel = getAmendmentFYLabel(amendmentYear);
    if (
      earliestAmendmentYear == null ||
      amendmentYear < earliestAmendmentYear
    ) {
      earliestAmendmentYear = amendmentYear;
    }
    for (const ap of yearProducts as any[]) {
      amendmentProductMap.set(`${ap.product_id}-${fyLabel}`, ap);
    }
  }

  // Merge: replace fees for matching FY and all subsequent years
  const mergedProductsByYear: Record<string, any[]> = {};

  for (const [year, yearProducts] of Object.entries(
    sourceTermProducts.productsByYear,
  )) {
    const sourceYear = parseInt(year, 10);
    const sourceFYLabel = getSourceFYLabel(sourceYear);

    mergedProductsByYear[year] = (yearProducts as any[]).map((sp: any) => {
      const shouldUseAmendmentFee =
        earliestAmendmentYear != null && sourceYear >= earliestAmendmentYear;

      if (shouldUseAmendmentFee) {
        const exactMatch = amendmentProductMap.get(
          `${sp.product_id}-${sourceFYLabel}`,
        );
        const anyMatch = [...amendmentProductMap.entries()].find(([key]) =>
          key.startsWith(`${sp.product_id}-`),
        )?.[1];

        const amendmentProduct = exactMatch || anyMatch;

        if (amendmentProduct) {
          return {
            ...sp,
            fees: amendmentProduct.fees,
            compoundedFee: amendmentProduct.compoundedFee,
            originalFees: sp.fees,
          };
        }
      }
      return sp;
    });
  }

  return {
    ...sourceTermProducts,
    productsByYear: mergedProductsByYear,
  };
}

/**
 * Group inventory items by vendor
 */
export function groupInventoryByVendor(
  items: InventoryItem[],
  baseCurrency: string,
): InventoryItem[] {
  const groupedData = _.groupBy(items, 'vendorId');
  const results: InventoryItem[] = [];

  for (const [vendorId, vendorItems] of Object.entries(groupedData)) {
    if (vendorItems.length === 1) {
      results.push(vendorItems[0]);
      continue;
    }

    const firstItem = vendorItems[0];
    const hasActiveContracts = vendorItems.some(
      (item) => item.status === 'Active',
    );
    const startDates = vendorItems
      .map((item) => item.startDate)
      .filter(Boolean)
      .sort();
    const endDates = vendorItems
      .map((item) => item.endDate)
      .filter(Boolean)
      .sort();
    const aggregatedBusinessGroups = dedupeBusinessGroups(
      vendorItems.flatMap((item) => item.businessGroups || []),
    );

    results.push({
      ...firstItem,
      id: `vendor-${vendorId}`,
      productName: vendorItems.flatMap((item) => item.productName),
      licensesCount: vendorItems.reduce(
        (sum, item) => sum + item.licensesCount,
        0,
      ),
      cost: vendorItems.reduce((sum, item) => sum + (item.cost ?? 0), 0),
      // A vendor row sums across contracts, so it reads in its items' shared
      // currency when they all agree — a vendor billed only in USD gains
      // nothing from translation — and in the org base when they mix, since
      // a sum across denominations only means anything translated (PSK-1796).
      ...(() => {
        const currencies = new Set(
          vendorItems.map((item) => item.currency || 'USD'),
        );
        if (currencies.size === 1) {
          return {
            currency: [...currencies][0],
            costNative: vendorItems.reduce(
              (sum, item) => sum + (item.costNative ?? 0),
              0,
            ),
          };
        }
        return {
          currency: baseCurrency,
          costNative: vendorItems.reduce(
            (sum, item) => sum + (item.cost ?? 0),
            0,
          ),
        };
      })(),
      endUsers: vendorItems
        .map((item) => item.endUsers)
        .filter(Boolean)
        .join(', '),
      deliveryMethods: [
        ...new Set(vendorItems.flatMap((item) => item.deliveryMethods)),
      ],
      activeUsers: vendorItems.flatMap((item) => item.activeUsers),
      businessSponsor: [
        ...new Set(vendorItems.flatMap((item) => item.businessSponsor || [])),
      ].filter(Boolean),
      businessGroups: aggregatedBusinessGroups,
      businessGroup: aggregatedBusinessGroups.map((g) => g.name).join(', '),
      status: hasActiveContracts ? 'Active' : 'Inactive',
      startDate: startDates[0] || '',
      endDate: endDates[endDates.length - 1] || '',
      isVendorGroup: true,
      contractedLicenses: undefined,
      activeLicenses: undefined,
      isExpiredButActive: false,
      hasMissingDeployment: false,
      contractedTeams: undefined,
      deployedTeams: undefined,
      subRows: vendorItems.map((item) => ({
        ...item,
        vendor_products: { name: item.productName.join(', ') },
      })),
    });
  }

  return results;
}

export function filterInventoryByVendor(
  items: InventoryItem[],
  vendorId: number,
): InventoryItem[] {
  return items.filter((item) => item.vendorId === vendorId);
}
