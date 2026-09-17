import {
  addDays,
  addMonths,
  addYears,
  getYear,
  differenceInMonths,
  parseISO,
  isAfter,
  isBefore,
  format,
} from 'npm:date-fns@^3.6.0';

type TermType = 'initial' | 'renewal' | 'projected';
type PeriodStatus = 'historical' | 'current' | 'projected';

type ProductFee = {
  productId: string | number;
  productName: string;
  fees: number;
  feesUSD: number;
  originalFees: number;
  originalFeesUSD: number;
  increasePercentage: number;
};

interface PricePeriod {
  startDate: string;
  endDate: string;
  fees: number;
  feesUSD: number;
  productFees: ProductFee[];
  termType: TermType;
  termIndex: number;
  yearWithinTerm: number;
  isCurrentTerm: boolean;
  isActivePeriod: boolean;
  isNextFiscalYear: boolean;
  status: PeriodStatus;
  renewalCount: number;
}

interface ProductDetail {
  product_id: string;
  year?: number;
  fees?: number;
  convertedFees?: number;
  vendor_products?: { name: string; id: string };
}

interface PriceHistory {
  currency: string;
  periods: PricePeriod[];
  vendorProductDetails: ProductDetail[];
  totalContractValue: number;
  annualContractValue: number;
  totalContractValueUSD: number;
  annualContractValueUSD: number;
}

interface FiscalYearInfo {
  currentFiscalYear: number;
  currentFiscalYearStart: Date;
  nextFiscalYearStart: Date;
}

type FiscalContext = {
  today: Date;
  currentFiscalYearStart: Date;
  nextFiscalYearStart: Date;
  fiscalYearStartMonth: number;
};

// Get fiscal year info based on start month
function getFiscalYearInfo(fiscalYearStartMonth: number = 1): FiscalYearInfo {
  const currentDate = new Date();
  let currentFiscalYearStart = new Date(
    currentDate.getFullYear(),
    fiscalYearStartMonth - 1,
    1,
  );

  if (currentDate < currentFiscalYearStart) {
    currentFiscalYearStart = new Date(
      currentDate.getFullYear() - 1,
      fiscalYearStartMonth - 1,
      1,
    );
  }

  const nextFiscalYearStart = addYears(currentFiscalYearStart, 1);
  const currentFiscalYear = getYear(currentFiscalYearStart);

  return { currentFiscalYear, currentFiscalYearStart, nextFiscalYearStart };
}

