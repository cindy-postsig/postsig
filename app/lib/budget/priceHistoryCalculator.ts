import {
  parseISO,
  addMonths,
  addDays,
  addYears,
  differenceInMonths,
  differenceInDays,
  format,
  isAfter,
  isBefore,
  isValid,
} from 'date-fns';
import { calculateCompoundedFee } from './feeCalculator';
import { getFiscalYearInfo } from './dateUtils';
import {
  Contract,
  FiscalContext,
  PriceHistory,
  PricePeriod,
  ProductFee,
} from './types';
import { markCurrentTerm, markActivePeriod } from './priceHistoryUtils';
import logger from '@/utils/pino';

export interface PriceHistoryOptions {
  /** When true, fees were manually edited - use raw fees without annual increase compounding */
  hasFeeOverrides?: boolean;
  /** Target calendar year to project through (used by 'max' mode) */
  targetYear?: number;
  /** "Now" as an explicit input; defaults to the wall clock so existing callers are unchanged */
  asOf?: Date;
  /**
   * Effective end date per cancelled product (PSK-1830): periods starting on
   * or after a product's cutoff keep the row but accrue zero for it. Keyed
   * like `ProductFee.productId`.
   */
  productFeeCutoffs?: Map<number | string, Date>;
}

/**
 * Zero a cancelled product's fees in every period starting on or after its
 * cutoff, recomputing the period totals. Rows are kept — the record stays
 * complete — mirroring `truncateSupersededAtChildStart` in
 * priceHistorySummary.ts, which applies the same rule for supersession.
 */
export function applyProductFeeCutoffs(
  periods: PricePeriod[],
  cutoffByProductId: Map<number | string, Date>,
): PricePeriod[] {
  if (cutoffByProductId.size === 0) return periods;

  return periods.map((period) => {
    // new Date(), not parseISO: cutoffs come from getOrderingDate, which
    // parses date-only strings as UTC midnight. parseISO would parse the
    // period start as LOCAL midnight and shift the comparison by the TZ
    // offset, flipping boundary periods in non-UTC environments.
    const periodStart = new Date(period.startDate);
    let changed = false;
    const productFees = period.productFees.map((pf) => {
      const cutoff = cutoffByProductId.get(pf.productId);
      if (!cutoff || periodStart < cutoff) return pf;
      changed = true;
      return { ...pf, fees: 0, feesUSD: 0 };
    });
    if (!changed) return period;
    return {
      ...period,
      productFees,
      fees: productFees.reduce((sum, p) => sum + p.fees, 0),
      feesUSD: productFees.reduce((sum, p) => sum + (p.feesUSD || 0), 0),
    };
  });
}

// Function to process multiple contracts
export function generatePriceHistories(
  contracts: Contract[],
  fiscalYearStartMonth: number = 1,
  mode: 'full' | 'minimal' = 'full',
  cutoffsByContract?: Map<number, Map<number, Date>>,
): PriceHistory[] {
  // Filter out contracts where status_id is not 4 (published/active)
  const activeContracts = contracts.filter(
    (contract) => contract.status_id === 4,
  );

  return activeContracts.map((contract) =>
    generatePriceHistory(contract, fiscalYearStartMonth, mode, {
      productFeeCutoffs: cutoffsByContract?.get(contract.id as number),
    }),
  );
}

