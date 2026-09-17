/**
 * Pricing Enrichment Functions
 *
 * Adds pricing information (currentFee, priceHistory) to contracts and products.
 */

import {
  generatePriceHistory,
  extractBudgetFromPriceHistory,
} from '@/app/lib/budget';
import {
  ContractWithLineage,
  ContractWithPricing,
  ProductWithPricing,
  VendorProductDetail,
} from './types';
import { buildBaseCurrencyRates } from './baseRates';
import {
  hasFeeOverrides,
  getContractStartDate,
} from '@/lib/v2/products/transforms';

export interface PricingOptions {
  skipExchangeRates?: boolean;
  /**
   * Org base display currency to convert fees into; defaults to USD. Rates are
   * taken as of each contract's own start date, so a renewal repriced years
   * ago keeps the rate it was signed at.
   */
  baseCurrency?: string;
  /**
   * Confirmed cancellation cutoffs (PSK-1830), contractId -> productId ->
   * date accrual stops. Threaded into `generatePriceHistory` so budget
   * numbers derived from these price histories exclude cancelled products.
   * Omitted means no cutoffs are applied — behavior identical to before.
   */
  cutoffsByContract?: Map<number, Map<number, Date>>;
}

/** The slice of an active price-history period the fee resolution reads. */
interface ActivePeriodLike {
  startDate?: string;
  yearWithinTerm?: number;
  productFees?: Array<{
    productId: number | string;
    fees: number;
    compoundedFees?: number;
  }>;
}

/**
 * Resolve a product's current fee from the active period, falling back to
 * its base fee — unless a cancellation cutoff (PSK-1830) zeroed the active
 * period deliberately, in which case falling back would resurrect the fee.
 * Pure; uses the same new Date() comparison as `applyProductFeeCutoffs`.
 */
export function resolveCurrentFee(
  product: { product_id: number; fees: number },
  activePeriod: ActivePeriodLike | undefined,
  cutoff: Date | undefined,
): number {
  const productFee = activePeriod?.productFees?.find(
    (pf) => pf.productId === product.product_id,
  );
  const periodFee = productFee
    ? productFee.fees || productFee.compoundedFees || 0
    : 0;
  if (periodFee !== 0) return periodFee;

  const struckFromActivePeriod =
    cutoff != null &&
    activePeriod?.startDate != null &&
    new Date(activePeriod.startDate) >= cutoff;

  return struckFromActivePeriod ? 0 : product.fees || 0;
}

/**
 * Enrich contracts with pricing information.
 * Adds currentFee, currency, currentFeeUSD, and priceHistory to each contract/product.
 */