// Generate price history for a contract
function generatePriceHistory(
  contract: any,
  fiscalYearStartMonth: number = 1,
  mode: 'full' | 'minimal' = 'full',
): PriceHistory {
  if (
    !contract.vendor_products_details?.length ||
    !contract.term_start_date?.length
  ) {
    return {
      currency: contract.currency || 'usd',
      periods: [],
      vendorProductDetails: contract.vendor_products_details || [],
      totalContractValue: 0,
      annualContractValue: 0,
      totalContractValueUSD: 0,
      annualContractValueUSD: 0,
    };
  }

  const { initialStartDate, initialEndDate, currentStartDate } =
    extractContractDates(contract);
  if (!initialStartDate) {
    return {
      currency: contract.currency || 'usd',
      periods: [],
      vendorProductDetails: contract.vendor_products_details || [],
      totalContractValue: 0,
      annualContractValue: 0,
      totalContractValueUSD: 0,
      annualContractValueUSD: 0,
    };
  }

  const { currentFiscalYearStart, nextFiscalYearStart } =
    getFiscalYearInfo(fiscalYearStartMonth);
  const fiscalContext: FiscalContext = {
    today: new Date(),
    currentFiscalYearStart,
    nextFiscalYearStart,
    fiscalYearStartMonth,
  };

  const initialTermMonths = getTermLength(initialStartDate, initialEndDate);
  const isNonStandard =
    !contract.renewal_period &&
    !contract.subscription_term &&
    initialTermMonths % 12 !== 0;

  const periods: PricePeriod[] = [];

  // Initial term
  const initialResult = generateInitialTerm(
    contract,
    { initialStartDate, initialEndDate },
    isNonStandard,
    fiscalContext,
  );
  periods.push(...initialResult.periods);

  // Renewals up to/including current term
  const renewalResult = generateTerms(
    contract,
    initialResult.lastEndDate,
    initialTermMonths,
    isNonStandard,
    {
      termType: 'renewal',
      fiscalContext,
    },
  );
  periods.push(...renewalResult.periods);

  // Generate projected terms
  if (mode === 'full') {
    // FULL MODE: Generate full projections
    const hasProjected = renewalResult.periods.some(
      (p) =>
        p.status === 'projected' ||
        (parseISO(p.startDate) > fiscalContext.today && !p.isCurrentTerm),
    );
    const projectedNeeded = hasProjected ? 2 : 3;
    if (projectedNeeded > 0) {
      const projected = generateTerms(
        contract,
        renewalResult.lastEndDate,
        renewalResult.renewalLength,
        isNonStandard,
        {
          startTermIndex: renewalResult.termIndex,
          startRenewalCount: renewalResult.renewalCount,
          maxProjections: projectedNeeded,
          termType: 'projected',
          fiscalContext: {
            ...fiscalContext,
            currentFiscalYearStart: undefined as any,
            nextFiscalYearStart: undefined as any,
          },
        },
      );
      periods.push(...projected.periods);
    }
  } else {
    // MINIMAL MODE: Only 2 projected periods
    const projected = generateTerms(
      contract,
      renewalResult.lastEndDate,
      renewalResult.renewalLength,
      isNonStandard,
      {
        startTermIndex: renewalResult.termIndex,
        startRenewalCount: renewalResult.renewalCount,
        maxProjections: 2,
        termType: 'projected',
        fiscalContext: {
          ...fiscalContext,
          currentFiscalYearStart: undefined as any,
          nextFiscalYearStart: undefined as any,
        },
      },
    );
    periods.push(...projected.periods);
  }

  // Mark current term + active period for ACV/current budget
  markCurrentTerm(
    periods,
    fiscalContext.today,
    fiscalContext.nextFiscalYearStart,
    currentStartDate,
  );
  markActivePeriod(periods, fiscalContext.today, currentStartDate);

  // Values for *current term* (TCV & ACV)
  const currentTermPeriods = periods.filter((p) => p.isCurrentTerm);
  const {
    totalContractValue,
    annualContractValue,
    totalContractValueUSD,
    annualContractValueUSD,
  } = calculateContractValues(currentTermPeriods);

  return {
    currency: contract.currency || 'usd',
    periods,
    vendorProductDetails: contract.vendor_products_details || [],
    totalContractValue,
    annualContractValue,
    totalContractValueUSD,
    annualContractValueUSD,
  };
}

// Current term marking (kept logic)
function markCurrentTerm(
  periods: PricePeriod[],
  today: Date = new Date(),
  nextFiscalYearStart: Date = new Date(),
  currentStartDate?: string,
): void {
  if (!periods.length) return;

  const termGroups = new Map<number, PricePeriod[]>();
  periods.forEach((p) => {
    if (!termGroups.has(p.termIndex)) termGroups.set(p.termIndex, []);
    termGroups.get(p.termIndex)!.push(p);
  });

  periods.forEach((p) => (p.isCurrentTerm = false));
  const sortedTerms = Array.from(termGroups.entries()).sort(
    ([a], [b]) => a - b,
  );

  if (currentStartDate) {
    const key = format(parseISO(currentStartDate), 'yyyy-MM-dd');
    for (const [, term] of sortedTerms) {
      if (term[0].startDate === key) {
        term.forEach((p) => (p.isCurrentTerm = true));
        return;
      }
    }
  }

  for (const [, term] of sortedTerms) {
    const active = findActivePeriodByDate(term, today);
    if (active) {
      term.forEach((p) => (p.isCurrentTerm = true));
      return;
    }
  }

  const sortedByStart = [...sortedTerms].sort(
    ([, A], [, B]) =>
      parseISO(A[0].startDate).getTime() - parseISO(B[0].startDate).getTime(),
  );
  for (const [, term] of sortedByStart) {
    const termStart = parseISO(term[0].startDate);
    if (
      isAfter(termStart, today) &&
      (!nextFiscalYearStart || isBefore(termStart, nextFiscalYearStart))
    ) {
      term.forEach((p) => (p.isCurrentTerm = true));
      return;
    }
  }
}