export function generatePriceHistory(
  contractInput: Contract,
  fiscalYearStartMonth: number = 1,
  mode: 'full' | 'minimal' | 'max' = 'full',
  options?: PriceHistoryOptions,
): PriceHistory {
  const asOf = options?.asOf ?? new Date();
  const contract = options?.hasFeeOverrides
    ? { ...contractInput, annual_increase: null }
    : contractInput;

  if (
    !contract.vendor_products_details?.length ||
    !contract.term_start_date?.length
  ) {
    return createEmptyPriceHistory(contract);
  }

  // Extract dates
  const dates = extractContractDates(contract);
  const {
    initialStartDate,
    initialEndDate,
    currentStartDate,
    currentEndDate,
    currentCancelByDate,
  } = dates;

  if (!initialStartDate) {
    return createEmptyPriceHistory(contract);
  }

  // Setup fiscal context
  const { currentFiscalYearStart, nextFiscalYearStart } = getFiscalYearInfo(
    fiscalYearStartMonth,
    asOf,
  );
  const fiscalContext: FiscalContext = {
    today: asOf,
    currentFiscalYearStart,
    nextFiscalYearStart,
    fiscalYearStartMonth,
  };

  // Analyze contract
  const maxProductYear =
    contract.vendor_products_details.length > 0
      ? Math.max(...contract.vendor_products_details.map((p) => p.year || 1))
      : null;
  const initialTermMonths = getTermLength(
    initialStartDate,
    initialEndDate,
    contract.subscription_term,
    maxProductYear,
  );
  const isNonStandard =
    !contract.renewal_period &&
    !contract.subscription_term &&
    initialTermMonths % 12 !== 0;

  // Generate periods
  const periods: PricePeriod[] = [];

  // 1. Initial term
  const initialResult = generateInitialTerm(
    contract,
    { ...dates, initialStartDate },
    isNonStandard,
    fiscalContext,
  );
  periods.push(...initialResult.periods);

  let renewalResult: TermGenerationResult;

  if (mode === 'minimal') {
    // MINIMAL MODE: Skip historical renewals, jump directly to current term
    renewalResult = generateCurrentTermOnly(
      contract,
      initialResult.lastEndDate,
      initialTermMonths,
      isNonStandard,
      fiscalContext,
      asOf,
    );
    periods.push(...renewalResult.periods);
  } else if (mode === 'max') {
    // MAX MODE: Generate all historical renewals with single-period for non-12-month terms
    renewalResult = generateTerms(
      contract,
      initialResult.lastEndDate,
      initialTermMonths,
      isNonStandard,
      {
        termType: 'renewal',
        fiscalContext,
        forceSinglePeriodRenewals: true,
        asOf,
      },
    );
    periods.push(...renewalResult.periods);
  } else {
    // FULL MODE: Generate all historical renewals
    renewalResult = generateTerms(
      contract,
      initialResult.lastEndDate,
      initialTermMonths,
      isNonStandard,
      {
        termType: 'renewal',
        fiscalContext,
        asOf,
      },
    );
    periods.push(...renewalResult.periods);
  }

  // 3. Generate projected terms after the current term
  if (mode === 'minimal') {
    // MINIMAL MODE: Only generate 1-2 periods for next term calculation
    const projectedResult = generateTerms(
      contract,
      renewalResult.lastEndDate,
      renewalResult.renewalLength,
      isNonStandard,
      {
        startTermIndex: renewalResult.termIndex,
        startRenewalCount: renewalResult.renewalCount,
        maxProjections: 2, // Just enough for next period
        termType: 'projected',
        asOf,
        fiscalContext: {
          ...fiscalContext,
          currentFiscalYearStart: undefined,
          nextFiscalYearStart: undefined,
        },
      },
    );
    periods.push(...projectedResult.periods);
  } else if (mode === 'max') {
    // MAX MODE: Generate enough projected terms to cover through the target year
    const targetYear =
      options?.targetYear ?? fiscalContext.today.getFullYear() + 5;
    const targetDate = new Date(targetYear + 1, 0, 1);
    const monthsToTarget = differenceInMonths(
      targetDate,
      renewalResult.lastEndDate,
    );
    const renewalLength = renewalResult.renewalLength || 12;
    const projectedNeeded = Math.max(
      0,
      Math.ceil(monthsToTarget / renewalLength),
    );

    if (projectedNeeded > 0) {
      const projectedResult = generateTerms(
        contract,
        renewalResult.lastEndDate,
        renewalResult.renewalLength,
        isNonStandard,
        {
          startTermIndex: renewalResult.termIndex,
          startRenewalCount: renewalResult.renewalCount,
          maxProjections: projectedNeeded,
          termType: 'projected',
          asOf,
          fiscalContext: {
            ...fiscalContext,
            currentFiscalYearStart: undefined,
            nextFiscalYearStart: undefined,
          },
          forceSinglePeriodRenewals: true,
        },
      );
      periods.push(...projectedResult.periods);
    }
  } else {
    // FULL MODE: Generate full projections (current behavior)
    // Check if we already have any projected terms in our renewalResult
    const hasProjectedTerms = renewalResult.periods.some(
      (p) =>
        p.status === 'projected' ||
        (parseISO(p.startDate) > fiscalContext.today! && !p.isCurrentTerm),
    );

    // If we already have a projected term in our renewals, we only need 2 more
    const projectedNeeded = hasProjectedTerms ? 2 : 3;

    if (projectedNeeded > 0) {
      // Use our unified terms function to generate projections
      const projectedResult = generateTerms(
        contract,
        renewalResult.lastEndDate,
        renewalResult.renewalLength,
        isNonStandard,
        {
          startTermIndex: renewalResult.termIndex,
          startRenewalCount: renewalResult.renewalCount,
          maxProjections: projectedNeeded,
          termType: 'projected',
          asOf,
          fiscalContext: {
            ...fiscalContext,
            currentFiscalYearStart: undefined,
            nextFiscalYearStart: undefined,
          },
        },
      );
      periods.push(...projectedResult.periods);
    }
  }

  // Apply confirmed cancellation cutoffs (PSK-1830) before anything derives
  // from period fees, so contract values and fiscal-year sums all see the
  // cancelled product as zero from its cutoff forward.
  const effectivePeriods = options?.productFeeCutoffs
    ? applyProductFeeCutoffs(periods, options.productFeeCutoffs)
    : periods;

  // Identify current term and active period
  markCurrentTerm(
    effectivePeriods,
    fiscalContext.today,
    fiscalContext.nextFiscalYearStart,
    currentStartDate ?? undefined,
  );

  // Mark the single period that contains today's date
  // If no active period is found, fall back to period matching the currentStartDate
  markActivePeriod(
    effectivePeriods,
    fiscalContext.today,
    currentStartDate ?? undefined,
  );

  // Calculate values
  const currentTermPeriods = effectivePeriods.filter((p) => p.isCurrentTerm);
  const {
    totalContractValue,
    annualContractValue,
    totalContractValueUSD,
    annualContractValueUSD,
  } = calculateContractValues(currentTermPeriods, asOf);

  return {
    id: contract.id as number,
    vendor: contract.vendors?.name || 'Unknown Vendor',
    vendor_id: contract.vendor_id as number, // Include vendor_id for TopVendorsChart
    vendorDomain: contract.vendors?.domain, // Include domain in camelCase for existing code
    currency: contract.currency || 'usd',
    initialTermStartDate: initialStartDate,
    initialTermEndDate: initialEndDate,
    currentTermStartDate: currentStartDate,
    currentTermEndDate: currentEndDate,
    cancelByDate: currentCancelByDate,
    annualIncrease: contract.annual_increase,
    annualIncreaseMonths: contract.annual_increase_months,
    renewalPeriod: contract.renewal_period,
    subscriptionTerm: contract.subscription_term,
    billingFrequency: contract.billing_frequency,
    renewalType: contract.renewal_type,
    willNotRenew: contract.will_not_renew || false,
    contractStatus: contract.status || 'unknown',
    periods: effectivePeriods,
    totalContractValue,
    annualContractValue,
    totalContractValueUSD,
    annualContractValueUSD,
    fiscalYearStart:
      contract.users?.organizations?.fiscal_year_start_month || 1,
    vendorProductDetails: contract.vendor_products_details || [],
  };
}