export async function enrichWithPricing(
  contracts: ContractWithLineage[],
  fiscalYearStartMonth: number,
  options?: PricingOptions,
): Promise<ContractWithPricing[]> {
  // One prefetch for the whole set; skipped entirely when conversion isn't
  // needed (e.g. the calendar view, which never aggregates).
  const rates = options?.skipExchangeRates
    ? null
    : await buildBaseCurrencyRates(
        contracts.map((c) => ({
          currency: c.contract.currency,
          startDate: getContractStartDate(c.contract),
        })),
        options?.baseCurrency || 'USD',
      );

  return contracts.map((enrichedContract) => {
    const contract = enrichedContract.contract;
    const currency = contract.currency?.toUpperCase() || 'USD';
    const rate = rates?.multiplier(currency, getContractStartDate(contract));

    const feeOverrides = hasFeeOverrides(contract);
    const contractCutoffs = options?.cutoffsByContract?.get(contract.id);

    // The price-history chain denominates its *USD outputs off each product
    // row's `convertedFees` and silently falls back to the NATIVE `fees` when
    // that stamp is missing — which is how totalContractValueUSD /
    // annualContractValueUSD / feesUSD (and everything downstream: vendor TCV,
    // price-history ACV, report totals) end up labelled with the base symbol
    // while holding a foreign amount. Stamping here, at the one point every
    // price history on this path is generated, closes that gap using the very
    // multiplier `currentFeeUSD` below converts at.
    //
    // The copy is deliberate: the stamp exists only for price-history
    // generation, so the contract object the caller passed in — the one the
    // spend engine reads and keys its fee digest on — is left untouched.
    // Engine impact is nil either way; under mode 'base' it reads native fees.
    const productDetails: VendorProductDetail[] | undefined =
      contract.vendor_products_details;
    const contractForPricing =
      rate === undefined || !productDetails
        ? contract
        : {
            ...contract,
            vendor_products_details: productDetails.map((product) => ({
              ...product,
              convertedFees: (Number(product.fees) || 0) * rate,
            })),
          };

    const priceHistory = generatePriceHistory(
      contractForPricing,
      fiscalYearStartMonth,
      'minimal',
      { hasFeeOverrides: feeOverrides, productFeeCutoffs: contractCutoffs },
    );

    // Build superseded product IDs set for quick lookup
    const supersededProductIds = new Set(
      enrichedContract.products
        .filter((p) => p.isSuperseded)
        .map((p) => p.product_id),
    );

    // Mark productFees as superseded in all periods
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

    const { currentProducts } = extractBudgetFromPriceHistory(priceHistory);
    const activePeriod = priceHistory.periods?.find(
      (p: any) => p.isActivePeriod,
    );

    // Add pricing to each product
    const productsWithPricing: ProductWithPricing[] =
      enrichedContract.products.map((product) => {
        const currentFee = resolveCurrentFee(
          product,
          activePeriod,
          contractCutoffs?.get(product.product_id),
        );

        // Get current products for this specific product
        const productCurrentProducts = currentProducts.filter(
          (cp: any) => cp.product_id === product.product_id,
        );

        const currentFeeUSD =
          rate === undefined
            ? currentFee // Native value when conversion is skipped
            : currentFee * rate;

        return {
          ...product,
          currentFee,
          currency,
          currentFeeUSD,
          year: activePeriod?.yearWithinTerm ?? product.year,
          currentProducts: productCurrentProducts,
          // Default effective fee to current fee (will be updated by enrichWithEffectiveFees)
          effectiveFeeUSD: currentFeeUSD,
          feeSourceContractId: undefined,
          isCancelled: contractCutoffs?.has(product.product_id) ?? false,
        };
      });

    return {
      ...enrichedContract,
      products: productsWithPricing,
      priceHistory,
    };
  });
}

/**
 * Enrich contracts with effective fees.
 * For superseded products, looks up the fee from the superseding (amendment) contract.
 * Updates both contract.products and priceHistory.periods[].productFees.
 * Date-aware: only applies amendment fees to periods on or after the amendment's start date.
 * Must run after enrichWithPricing.
 */