function findActivePeriodByDate(
  periods: PricePeriod[],
  ref: Date = new Date(),
): PricePeriod | undefined {
  if (!periods.length) return undefined;
  const inRange = periods.find(
    (p) => parseISO(p.startDate) <= ref && parseISO(p.endDate) >= ref,
  );
  if (inRange) return inRange;

  const future = periods
    .filter((p) => parseISO(p.startDate) > ref)
    .sort(
      (a, b) =>
        parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime(),
    );
  return future[0];
}

function markActivePeriod(
  periods: PricePeriod[],
  today: Date = new Date(),
  currentStartDate?: string,
): void {
  if (!periods.length) return;

  periods.forEach((p) => (p.isActivePeriod = false));

  const active = periods.find(
    (p) => parseISO(p.startDate) <= today && today <= parseISO(p.endDate),
  );
  if (active) {
    active.isActivePeriod = true;
    return;
  }

  if (currentStartDate) {
    const key = format(parseISO(currentStartDate), 'yyyy-MM-dd');
    const first = periods.find((p) => p.startDate === key);
    if (first) {
      first.isActivePeriod = true;
      return;
    }
  }

  const current = periods.filter((p) => p.isCurrentTerm);
  if (current.length) {
    const minYear = current.reduce(
      (m, p) => (p.yearWithinTerm < m ? p.yearWithinTerm : m),
      Number.MAX_SAFE_INTEGER,
    );
    const first = current.find((p) => p.yearWithinTerm === minYear);
    if (first) first.isActivePeriod = true;
  }
}

// Calculate TCV and ACV for current term periods
function calculateContractValues(currentTermPeriods: PricePeriod[]) {
  if (!currentTermPeriods.length) {
    return {
      totalContractValue: 0,
      annualContractValue: 0,
      totalContractValueUSD: 0,
      annualContractValueUSD: 0,
    };
  }

  const totalContractValue = currentTermPeriods.reduce((s, p) => s + p.fees, 0);
  const totalContractValueUSD = currentTermPeriods.reduce(
    (s, p) => s + (p.feesUSD || p.fees),
    0,
  );

  const today = new Date();
  let active = currentTermPeriods.find(
    (p) => parseISO(p.startDate) <= today && today <= parseISO(p.endDate),
  );
  if (!active) {
    const future = currentTermPeriods
      .filter((p) => parseISO(p.startDate) > today)
      .sort(
        (a, b) =>
          parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime(),
      );
    active = future[0];
  }
  if (!active) active = currentTermPeriods.find((p) => p.yearWithinTerm === 1);

  const annualContractValue = active ? active.fees : 0;
  const annualContractValueUSD = active ? active.feesUSD || active.fees : 0;

  return {
    totalContractValue,
    annualContractValue,
    totalContractValueUSD,
    annualContractValueUSD,
  };
}

// Extract contract dates
function extractContractDates(contract: any) {
  const sortedStart = [...contract.term_start_date!].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const sortedEnd = contract.term_end_date
    ? [...contract.term_end_date].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
    : [];
  const sortedCancel = contract.cancel_date
    ? [...contract.cancel_date].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
    : [];
  return {
    initialStartDate: sortedStart[0]?.date,
    initialEndDate: sortedEnd[0]?.date,
    currentStartDate: sortedStart[sortedStart.length - 1]?.date,
    currentEndDate: sortedEnd[sortedEnd.length - 1]?.date,
    currentCancelByDate: sortedCancel[sortedCancel.length - 1]?.date,
  };
}