// Helper functions
function createEmptyPriceHistory(contract: Contract): PriceHistory {
  return {
    id: contract.id as number,
    vendor: contract.vendors?.name || 'Unknown Vendor',
    vendor_id: contract.vendor_id as number,
    vendorDomain: contract.vendors?.domain,
    currency: contract.currency || 'usd',
    initialTermStartDate: null,
    initialTermEndDate: null,
    currentTermStartDate: null,
    currentTermEndDate: null,
    cancelByDate: null,
    renewalType: contract.renewal_type,
    annualIncrease: contract.annual_increase,
    annualIncreaseMonths: contract.annual_increase_months,
    renewalPeriod: contract.renewal_period,
    subscriptionTerm: contract.subscription_term,
    billingFrequency: contract.billing_frequency,
    willNotRenew: contract.will_not_renew || false,
    contractStatus: contract.status || 'unknown',
    periods: [],
    totalContractValue: 0,
    annualContractValue: 0,
    totalContractValueUSD: 0,
    annualContractValueUSD: 0,
    fiscalYearStart:
      contract.users?.organizations?.fiscal_year_start_month || 1,
    vendorProductDetails: contract.vendor_products_details || [],
  };
}

/**
 * parseISO is strict ISO-8601, so a manually-entered value like "01/31/2022"
 * yields an Invalid Date that survives downstream math and only blows up at
 * format() with "Invalid time value". Recover such dates via the lenient native
 * parser; return null when genuinely unparseable so callers fall back to an
 * empty price history instead of crashing.
 */
function toIsoDateString(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (isValid(parseISO(raw))) return raw;
  const lenient = new Date(raw);
  return isValid(lenient) ? format(lenient, 'yyyy-MM-dd') : null;
}

function extractContractDates(contract: Contract) {
  const sortedStartDates = Array.isArray(contract.term_start_date)
    ? [...contract.term_start_date].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
    : [];
  const sortedEndDates = Array.isArray(contract.term_end_date)
    ? [...contract.term_end_date].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
    : [];
  const sortedCancelByDates = Array.isArray(contract.cancel_date)
    ? [...contract.cancel_date].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
    : [];

  return {
    initialStartDate: toIsoDateString(sortedStartDates[0]?.date),
    initialEndDate: toIsoDateString(sortedEndDates[0]?.date),
    currentStartDate: toIsoDateString(
      sortedStartDates[sortedStartDates.length - 1]?.date,
    ),
    currentEndDate: toIsoDateString(
      sortedEndDates[sortedEndDates.length - 1]?.date,
    ),
    currentCancelByDate: toIsoDateString(
      sortedCancelByDates[sortedCancelByDates.length - 1]?.date,
    ),
  };
}

/**
 * Calculates term length in months for fee amortization.
 *
 * Business context: subscription_term often represents the billing cycle (e.g., 12 months)
 * rather than total contract length (e.g., 36 months for a 3-year deal). When dates and
 * subscription_term disagree, product years (from vendor_products_details.year) are used
 * as a tie-breaker since they reliably indicate the actual contract structure.
 *
 * Fallback precedence:
 * 1. If no endDate: use expectedTermLength or default to 12 months
 * 2. If dates ≠ expectedTermLength and maxProductYear available:
 *    - Product years match calculated years → trust dates
 *    - Product years match expected years → trust expectedTermLength
 * 3. If expectedTermLength within ±1 of calculated: use expectedTermLength (handles rounding)
 * 4. Otherwise: use calculated months from dates
 *
 * The 15-day threshold for rounding up partial months prevents short overlaps (e.g., a 1-day
 * contract spanning two months) from being counted as a full additional month, while ensuring
 * contracts like Sept 8 - Dec 31 (23 remaining days) correctly round to 4 months.
 *
 * Math.round(months/12) for year conversion means 17 months → 1 year, 18 months → 2 years.
 * This aligns with how contracts are typically structured in whole-year increments.
 */
export function getTermLength(
  startDate: string,
  endDate: string | null | undefined,
  expectedTermLength?: number | null,
  maxProductYear?: number | null,
): number {
  if (!endDate) return expectedTermLength || 12;

  const start = parseISO(startDate);
  const adjustedEndDate = addDays(parseISO(endDate), 1);

  const fullMonths = differenceInMonths(adjustedEndDate, start);
  const afterFullMonths = addMonths(start, fullMonths);

  let calculatedMonths = fullMonths;
  if (adjustedEndDate > afterFullMonths) {
    const remainingDays = differenceInDays(adjustedEndDate, afterFullMonths);
    if (remainingDays > 15) {
      calculatedMonths = fullMonths + 1;
    }
  }

  if (
    expectedTermLength &&
    expectedTermLength !== calculatedMonths &&
    maxProductYear
  ) {
    const calcYears = Math.round(calculatedMonths / 12);
    const expectedYears = Math.round(expectedTermLength / 12);

    if (maxProductYear === calcYears) {
      return Math.max(calculatedMonths, 1);
    }
    if (maxProductYear === expectedYears) {
      return Math.max(expectedTermLength, 1);
    }
  }

  if (
    expectedTermLength &&
    Math.abs(expectedTermLength - calculatedMonths) <= 1
  ) {
    return Math.max(expectedTermLength, 1);
  }

  return Math.max(calculatedMonths, 1);
}