export function enrichWithEffectiveFees(
  contracts: ContractWithPricing[],
): ContractWithPricing[] {
  // Build map for quick lookup of contracts by ID
  const contractsMap = new Map(contracts.map((c) => [c.id, c]));

  return contracts.map((contract) => {
    // Build map of superseded product IDs to their amendment info (with effective date)
    const amendmentMap = new Map<
      number,
      {
        contractId: number;
        feeUSD: number;
        effectiveDate: Date | null;
      }
    >();

    // First pass: identify superseded products and their amendment fees
    contract.products.forEach((product) => {
      if (product.isSuperseded && product.supersededByContractId) {
        const supersedingContract = contractsMap.get(
          product.supersededByContractId,
        );
        if (supersedingContract) {
          const supersedingProduct = supersedingContract.products.find(
            (p) => p.product_id === product.product_id,
          );
          if (supersedingProduct) {
            // Get amendment's term start date
            const termStartDate =
              supersedingContract.contract.term_start_date?.[0]?.date;
            const effectiveDate = termStartDate
              ? new Date(termStartDate)
              : null;

            amendmentMap.set(product.product_id, {
              contractId: supersedingContract.id,
              feeUSD: supersedingProduct.currentFeeUSD,
              effectiveDate,
            });
          }
        }
      }
    });

    // Update products with effective fees (for current/active period display)
    const updatedProducts = contract.products.map((product) => {
      const amendment = amendmentMap.get(product.product_id);
      if (amendment) {
        return {
          ...product,
          effectiveFeeUSD: amendment.feeUSD,
          feeSourceContractId: amendment.contractId,
        };
      }
      return product;
    });

    // Build map of superseding products with their effective dates
    const supersedingProductsMap = new Map<number, Date | null>();
    contract.products.forEach((product) => {
      if (product.isSuperseding && product.supersedesProductInContractId) {
        // Get this contract's term start date as the effective date
        const termStartDate = contract.contract.term_start_date?.[0]?.date;
        const effectiveDate = termStartDate ? new Date(termStartDate) : null;
        supersedingProductsMap.set(product.product_id, effectiveDate);
      }
    });

    // Update priceHistory.periods[].productFees with effective fees and superseding flags
    // Only apply to periods on or after the amendment's effective date
    let updatedPriceHistory = contract.priceHistory;
    if (
      contract.priceHistory?.periods &&
      (amendmentMap.size > 0 || supersedingProductsMap.size > 0)
    ) {
      const updatedPeriods = contract.priceHistory.periods.map(
        (period: any) => {
          if (!period.productFees) return period;

          // Get period start date for comparison
          const periodStartDate = period.startDate
            ? new Date(period.startDate)
            : null;

          const updatedProductFees = period.productFees.map((pf: any) => {
            const productId =
              typeof pf.productId === 'string'
                ? parseInt(pf.productId, 10)
                : pf.productId;
            const amendment = amendmentMap.get(productId);
            const supersedingEffectiveDate =
              supersedingProductsMap.get(productId);

            // Check if amendment applies to this period (date-aware)
            const amendmentApplies =
              amendment && periodStartDate && amendment.effectiveDate
                ? periodStartDate >= amendment.effectiveDate
                : !!amendment; // If no dates, apply to all periods (fallback)

            // Check if superseding applies to this period (date-aware)
            const isSuperseding =
              supersedingEffectiveDate !== undefined && periodStartDate
                ? supersedingEffectiveDate
                  ? periodStartDate >= supersedingEffectiveDate
                  : true
                : supersedingProductsMap.has(productId);

            // Exclude from effective totals if the product is superseded
            // (lineage-aware) OR if the amendment applies to this period (date-aware)
            const isEffectivelySuperseded =
              Boolean(pf.isSuperseded) || amendmentApplies;

            if (amendmentApplies && amendment) {
              return {
                ...pf,
                fees: amendment.feeUSD,
                feesUSD: amendment.feeUSD,
                isAmended: true,
                feeSourceContractId: amendment.contractId,
                isEffectivelySuperseded,
                isSuperseding,
              };
            }
            if (isSuperseding) {
              return {
                ...pf,
                isEffectivelySuperseded,
                isSuperseding,
              };
            }
            return { ...pf, isEffectivelySuperseded };
          });

          let effectiveFees = 0;
          let effectiveFeesUSD = 0;
          for (const pf of updatedProductFees) {
            if (!pf.isEffectivelySuperseded) {
              effectiveFees += pf.fees ?? 0;
              effectiveFeesUSD += pf.feesUSD ?? pf.fees ?? 0;
            }
          }
          // Keep original period totals for display
          return {
            ...period,
            productFees: updatedProductFees,
            effectiveFees,
            effectiveFeesUSD,
          };
        },
      );

      updatedPriceHistory = {
        ...contract.priceHistory,
        periods: updatedPeriods,
      };
    }

    // Calculate effective TCV from current term periods
    // Note: superseding contracts (amendments) use their actual TCV since parents are excluded
    const allProductsSuperseding =
      updatedProducts.length > 0 &&
      updatedProducts.every((p) => p.isSuperseding);
    const allProductsSuperseded =
      updatedProducts.length > 0 &&
      updatedProducts.every((p) => p.isSuperseded);

    let effectiveTotalContractValueUSD = 0;
    let effectiveTotalContractValue = 0;
    if (updatedPriceHistory?.periods) {
      // Only sum current term periods (same as original TCV calculation)
      const currentTermPeriods = updatedPriceHistory.periods.filter(
        (p: any) => p.isCurrentTerm,
      );
      effectiveTotalContractValueUSD = currentTermPeriods.reduce(
        (sum: number, p: any) =>
          sum + (p.effectiveFeesUSD ?? p.feesUSD ?? p.fees ?? 0),
        0,
      );
      effectiveTotalContractValue = currentTermPeriods.reduce(
        (sum: number, p: any) => sum + (p.effectiveFees ?? p.fees ?? 0),
        0,
      );
    } else {
      effectiveTotalContractValueUSD =
        contract.priceHistory?.totalContractValueUSD ||
        contract.priceHistory?.totalContractValue ||
        0;
      effectiveTotalContractValue =
        contract.priceHistory?.totalContractValue || 0;
    }

    return {
      ...contract,
      products: updatedProducts,
      priceHistory: {
        ...updatedPriceHistory,
        effectiveTotalContractValueUSD,
        effectiveTotalContractValue,
        isFullySuperseding: allProductsSuperseding,
        isFullySuperseded: allProductsSuperseded,
      },
    };
  });
}