function getTermLength(startDate: string, endDate?: string | null): number {
  if (!endDate) return 12;
  const adjustedEnd = addDays(parseISO(endDate), 1);
  return differenceInMonths(adjustedEnd, parseISO(startDate));
}

function generateInitialTerm(
  contract: any,
  dates: { initialStartDate: string; initialEndDate?: string },
  isNonStandard: boolean,
  fiscalContext: FiscalContext,
) {
  const periods: PricePeriod[] = [];
  const startDate = parseISO(dates.initialStartDate);
  const endDate = dates.initialEndDate
    ? parseISO(dates.initialEndDate)
    : addDays(addMonths(startDate, 12), -1);

  const maxYear = Math.max(
    ...contract.vendor_products_details.map((p: any) => p.year || 1),
  );

  if ((isNonStandard && maxYear === 1) || maxYear === 1) {
    periods.push(
      createPeriod({
        startDate,
        endDate,
        products: contract.vendor_products_details.filter(
          (p: any) => (p.year || 1) === 1,
        ),
        contract,
        termType: 'initial',
        termIndex: 0,
        yearWithinTerm: 1,
        renewalCount: 0,
        fiscalContext,
      }),
    );
  } else {
    // Work backwards to align end dates perfectly
    let currentEnd = endDate;
    const endDates: Date[] = [];
    for (let i = 0; i < maxYear; i++) {
      endDates.unshift(currentEnd);
      if (i < maxYear - 1) currentEnd = addYears(currentEnd, -1);
    }

    let currentStart = startDate;
    for (let year = 1; year <= maxYear; year++) {
      const periodEnd = endDates[year - 1];
      periods.push(
        createPeriod({
          startDate: currentStart,
          endDate: periodEnd,
          products: contract.vendor_products_details.filter(
            (p: any) => (p.year || 1) === year,
          ),
          contract,
          termType: 'initial',
          termIndex: 0,
          yearWithinTerm: year,
          renewalCount: 0,
          fiscalContext,
        }),
      );
      currentStart = addDays(periodEnd, 1);
    }
  }

  return { periods, lastEndDate: endDate };
}