function generateInitialTerm(
  contract: Contract,
  dates: { initialStartDate: string; initialEndDate?: string | null },
  isNonStandard: boolean,
  fiscalContext: FiscalContext,
): { periods: PricePeriod[]; lastEndDate: Date } {
  const periods: PricePeriod[] = [];
  const startDate = parseISO(dates.initialStartDate);
  const recordedEndDate = dates.initialEndDate
    ? parseISO(dates.initialEndDate)
    : addDays(addMonths(startDate, contract.subscription_term || 12), -1);

  // Get products by year
  const maxYear = Math.max(
    ...contract.vendor_products_details.map((p) => p.year || 1),
  );

  // When the recorded term genuinely can't fit `maxYear` 12-month buckets
  // (e.g. a 12-month term with year=1 and year=2 product entries), the
  // backwards split below would produce a zero/negative first-year period
  // and double-bucket year=1 and year=2 fees into the same calendar year.
  // In that case treat the year>1 entries as later-cycle fees the author
  // recorded inline, and virtually extend the initial term to maxYear years.
  //
  // Only kicks in when the backwards split would be degenerate — i.e. the
  // first-year slice is <= 0 months. A multi-cycle contract whose recorded
  // term yields a real fractional first-year slice (e.g. 27 months across
  // year=1/2/3 leaves a 3-month first slice) is left alone, since the user
  // already supplied the per-cycle data the calculator needs.
  const recordedTermMonths = differenceInMonths(
    addDays(recordedEndDate, 1),
    startDate,
  );
  const firstYearSliceMonths = recordedTermMonths - (maxYear - 1) * 12;
  const wouldProduceDegenerateFirstYear = firstYearSliceMonths <= 0;
  const endDate =
    maxYear > 1 && wouldProduceDegenerateFirstYear
      ? addDays(addMonths(startDate, maxYear * 12), -1)
      : recordedEndDate;

  // Check if we should create a single multi-year period
  if ((isNonStandard && maxYear === 1) || maxYear === 1) {
    // Single period for entire term
    const period = createPeriod({
      startDate,
      endDate,
      products: contract.vendor_products_details.filter(
        (p) => (p.year || 1) === 1,
      ),
      contract,
      termType: 'initial',
      termIndex: 0,
      yearWithinTerm: 1,
      renewalCount: 0,
      fiscalContext,
    });
    periods.push(period);
  } else {
    // Period for each year of products
    // For abnormal terms, make first period shorter instead of last
    const totalMonths = differenceInMonths(addDays(endDate, 1), startDate);

    // Work backwards from end date for each period to ensure perfect alignment
    let periodEndDates: Date[] = [];
    let currentEnd = endDate;

    // Calculate end dates for each period, working backwards
    for (let i = 0; i < maxYear; i++) {
      periodEndDates.unshift(currentEnd);
      if (i < maxYear - 1) {
        // For each period before the last one, go back exactly 1 year
        // That is, if the current end date is 2025-05-06, the previous end date will be 2024-05-06
        currentEnd = addYears(currentEnd, -1);
      }
    }

    // Create periods using the calculated end dates
    let currentStart = startDate;
    for (let year = 1; year <= maxYear; year++) {
      const periodEnd = periodEndDates[year - 1];

      const period = createPeriod({
        startDate: currentStart,
        endDate: periodEnd,
        products: contract.vendor_products_details.filter(
          (p) => (p.year || 1) === year,
        ),
        contract,
        termType: 'initial',
        termIndex: 0,
        yearWithinTerm: year,
        renewalCount: 0,
        fiscalContext,
      });
      periods.push(period);

      // Set start date for next period
      currentStart = addDays(periodEnd, 1);
    }
  }

  return { periods, lastEndDate: endDate };
}

/**
 * Result type for term generation functions
 */
interface TermGenerationResult {
  periods: PricePeriod[];
  lastEndDate: Date;
  termIndex: number;
  renewalCount: number;
  renewalLength: number;
}

/**
 * Helper: Calculate renewal length for a contract
 */
function calculateRenewalLength(
  contract: Contract,
  initialTermMonths: number,
  isNonStandard: boolean,
): number {
  let renewalLength =
    contract.renewal_period || contract.subscription_term || initialTermMonths;

  if (
    isNonStandard &&
    !contract.renewal_period &&
    !contract.subscription_term
  ) {
    const maxProductYear = Math.max(
      ...contract.vendor_products_details.map((p) => p.year || 1),
    );

    if (maxProductYear > 1) {
      renewalLength = Math.ceil(initialTermMonths / 12) * 12;
    } else {
      renewalLength = initialTermMonths;
    }
  }

  // Log if we computed an invalid renewal length (data integrity issue)
  if (renewalLength <= 0) {
    logger.warn(
      {
        contractId: contract.id,
        renewalPeriod: contract.renewal_period,
        subscriptionTerm: contract.subscription_term,
        initialTermMonths,
        computedRenewalLength: renewalLength,
        isNonStandard,
      },
      'Invalid renewal length computed for contract, defaulting to 12 months',
    );
    return 12; // Default to 12 months (annual renewal) for invalid data
  }

  return renewalLength;
}

/**
 * Helper: Determine if contract should use single period or split into multiple years.
 *
 * When `forceSinglePeriod` is true (used by 'max' mode for renewals/projections),
 * non-12-month terms always get a single period per term. This avoids splitting
 * 27-month terms into 12+12+3 months which creates short trailing periods with
 * full-year fees. This flag is opt-in to avoid disrupting existing 'full'/'minimal'
 * consumers that depend on yearly period splitting.
 *
 * `termLengthMonths` reflects the length the period split would actually use —
 * i.e. `renewal_period || subscription_term || initialTermMonths` — so an
 * 18-month renewal_period contract still gets collapsed to one period under
 * forceSinglePeriod, not split into 12 + 6.
 */
function shouldUseSinglePeriod(
  contract: Contract,
  isNonStandard: boolean,
  maxYear: number,
  termLengthMonths: number,
  forceSinglePeriod: boolean = false,
): boolean {
  if (forceSinglePeriod && termLengthMonths % 12 !== 0) {
    return true;
  }

  return (
    (isNonStandard && maxYear === 1) ||
    (typeof contract.subscription_term === 'number' &&
      contract.subscription_term % 12 !== 0 &&
      maxYear === 1)
  );
}

