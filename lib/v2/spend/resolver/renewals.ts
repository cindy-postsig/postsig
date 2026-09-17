import {
  parseISO,
  addMonths,
  addDays,
  isAfter,
  isValid,
  format,
  startOfDay,
} from 'date-fns';
import type { SpendContractInput } from '../contractInput';
import { readTermDateEntries } from '../contractInput';
import { calculateCompoundedFee } from '@/app/lib/budget/feeCalculator';
import type { FeeSegment } from '../types';
import { inferred, INFERENCE_REASONS } from './shapes';
import { getTermLength } from './termLength';
import { productFee, type FeeReadMode } from './initialTerm';
import { isInvoiceType } from '@/app/lib/constants';
import logger from '@/utils/pino';

// Runaway guard on the projection loop, not a modelling decision: nothing about
// the data says a contract stops renewing after this many cycles.
const MAX_PROJECTED_RENEWALS = 200;

interface ProductRow {
  product_id: number;
  year?: number;
  fees?: number;
  convertedFees?: number;
  one_time_only?: boolean;
}

interface RenewalLengthResult {
  length: number;
  defaulted: boolean;
}

function latestRecordedTermEnd(contract: SpendContractInput): Date | null {
  const dates = readTermDateEntries(contract.term_end_date)
    .map((d) => parseISO(d.date ?? ''))
    .filter(isValid);
  if (dates.length === 0) return null;
  return dates.reduce((latest, d) => (isAfter(d, latest) ? d : latest));
}

// Ported from priceHistoryCalculator.calculateRenewalLength.
function calculateRenewalLength(
  contract: SpendContractInput,
  initialTermMonths: number,
  isNonStandard: boolean,
  maxYear: number,
): RenewalLengthResult {
  let length =
    contract.renewal_period || contract.subscription_term || initialTermMonths;

  if (
    isNonStandard &&
    !contract.renewal_period &&
    !contract.subscription_term
  ) {
    length =
      maxYear > 1 ? Math.ceil(initialTermMonths / 12) * 12 : initialTermMonths;
  }

  if (length <= 0) {
    return { length: 12, defaulted: true };
  }
  return { length, defaulted: false };
}

// Ported from priceHistoryCalculator.calculateTotalAnnualIncreases. Renewal
// projections carry the final-year fee forward with annual_increase compounded
// on top: one increase at the first renewal, plus one per prior renewal term
// and per year-within-term beyond year 1.
function totalAnnualIncreases(
  contract: SpendContractInput,
  renewalCount: number,
  yearWithinTerm: number,
): number {
  if (contract.annual_increase_months) {
    const renewalPeriodMonths =
      contract.renewal_period || contract.subscription_term || 12;
    let totalMonthsElapsed = 0;
    if (renewalCount >= 1) {
      const initialTermLength = getTermLength(
        contract.term_start_date?.[0]?.date || '',
        contract.term_end_date?.[0]?.date,
        contract.subscription_term,
        null,
      );
      totalMonthsElapsed =
        initialTermLength + (renewalCount - 1) * renewalPeriodMonths;
    }
    totalMonthsElapsed += (yearWithinTerm - 1) * 12;
    return Math.floor(totalMonthsElapsed / contract.annual_increase_months);
  }

  let increases = 1;
  if (renewalCount > 1) {
    const maxInitialTermYears =
      contract.vendor_products_details.length > 0
        ? Math.max(...contract.vendor_products_details.map((p) => p.year || 1))
        : 1;
    // A renewal earns increases per its CYCLE length — renewal_period first,
    // then subscription_term (the psk-623 order, restored to legacy by
    // PR #2039). The row count is only a last-resort proxy and overstates
    // whenever the cycle is shorter than the rows imply.
    if (contract.renewal_period) {
      increases +=
        (renewalCount - 1) *
        Math.max(1, Math.floor(contract.renewal_period / 12));
    } else if (contract.subscription_term) {
      increases +=
        (renewalCount - 1) *
        Math.max(1, Math.floor(contract.subscription_term / 12));
    } else if (maxInitialTermYears > 1) {
      increases += (renewalCount - 1) * maxInitialTermYears;
    } else {
      const initialTermMonths = getTermLength(
        contract.term_start_date?.[0]?.date || '',
        contract.term_end_date?.[0]?.date,
        contract.subscription_term,
        null,
      );
      if (initialTermMonths > 0 && initialTermMonths !== 12) {
        increases += Math.floor(((renewalCount - 1) * initialTermMonths) / 12);
      } else {
        increases += renewalCount - 1;
      }
    }
  }
  if (yearWithinTerm > 1) {
    increases += yearWithinTerm - 1;
  }
  return increases;
}