function generateTerms(
  contract: any,
  lastEndDate: Date,
  initialTermMonths: number,
  isNonStandard: boolean,
  options: {
    startTermIndex?: number;
    startRenewalCount?: number;
    maxTerms?: number;
    maxProjections?: number;
    termType: TermType;
    fiscalContext: Partial<FiscalContext>;
  },
) {
  const {
    startTermIndex = 1,
    startRenewalCount = 1,
    maxTerms = 30,
    maxProjections = 0,
    termType,
    fiscalContext,
  } = options;

  const periods: PricePeriod[] = [];
  const today = new Date();
  const oneTime = contract.renewal_type === 'One-Time';
  const willNotRenew = contract.will_not_renew;

  if (oneTime) {
    return {
      periods: [],
      lastEndDate,
      termIndex: startTermIndex,
      renewalCount: startRenewalCount,
      renewalLength: initialTermMonths,
    };
  }
  if (willNotRenew && isAfter(lastEndDate, fiscalContext.today || today)) {
    return {
      periods: [],
      lastEndDate,
      termIndex: startTermIndex,
      renewalCount: startRenewalCount,
      renewalLength: initialTermMonths,
    };
  }
  if (
    contract.status === 'inactive' &&
    !isAfter(lastEndDate, fiscalContext.today || today)
  ) {
    return {
      periods: [],
      lastEndDate,
      termIndex: startTermIndex,
      renewalCount: startRenewalCount,
      renewalLength: initialTermMonths,
    };
  }

  let renewalLength =
    contract.renewal_period || contract.subscription_term || initialTermMonths;

  if (
    isNonStandard &&
    !contract.renewal_period &&
    !contract.subscription_term
  ) {
    const maxProductYear = Math.max(
      ...contract.vendor_products_details.map((p: any) => p.year || 1),
    );
    renewalLength =
      maxProductYear > 1
        ? Math.ceil(initialTermMonths / 12) * 12
        : initialTermMonths;
  }

  const maxYear = Math.max(
    ...contract.vendor_products_details.map((p: any) => p.year || 1),
  );
  const lastYearProducts = contract.vendor_products_details.filter(
    (p: any) => (p.year || 1) === maxYear,
  );

  let currentEndDate = lastEndDate;
  let termIndex = startTermIndex;
  let renewalCount = startRenewalCount;
  let addedCurrent = false;
  let projectionCount = 0;

  while (termIndex < startTermIndex + maxTerms) {
    if (termType === 'projected' && projectionCount >= maxProjections) break;

    const termStart = addDays(currentEndDate, 1);
    const termEnd = addDays(addMonths(termStart, renewalLength), -1);

    if (termType === 'renewal') {
      const startsInCurrentFY =
        fiscalContext.currentFiscalYearStart &&
        fiscalContext.nextFiscalYearStart &&
        termStart >= fiscalContext.currentFiscalYearStart &&
        termStart < fiscalContext.nextFiscalYearStart;

      const endsAfterToday = termEnd > (fiscalContext.today || new Date());

      if (
        addedCurrent ||
        (termStart > (fiscalContext.today || new Date()) &&
          fiscalContext.nextFiscalYearStart &&
          !startsInCurrentFY)
      ) {
        break;
      }
      if (endsAfterToday) addedCurrent = true;
    } else {
      projectionCount++;
    }

    const effectiveType: TermType =
      termType === 'projected' ||
      termStart > (fiscalContext.today || new Date())
        ? 'projected'
        : termType;

    if (
      (isNonStandard && maxYear === 1) ||
      (contract.subscription_term &&
        contract.subscription_term % 12 !== 0 &&
        maxYear === 1)
    ) {
      periods.push(
        createPeriod({
          startDate: termStart,
          endDate: termEnd,
          products: lastYearProducts,
          contract,
          termType: effectiveType,
          termIndex,
          yearWithinTerm: 1,
          renewalCount,
          fiscalContext: fillFiscalDefaults(fiscalContext),
        }),
      );
    } else {
      const yearsInTerm = Math.ceil(renewalLength / 12);
      for (let year = 1; year <= yearsInTerm; year++) {
        const yearStart =
          year === 1 ? termStart : addMonths(termStart, (year - 1) * 12);
        const yearEnd =
          year === yearsInTerm
            ? termEnd
            : addDays(addMonths(yearStart, 12), -1);
        periods.push(
          createPeriod({
            startDate: yearStart,
            endDate: yearEnd,
            products: lastYearProducts,
            contract,
            termType: effectiveType,
            termIndex,
            yearWithinTerm: year,
            renewalCount,
            fiscalContext: fillFiscalDefaults(fiscalContext),
          }),
        );
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

function fillFiscalDefaults(fc: Partial<FiscalContext>): FiscalContext {
  const now = new Date();
  const month = (fc.fiscalYearStartMonth || 1) - 1;
  const start =
    fc.currentFiscalYearStart || new Date(now.getFullYear(), month, 1);
  return {
    today: fc.today || now,
    currentFiscalYearStart: start,
    nextFiscalYearStart: fc.nextFiscalYearStart || addYears(start, 1),
    fiscalYearStartMonth: fc.fiscalYearStartMonth || 1,
  };
}

function calculateTotalAnnualIncreases(
  contract: any,
  termType: TermType,
  renewalCount: number,
  yearWithinTerm: number,
): number {
  if (termType === 'initial' && !contract.annual_increase_months) return 0;

  if (contract.annual_increase_months) {
    const renewalMonths =
      contract.renewal_period || contract.subscription_term || 12;
    let totalMonths = 0;

    if (renewalCount >= 1) {
      const initialLen = getTermLength(
        contract.term_start_date?.[0]?.date || '',
        contract.term_end_date?.[0]?.date,
      );
      totalMonths = initialLen + (renewalCount - 1) * renewalMonths;
    }
    totalMonths += (yearWithinTerm - 1) * 12;
    return Math.floor(totalMonths / contract.annual_increase_months);
  } else {
    if (termType === 'renewal' || termType === 'projected') {
      let increases = 1;
      if (renewalCount > 1) {
        const maxYears = Math.max(
          ...contract.vendor_products_details.map((p: any) => p.year || 1),
        );
        if (maxYears > 1) {
          increases += (renewalCount - 1) * maxYears;
        } else {
          const initialMonths = getTermLength(
            contract.term_start_date?.[0]?.date || '',
            contract.term_end_date?.[0]?.date,
          );
          increases +=
            initialMonths > 0 && initialMonths !== 12
              ? Math.floor(((renewalCount - 1) * initialMonths) / 12)
              : renewalCount - 1;
        }
      }
      if (yearWithinTerm > 1) increases += yearWithinTerm - 1;
      return increases;
    }
    return 0;
  }
}

function calculateProductFees(
  products: any[],
  contract: any,
  renewalCount: number,
  yearWithinTerm: number,
  termType: TermType = 'renewal',
): ProductFee[] {
  // One-time fees book only in the initial term; renewal and projected
  // periods drop them entirely (psk-1492).
  return products
    .filter(
      (product: any) => !(product.one_time_only && termType !== 'initial'),
    )
    .map((product: any) => {
      const originalFees = Number(product.fees) || 0;
      const originalFeesUSD = Number(product.convertedFees) || originalFees;
      let fees = originalFees;
      let feesUSD = originalFeesUSD;
      let increasePercentage = 0;

      if (renewalCount > 0 && contract.annual_increase) {
        const n = calculateTotalAnnualIncreases(
          contract,
          termType,
          renewalCount,
          yearWithinTerm,
        );
        if (n > 0) {
          fees = calculateCompoundedFee(
            originalFees,
            contract.annual_increase,
            n,
          );
          feesUSD = calculateCompoundedFee(
            originalFeesUSD,
            contract.annual_increase,
            n,
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

function determinePeriodStatus(startDate: Date, fiscalContext: FiscalContext) {
  const { today, currentFiscalYearStart, nextFiscalYearStart } = fiscalContext;
  let status: PeriodStatus = 'historical';
  let isNextFiscalYear = false;

  if (isAfter(startDate, today)) {
    status = 'projected';
  } else {
    const inCurrentFY =
      !isBefore(startDate, currentFiscalYearStart) &&
      isBefore(startDate, nextFiscalYearStart);
    status = inCurrentFY ? 'current' : 'historical';
    const nextYearEnd = addMonths(nextFiscalYearStart, 12);
    isNextFiscalYear =
      !isBefore(startDate, nextFiscalYearStart) &&
      isBefore(startDate, nextYearEnd);
  }

  return { status, isNextFiscalYear };
}

function createPeriod(options: {
  startDate: Date;
  endDate: Date;
  products: any[];
  contract: any;
  termType: TermType;
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

  const productFees = calculateProductFees(
    products,
    contract,
    renewalCount,
    yearWithinTerm,
    termType,
  );
  const fees = productFees.reduce((s, p) => s + p.fees, 0);
  const feesUSD = productFees.reduce((s, p) => s + (p.feesUSD || 0), 0);
  const { status, isNextFiscalYear } = determinePeriodStatus(
    startDate,
    fiscalContext,
  );

  return {
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
    fees,
    feesUSD,
    productFees,
    termType,
    termIndex,
    yearWithinTerm,
    isCurrentTerm: false,
    isActivePeriod: false,
    isNextFiscalYear,
    status,
    renewalCount,
  };
}

function calculateCompoundedFee(
  baseFee: number,
  annualIncrease: number | undefined,
  n: number,
): number {
  if (!annualIncrease || n <= 0) return baseFee;
  const factor =
    annualIncrease < 100 ? 1 + annualIncrease / 100 : annualIncrease / 100;
  return baseFee * Math.pow(factor, n);
}

// Budget extraction
function getDefaultProductBudget(vendorProductDetails: ProductDetail[] = []) {
  const current = vendorProductDetails.reduce(
    (s, p) => s + (Number(p.fees) || 0),
    0,
  );
  const currentUSD = vendorProductDetails.reduce(
    (s, p) => s + (Number(p.convertedFees) || Number(p.fees) || 0),
    0,
  );
  return {
    current,
    currentUSD,
    projected: 0,
    projectedUSD: 0,
    annualDifference: 0,
  };
}

function extractBudgetFromPriceHistory(priceHistory: PriceHistory) {
  if (!priceHistory.periods.length) {
    return getDefaultProductBudget(priceHistory.vendorProductDetails);
  }

  const currentTerm = priceHistory.periods.filter((p) => p.isCurrentTerm);
  if (!currentTerm.length) {
    return getDefaultProductBudget(priceHistory.vendorProductDetails);
  }

  const active = priceHistory.periods.find((p) => p.isActivePeriod);
  const nextInTerm =
    active &&
    priceHistory.periods.find(
      (p) =>
        p.termIndex === active.termIndex &&
        p.yearWithinTerm === active.yearWithinTerm + 1,
    );
  const nextRenewal =
    active &&
    priceHistory.periods.find((p) => p.termIndex === active.termIndex + 1);

  const nextPeriod = nextInTerm || nextRenewal;

  const current = active ? active.fees : 0;
  const currentUSD = active ? active.feesUSD : 0;
  const projected = nextPeriod ? nextPeriod.fees : 0;
  const projectedUSD = nextPeriod ? nextPeriod.feesUSD : 0;

  const annualDifference =
    currentUSD > 0 && projectedUSD > 0
      ? Math.round(((projectedUSD - currentUSD) / currentUSD) * 1000) / 10
      : current > 0 && projected > 0
        ? Math.round(((projected - current) / current) * 1000) / 10
        : 0;

  return { current, currentUSD, projected, projectedUSD, annualDifference };
}

export function getBudgetsForEmail(
  contract: any,
  fiscalYearStartMonth: number = 1,
) {
  const priceHistory = generatePriceHistory(
    contract,
    fiscalYearStartMonth,
    'minimal',
  );

  // TCV (current term) & USD
  const totalContractValue = priceHistory.totalContractValue || 0;
  const convertedTotalContractValue = priceHistory.totalContractValueUSD || 0;

  // Current / Projected budgets (and USD)
  const { current, currentUSD, projected, projectedUSD, annualDifference } =
    extractBudgetFromPriceHistory(priceHistory);

  // Annual cost == current period cost (and USD)
  const convertedAnnualCost = priceHistory.annualContractValueUSD;
  const convertedCurrentBudget = priceHistory.annualContractValueUSD;

  // Projected budget in USD: prefer next FY sum, else first projected period
  let convertedProjectedBudget = 0;
  const nextFY = priceHistory.periods.filter((p) => p.isNextFiscalYear);
  if (nextFY.length) {
    convertedProjectedBudget = nextFY.reduce(
      (s, p) => s + (p.feesUSD || p.fees),
      0,
    );
  } else {
    const projectedPeriods = priceHistory.periods.filter(
      (p) => p.termType === 'projected' && !p.isCurrentTerm,
    );
    if (projectedPeriods.length)
      convertedProjectedBudget =
        projectedPeriods[0].feesUSD || projectedPeriods[0].fees;
  }

  const originalCurrency = contract.currency
    ? String(contract.currency).toUpperCase()
    : 'USD';

  return {
    totalContractValue,
    convertedTotalContractValue,
    currentBudget: current,
    projectedBudget: projected,
    convertedCurrentBudget,
    convertedProjectedBudget,
    annualDifference,
    originalCurrency,
    annualCost: current,
    convertedAnnualCost,
  };
}