/**
 * MINIMAL MODE: Calculate and generate ONLY the current renewal term
 * Skips all historical renewals by calculating which term we should be in
 */
function generateCurrentTermOnly(
  contract: Contract,
  initialTermEndDate: Date,
  initialTermMonths: number,
  isNonStandard: boolean,
  fiscalContext: FiscalContext,
  asOf: Date,
): TermGenerationResult {
  const today = fiscalContext.today || asOf;
  const renewalStart = addDays(initialTermEndDate, 1);
  const oneTimeContract = contract.renewal_type === 'One-Time';
  const willNotRenewContract = contract.will_not_renew;

  // Don't generate renewals for one-time contracts
  if (oneTimeContract) {
    return {
      periods: [],
      lastEndDate: initialTermEndDate,
      termIndex: 1,
      renewalCount: 1,
      renewalLength: initialTermMonths,
    };
  }

  // Don't generate renewals for will-not-renew contracts if end date is in the future
  if (willNotRenewContract && isAfter(initialTermEndDate, today)) {
    return {
      periods: [],
      lastEndDate: initialTermEndDate,
      termIndex: 1,
      renewalCount: 1,
      renewalLength: initialTermMonths,
    };
  }

  // Determine renewal length
  const renewalLength = calculateRenewalLength(
    contract,
    initialTermMonths,
    isNonStandard,
  );

  // Guard against invalid renewal length (would cause division by zero)
  if (renewalLength <= 0) {
    logger.error(
      {
        contractId: contract.id,
        renewalLength,
        renewalPeriod: contract.renewal_period,
        subscriptionTerm: contract.subscription_term,
        initialTermMonths,
      },
      'Invalid renewal length in generateCurrentTermOnly, defaulting to 12 months',
    );
    return {
      periods: [],
      lastEndDate: initialTermEndDate,
      termIndex: 1,
      renewalCount: 1,
      renewalLength: 12, // Default to 12 months for safety
    };
  }

  // If we're still in the initial term, return empty periods
  if (!isAfter(today, initialTermEndDate)) {
    return {
      periods: [],
      lastEndDate: initialTermEndDate,
      termIndex: 1,
      renewalCount: 1,
      renewalLength,
    };
  }

  // Calculate how many renewal cycles have elapsed since initial term ended
  const monthsSinceInitialEnd = differenceInMonths(today, renewalStart);

  // Calculate which renewal term we're currently in
  const renewalCyclesPassed = Math.max(
    0,
    Math.floor(monthsSinceInitialEnd / renewalLength),
  );
  const currentRenewalIndex = renewalCyclesPassed + 1; // +1 because first renewal is index 1
  const currentRenewalCount = renewalCyclesPassed + 1;

  // Calculate the current term's start and end dates
  const currentTermStart = addMonths(
    renewalStart,
    renewalCyclesPassed * renewalLength,
  );
  const currentTermEnd = addDays(
    addMonths(currentTermStart, renewalLength),
    -1,
  );

  // Get last year's products for the renewal
  const maxYear = Math.max(
    ...contract.vendor_products_details.map((p) => p.year || 1),
  );
  const lastYearProducts = contract.vendor_products_details.filter(
    (p) => (p.year || 1) === maxYear,
  );

  const periods: PricePeriod[] = [];

  // Create periods for the current term
  // For abnormal terms with only 1 year of products, keep a single period
  if (shouldUseSinglePeriod(contract, isNonStandard, maxYear, renewalLength)) {
    const period = createPeriod({
      startDate: currentTermStart,
      endDate: currentTermEnd,
      products: lastYearProducts,
      contract,
      termType: 'renewal',
      termIndex: currentRenewalIndex,
      yearWithinTerm: 1,
      renewalCount: currentRenewalCount,
      fiscalContext,
    });
    periods.push(period);
  } else {
    // Multi-year term: create periods for each year
    const yearsInTerm = Math.ceil(renewalLength / 12);
    for (let year = 1; year <= yearsInTerm; year++) {
      const yearStart =
        year === 1
          ? currentTermStart
          : addMonths(currentTermStart, (year - 1) * 12);
      const yearEnd =
        year === yearsInTerm
          ? currentTermEnd
          : addDays(addMonths(yearStart, 12), -1);

      const period = createPeriod({
        startDate: yearStart,
        endDate: yearEnd,
        products: lastYearProducts,
        contract,
        termType: 'renewal',
        termIndex: currentRenewalIndex,
        yearWithinTerm: year,
        renewalCount: currentRenewalCount,
        fiscalContext,
      });
      periods.push(period);
    }
  }

  return {
    periods,
    lastEndDate: currentTermEnd,
    termIndex: currentRenewalIndex + 1,
    renewalCount: currentRenewalCount + 1,
    renewalLength,
  };
}

/**
 * Unified function for generating both renewal and projected terms
 */