function projectedFee(
  product: ProductRow,
  contract: SpendContractInput,
  renewalCount: number,
  yearWithinTerm: number,
  feeMode: FeeReadMode,
): number {
  const base = productFee(product, feeMode);
  if (!contract.annual_increase) return base;
  const increases = totalAnnualIncreases(
    contract,
    renewalCount,
    yearWithinTerm,
  );
  return increases > 0
    ? calculateCompoundedFee(base, contract.annual_increase, increases)
    : base;
}

export interface RenewalResult {
  segments: FeeSegment[];
  renewalLengthDefaulted: boolean;
}

// PR #1594 "year-as-renewal-hint": when the recorded term did not cover every
// product-year row, the extra rows (year committedYears+1 .. maxYear) are not a
// committed multi-year term — they are projected renewal fees. Each seeds one
// 12-month projected cycle at its recorded fee (no compounding: the recorded
// future-year price is already the stepped-up rate).
export interface VirtualExtension {
  committedYears: number;
}

// Renewal projection, ported from priceHistoryCalculator.generateTerms. Seeds
// every projected cycle from the final-year products (year === maxYear) and
// compounds annual_increase. The horizon comes from the caller's window, never
// from asOf. One-Time contracts emit nothing; a will-not-renew contract stops
// at the cycle in force at asOf, and an inactive (archived) contract projects
// nothing past its latest recorded term end.
export function generateRenewalSegments(
  contract: SpendContractInput,
  initialEndDate: Date,
  initialTermMonths: number,
  isNonStandard: boolean,
  maxYear: number,
  currency: string,
  horizonEnd: Date,
  asOf: Date,
  virtualExtension?: VirtualExtension,
  feeMode: FeeReadMode = 'usd',
): RenewalResult {
  if (contract.renewal_type === 'One-Time') {
    return { segments: [], renewalLengthDefaulted: false };
  }
  // An invoice records a billing event that already happened; it is not a
  // subscription that rolls forward. Projecting renewals off one turns a
  // historical billing series into N overlapping live obligations — Berenberg
  // records each WM Datenservice half-year as its own invoice, so the 2024 H1
  // invoice was projecting into FY2026 alongside the real 2026 H1 invoice.
  // Recorded segments still stand: the fee counts exactly once, on its dates.
  if (isInvoiceType(contract.type_id)) {
    return { segments: [], renewalLengthDefaulted: false };
  }

  let effectiveHorizon = horizonEnd;
  const capHorizon = (capEnd: Date) => {
    if (isAfter(effectiveHorizon, capEnd)) effectiveHorizon = capEnd;
  };

  if (contract.will_not_renew) {
    capHorizon(addDays(startOfDay(asOf), 1));
  }

  // An inactive contract is assumed done: it keeps its recorded terms but
  // projects no renewals past its latest recorded term_end_date. Cap the
  // horizon there (no recorded end → nothing to project) — mirrors legacy
  // priceHistoryCalculator's inactive handling, including its boundary: a
  // cycle starting exactly ON the recorded end is still emitted (legacy
  // breaks on termStart > archivedContractEnd), so the cap is the exclusive
  // day after. Active/unconfirmed contracts are assumed renewing and project
  // to the caller's window end.
  if (contract.status === 'inactive') {
    const recordedEnd = latestRecordedTermEnd(contract);
    if (!recordedEnd) {
      return { segments: [], renewalLengthDefaulted: false };
    }
    capHorizon(addDays(recordedEnd, 1));
  }

  const { length: renewalLength, defaulted } = calculateRenewalLength(
    contract,
    initialTermMonths,
    isNonStandard,
    maxYear,
  );

  // One-time fees book in their recorded year — a committed segment or a
  // #1594 hint cycle — and never seed projections beyond it (psk-1492).
  const seedProducts = contract.vendor_products_details.filter(
    (p) => (p.year || 1) === maxYear && !p.one_time_only,
  );
  const yearsInTerm =
    renewalLength % 12 === 0 ? Math.max(renewalLength / 12, 1) : 1;
  // Decision #9: a multi-year renewal term splits into 12-month slices each at
  // the seed fee — the fee is an annual price, so a 24-month renewal costs 2×
  // (matches legacy full/minimal; maxYear===1 no longer forces a single
  // period). Non-12-multiple terms stay single-period: legacy full's full-fee
  // trailing stub (12+6 both at full fee) is the acknowledged over-count max
  // mode already refused to reproduce.
  const singlePeriod = renewalLength % 12 !== 0 || yearsInTerm === 1;

  const segments: FeeSegment[] = [];
  let cursor = initialEndDate;
  let renewalCount = 0;

  if (virtualExtension) {
    for (
      let hintYear = virtualExtension.committedYears + 1;
      hintYear <= maxYear;
      hintYear++
    ) {
      const termStart = addDays(cursor, 1);
      if (!isAfter(effectiveHorizon, termStart)) {
        return { segments, renewalLengthDefaulted: defaulted };
      }
      const termEnd = addDays(addMonths(termStart, 12), -1);
      const hintProducts = contract.vendor_products_details.filter(
        (p) => (p.year || 1) === hintYear,
      );
      for (const product of hintProducts) {
        segments.push(
          inferred(
            {
              productId: product.product_id,
              from: format(termStart, 'yyyy-MM-dd'),
              to: format(addDays(termEnd, 1), 'yyyy-MM-dd'),
              fee: productFee(product, feeMode),
              currency,
              source: 'renewal-projection',
              termStart: format(termStart, 'yyyy-MM-dd'),
            },
            INFERENCE_REASONS.renewalHint,
          ),
        );
      }
      cursor = termEnd;
      renewalCount++;
    }
  }

  // #1594 hint cycles consumed renewal indices above, but their fees are
  // RECORDED, not compounded — and `seedProducts` IS the final hint year's row,
  // so the seed fee already sits at that cycle's price level. Compounding must
  // therefore count renewals since the SEED, not since the initial term, or the
  // first true projection charges an increase for a step-up already baked into
  // its base (Truvalue #112: 5,000 -> 6,655 where 5,500 is right). Zero unless
  // #1594 applies, so no other contract's numbers move.
  const hintCycles = renewalCount;

  // Every final-year row was one-time → nothing recurs. Skip the projection
  // loop instead of spinning it to the horizon emitting nothing (and tripping
  // the truncation warning on wide windows).
  if (seedProducts.length === 0) {
    return { segments, renewalLengthDefaulted: defaulted };
  }

  while (true) {
    const termStart = addDays(cursor, 1);
    if (!isAfter(effectiveHorizon, termStart)) break;
    renewalCount++;
    const termEnd = addDays(addMonths(termStart, renewalLength), -1);

    const emit = (start: Date, inclusiveEnd: Date, yearWithinTerm: number) => {
      for (const product of seedProducts) {
        segments.push(
          inferred(
            {
              productId: product.product_id,
              from: format(start, 'yyyy-MM-dd'),
              to: format(addDays(inclusiveEnd, 1), 'yyyy-MM-dd'),
              fee: projectedFee(
                product,
                contract,
                renewalCount - hintCycles,
                yearWithinTerm,
                feeMode,
              ),
              currency,
              source: 'renewal-projection',
              termStart: format(termStart, 'yyyy-MM-dd'),
            },
            // A defaulted length is the stronger signal for the integrity
            // report: the projection cadence itself was guessed.
            defaulted
              ? INFERENCE_REASONS.renewalLengthDefault
              : INFERENCE_REASONS.renewalProjection,
          ),
        );
      }
    };

    if (singlePeriod) {
      emit(termStart, termEnd, 1);
    } else {
      for (let year = 1; year <= yearsInTerm; year++) {
        const yearStart =
          year === 1 ? termStart : addMonths(termStart, (year - 1) * 12);
        const yearEnd =
          year === yearsInTerm
            ? termEnd
            : addDays(addMonths(yearStart, 12), -1);
        emit(yearStart, yearEnd, year);
      }
    }

    cursor = termEnd;
    if (renewalCount > MAX_PROJECTED_RENEWALS) {
      // A sub-annual cycle over a wide window (the price-history page queries
      // from 1970) reaches the cap and the projection just stops short of the
      // horizon. Every inferred segment carries a `reason`, so a truncation
      // that leaves no trace is the one place the engine stops explaining
      // itself. The break exits immediately, so this logs at most once per
      // contract per resolution.
      logger.warn(
        {
          contractId: contract.id,
          renewalCount,
          horizon: format(effectiveHorizon, 'yyyy-MM-dd'),
          cap: MAX_PROJECTED_RENEWALS,
        },
        'Renewal projections truncated at the cap; segments stop before the requested horizon',
      );
      break;
    }
  }

  return { segments, renewalLengthDefaulted: defaulted };
}