function generateTerms(
  contract: Contract,
  lastEndDate: Date,
  initialTermMonths: number,
  isNonStandard: boolean,
  options: {
    startTermIndex?: number;
    startRenewalCount?: number;
    maxTerms?: number;
    maxProjections?: number;
    termType: 'renewal' | 'projected';
    fiscalContext: Partial<FiscalContext>;
    forceSinglePeriodRenewals?: boolean;
    asOf: Date;
  },
): TermGenerationResult {
  const {
    startTermIndex = 1,
    startRenewalCount = 1,
    maxTerms = 30,
    maxProjections = 0,
    termType,
    fiscalContext,
    forceSinglePeriodRenewals = false,
    asOf,
  } = options;

  const periods: PricePeriod[] = [];

  const today = asOf;
  const oneTimeContract = contract.renewal_type === 'One-Time';
  const willNotRenewContract = contract.will_not_renew;

  // don't generate renewals or projections for one-time contracts (never renew)
  if (oneTimeContract) {
    return {
      periods: [],
      lastEndDate,
      termIndex: startTermIndex,
      renewalCount: startRenewalCount,
      renewalLength: initialTermMonths,
    };
  }

  // don't generate renewals for will-not-renew contracts if end date is in the future
  if (
    willNotRenewContract &&
    isAfter(lastEndDate, fiscalContext.today || today)
  ) {
    return {
      periods: [],
      lastEndDate,
      termIndex: startTermIndex,
      renewalCount: startRenewalCount,
      renewalLength: initialTermMonths,
    };
  }

  // For inactive contracts: skip projections entirely (no future renewals
  // for archived contracts), but allow historical renewals up to the latest
  // recorded term_end_date so price history shows the years the contract was
  // actually in effect. Without this, a 1-year-renewal contract that ran
  // 2015-2024 would only show its initial term.
  const archivedContractEnd =
    contract.status === 'inactive' && contract.term_end_date?.length
      ? parseISO(
          [...contract.term_end_date].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          )[contract.term_end_date.length - 1].date,
        )
      : null;

  if (contract.status === 'inactive') {
    if (termType === 'projected') {
      return {
        periods: [],
        lastEndDate,
        termIndex: startTermIndex,
        renewalCount: startRenewalCount,
        renewalLength: initialTermMonths,
      };
    }
    if (!archivedContractEnd || !isAfter(archivedContractEnd, lastEndDate)) {
      return {
        periods: [],
        lastEndDate,
        termIndex: startTermIndex,
        renewalCount: startRenewalCount,
        renewalLength: initialTermMonths,
      };
    }
  }

  // Determine renewal length
  const renewalLength = calculateRenewalLength(
    contract,
    initialTermMonths,
    isNonStandard,
  );

  // Guard against invalid renewal length (would cause division by zero)
  if (renewalLength <= 0) {
    logger.error(
      {
        contractId: contract.id,
        renewalLength,
        renewalPeriod: contract.renewal_period,
        subscriptionTerm: contract.subscription_term,
        initialTermMonths,
        isNonStandard,
        lastEndDate: format(lastEndDate, 'yyyy-MM-dd'),
        startTermIndex,
        startRenewalCount,
      },
      'Invalid renewal length in generateTerms, defaulting to 12 months',
    );
    return {
      periods: [],
      lastEndDate,
      termIndex: startTermIndex,
      renewalCount: startRenewalCount,
      renewalLength: 12, // Default to 12 months for safety
    };
  }

  // Get last year's products
  const maxYear = Math.max(
    ...contract.vendor_products_details.map((p) => p.year || 1),
  );
  const lastYearProducts = contract.vendor_products_details.filter(
    (p) => (p.year || 1) === maxYear,
  );

  let currentEndDate = lastEndDate;
  let termIndex = startTermIndex;
  let renewalCount = startRenewalCount;
  let hasCurrentTermBeenAdded = false;
  let projectionCount = 0;

  // Generate terms loop
  while (termIndex < startTermIndex + maxTerms) {
    // For projected terms, stop if we've reached the requested count
    if (termType === 'projected' && projectionCount >= maxProjections) {
      break;
    }

    const termStart = addDays(currentEndDate, 1);
    // Add renewal length to the start date, then subtract 1 day to get proper end date
    const termEnd = addDays(addMonths(termStart, renewalLength), -1);

    // Cap renewal generation at recorded contract end for inactive contracts
    if (archivedContractEnd && termStart > archivedContractEnd) {
      break;
    }

    // For renewals, check if we should stop adding terms
    if (termType === 'renewal') {
      const startsInCurrentFY =
        fiscalContext.currentFiscalYearStart &&
        fiscalContext.nextFiscalYearStart &&
        termStart >= fiscalContext.currentFiscalYearStart &&
        termStart < fiscalContext.nextFiscalYearStart;
      const endsAfterToday = termEnd > today;
      const isCurrentTerm = endsAfterToday;

      // If we've already included a current term or we're past the current term and not in the current FY, stop
      if (
        hasCurrentTermBeenAdded ||
        (termStart > today &&
          fiscalContext.nextFiscalYearStart &&
          !startsInCurrentFY)
      ) {
        break;
      }

      // Mark if this is the current term
      if (isCurrentTerm) {
        hasCurrentTermBeenAdded = true;
      }
    } else {
      // For projected terms, increment the count
      projectionCount++;
    }

    // Create periods
    // If this is a projected term and it's beyond today, ensure termType is 'projected'
    // This ensures that terms that start after today are shown as 'projected' in the UI
    const effectiveTermType =
      termType === 'projected' || termStart > today ? 'projected' : termType;

    // Get products by year for this term, matching the approach in generateInitialTerm
    const maxYear = Math.max(
      ...contract.vendor_products_details.map((p) => p.year || 1),
    );

    // For abnormal terms with only 1 year of products, keep a single period
    // Also create a single period for subscription terms that aren't multiples of 12 months
    if (
      shouldUseSinglePeriod(
        contract,
        isNonStandard,
        maxYear,
        renewalLength,
        forceSinglePeriodRenewals,
      )
    ) {
      const period = createPeriod({
        startDate: termStart,
        endDate: termEnd,
        products: lastYearProducts,
        contract,
        termType: effectiveTermType,
        termIndex,
        yearWithinTerm: 1,
        renewalCount,
        fiscalContext: {
          today: today,
          currentFiscalYearStart:
            fiscalContext.currentFiscalYearStart ||
            new Date(
              today.getFullYear(),
              (fiscalContext.fiscalYearStartMonth || 1) - 1,
              1,
            ),
          nextFiscalYearStart:
            fiscalContext.nextFiscalYearStart ||
            new Date(
              today.getFullYear() + 1,
              (fiscalContext.fiscalYearStartMonth || 1) - 1,
              1,
            ),
          fiscalYearStartMonth: fiscalContext.fiscalYearStartMonth || 1,
        },
      });
      periods.push(period);
    } else {
      const yearsInTerm = Math.ceil(renewalLength / 12);
      for (let year = 1; year <= yearsInTerm; year++) {
        const yearStart =
          year === 1 ? termStart : addMonths(termStart, (year - 1) * 12);
        const yearEnd =
          year === yearsInTerm
            ? termEnd
            : addDays(addMonths(yearStart, 12), -1);

        const period = createPeriod({
          startDate: yearStart,
          endDate: yearEnd,
          products: lastYearProducts,
          contract,
          termType: effectiveTermType,
          termIndex,
          yearWithinTerm: year,
          renewalCount,
          fiscalContext: {
            today: today,
            currentFiscalYearStart:
              fiscalContext.currentFiscalYearStart ||
              new Date(
                today.getFullYear(),
                (fiscalContext.fiscalYearStartMonth || 1) - 1,
                1,
              ),
            nextFiscalYearStart:
              fiscalContext.nextFiscalYearStart ||
              new Date(
                today.getFullYear() + 1,
                (fiscalContext.fiscalYearStartMonth || 1) - 1,
                1,
              ),
            fiscalYearStartMonth: fiscalContext.fiscalYearStartMonth || 1,
          },
        });
        periods.push(period);
      }
    }

    currentEndDate = termEnd;
    termIndex++;
    renewalCount++;
  }

  return {
    periods,
    lastEndDate: currentEndDate,
    termIndex,
    renewalCount,
    renewalLength,
  };
}

/**
 * Calculates the number of annual increases to apply based on contract and term information
 */
function calculateTotalAnnualIncreases(
  contract: Contract,
  termType: 'initial' | 'renewal' | 'projected',
  renewalCount: number,
  yearWithinTerm: number,
): number {
  if (termType === 'initial' && !contract.annual_increase_months) {
    return 0;
  }

  if (contract.annual_increase_months) {
    // Time-based increases: calculate total months elapsed from contract start
    const renewalPeriodMonths =
      contract.renewal_period || contract.subscription_term || 12;

    // Calculate months elapsed from contract start to current period
    let totalMonthsElapsed = 0;

    if (renewalCount >= 1) {
      // We've completed the initial term plus (renewalCount - 1) renewal terms
      const initialTermLength = getTermLength(
        contract.term_start_date?.[0]?.date || '',
        contract.term_end_date?.[0]?.date,
        contract.subscription_term,
        null, // No tie-breaker - trust dates for elapsed time
      );
      totalMonthsElapsed =
        initialTermLength + (renewalCount - 1) * renewalPeriodMonths;
    }

    // Add months for current year within term (if beyond year 1)
    totalMonthsElapsed += (yearWithinTerm - 1) * 12;

    return Math.floor(totalMonthsElapsed / contract.annual_increase_months);
  } else {
    // Renewal-based increases: apply one increase per renewal term
    if (termType === 'renewal' || termType === 'projected') {
      // Start counting increases from the renewal point (first renewal = 1 increase)
      let totalAnnualIncreases = 1;

      // Add increases for complete prior renewal terms. Each renewal advances
      // by the length of a RENEWAL CYCLE, so that is what decides how many
      // yearly increases it earns — psk-623 settled the order as renewal_period
      // first, then subscription_term. The product year-row count is only a
      // last-resort proxy for "how many years is a cycle", and it is wrong
      // whenever the cycle is shorter than the rows imply: a 4%/yr contract
      // with a year-2 row and 12-month renewals escalates 8%/yr without these
      // two branches. They existed in 67402d1a and were dropped by e3f15df2
      // while adding annual_increase_months support.
      if (renewalCount > 1) {
        const maxInitialTermYears =
          contract.vendor_products_details.length > 0
            ? Math.max(
                ...contract.vendor_products_details.map((p) => p.year || 1),
              )
            : 1;

        if (contract.renewal_period) {
          totalAnnualIncreases +=
            (renewalCount - 1) *
            Math.max(1, Math.floor(contract.renewal_period / 12));
        } else if (contract.subscription_term) {
          totalAnnualIncreases +=
            (renewalCount - 1) *
            Math.max(1, Math.floor(contract.subscription_term / 12));
        } else if (maxInitialTermYears > 1) {
          totalAnnualIncreases += (renewalCount - 1) * maxInitialTermYears;
        } else {
          // For single-year products with abnormal terms, normalize by term length
          const initialTermMonths = getTermLength(
            contract.term_start_date?.[0]?.date || '',
            contract.term_end_date?.[0]?.date,
            contract.subscription_term,
            null, // No tie-breaker - trust dates for elapsed time
          );
          if (initialTermMonths > 0 && initialTermMonths !== 12) {
            totalAnnualIncreases += Math.floor(
              ((renewalCount - 1) * initialTermMonths) / 12,
            );
          } else {
            // Standard single-year products
            totalAnnualIncreases += renewalCount - 1;
          }
        }
      }

      // Add increases for years within this term beyond year 1
      if (yearWithinTerm > 1) {
        totalAnnualIncreases += yearWithinTerm - 1;
      }

      return totalAnnualIncreases;
    }
    return 0;
  }
}

/**
 * Calculates product fees with annual increases applied
 */
function calculateProductFees(
  products: Contract['vendor_products_details'],
  contract: Contract,
  renewalCount: number,
  yearWithinTerm: number,
  termType: 'initial' | 'renewal' | 'projected' = 'renewal',
): ProductFee[] {
  // One-time fees book only in the initial term; renewal and projected
  // periods drop them entirely (psk-1492).
  return products
    .filter((product) => !(product.one_time_only && termType !== 'initial'))
    .map((product) => {
      const originalFees = Number(product.fees) || 0;
      const originalFeesUSD = Number(product.convertedFees) || originalFees;
      let fees = originalFees;
      let feesUSD = originalFeesUSD;
      let increasePercentage = 0;

      if (renewalCount > 0 && contract.annual_increase) {
        const totalAnnualIncreases = calculateTotalAnnualIncreases(
          contract,
          termType,
          renewalCount,
          yearWithinTerm,
        );

        if (totalAnnualIncreases > 0) {
          // Apply the full annual_increase rate for each increase period
          fees = calculateCompoundedFee(
            originalFees,
            contract.annual_increase, // Use the full rate, not divided
            totalAnnualIncreases,
          );
          feesUSD = calculateCompoundedFee(
            originalFeesUSD,
            contract.annual_increase, // Use the full rate, not divided
            totalAnnualIncreases,
          );
          increasePercentage = ((fees - originalFees) / originalFees) * 100;
        }
      }

      return {
        productId: product.product_id,
        productName: product.vendor_products?.name || 'Unknown Product',
        fees,
        feesUSD,
        originalFees,
        originalFeesUSD,
        increasePercentage,
      };
    });
}

/**
 * Determines period status based on start date and fiscal context
 */
function determinePeriodStatus(
  startDate: Date,
  fiscalContext: FiscalContext,
): {
  status: 'historical' | 'current' | 'projected';
  isCurrentFiscalYear: boolean;
  isNextFiscalYear: boolean;
} {
  const { today, currentFiscalYearStart, nextFiscalYearStart } = fiscalContext;
  let status: 'historical' | 'current' | 'projected' = 'historical';
  let isCurrentFiscalYear = false;
  let isNextFiscalYear = false;

  // If this is a future date (after today), always mark as projected
  if (isAfter(startDate, today)) {
    status = 'projected';
  } else {
    // Check if period starts in current fiscal year
    isCurrentFiscalYear =
      !isBefore(startDate, currentFiscalYearStart) &&
      isBefore(startDate, nextFiscalYearStart);

    status = isCurrentFiscalYear ? 'current' : 'historical';

    // Check if period starts in next fiscal year
    const nextYearEnd = addMonths(nextFiscalYearStart, 12);
    isNextFiscalYear =
      !isBefore(startDate, nextFiscalYearStart) &&
      isBefore(startDate, nextYearEnd);
  }

  return { status, isCurrentFiscalYear, isNextFiscalYear };
}

function createPeriod(options: {
  startDate: Date;
  endDate: Date;
  products: Contract['vendor_products_details'];
  contract: Contract;
  termType: 'initial' | 'renewal' | 'projected';
  termIndex: number;
  yearWithinTerm: number;
  renewalCount: number;
  fiscalContext: FiscalContext;
}): PricePeriod {
  const {
    startDate,
    endDate,
    products,
    contract,
    termType,
    termIndex,
    yearWithinTerm,
    renewalCount,
    fiscalContext,
  } = options;

  const currency = contract.currency || 'usd';

  const productFees = calculateProductFees(
    products,
    contract,
    renewalCount,
    yearWithinTerm,
    termType,
  );

  const totalFees = productFees.reduce((sum, p) => sum + p.fees, 0);
  const totalFeesUSD = productFees.reduce(
    (sum, p) => sum + (p.feesUSD || 0),
    0,
  );

  // Determine period status using the extracted function
  const { status, isCurrentFiscalYear, isNextFiscalYear } =
    determinePeriodStatus(startDate, fiscalContext);

  return {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
    fees: totalFees,
    feesUSD: totalFeesUSD,
    productFees,
    termType,
    termIndex,
    yearWithinTerm,
    isCurrentTerm: false, // Set later
    isActivePeriod: false, // Set later
    isCurrentFiscalYear,
    isNextFiscalYear,
    status,
    isRenewalPoint: yearWithinTerm === 1,
    renewalCount,
  };
}

function calculateContractValues(
  currentTermPeriods: PricePeriod[],
  asOf: Date,
): {
  totalContractValue: number;
  annualContractValue: number;
  totalContractValueUSD: number;
  annualContractValueUSD: number;
} {
  if (currentTermPeriods.length === 0) {
    return {
      totalContractValue: 0,
      annualContractValue: 0,
      totalContractValueUSD: 0,
      annualContractValueUSD: 0,
    };
  }

  const totalContractValue = currentTermPeriods.reduce(
    (sum, p) => sum + p.fees,
    0,
  );

  const totalContractValueUSD = currentTermPeriods.reduce(
    (sum, p) => sum + (p.feesUSD || p.fees),
    0,
  );

  // Annual Contract Value should be the fees for the current period within the term
  // For multi-year contracts, we need to find which period is active now
  const today = asOf;

  // First look for a period that contains today's date
  let activeYearPeriod = currentTermPeriods.find((p) => {
    const startDate = parseISO(p.startDate);
    const endDate = parseISO(p.endDate);
    return startDate <= today && endDate >= today;
  });

  // If no period contains today, use the one that starts next
  if (!activeYearPeriod) {
    const futurePeriods = currentTermPeriods
      .filter((p) => parseISO(p.startDate) > today)
      .sort(
        (a, b) =>
          parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime(),
      );

    activeYearPeriod = futurePeriods[0];
  }

  // If we still don't have an active period, default to year 1
  if (!activeYearPeriod) {
    activeYearPeriod = currentTermPeriods.find((p) => p.yearWithinTerm === 1);
  }

  const annualContractValue = activeYearPeriod ? activeYearPeriod.fees : 0;
  const annualContractValueUSD = activeYearPeriod
    ? activeYearPeriod.feesUSD || activeYearPeriod.fees
    : 0;

  return {
    totalContractValue,
    annualContractValue,
    totalContractValueUSD,
    annualContractValueUSD,
  };
}
