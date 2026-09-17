import {
  parseISO,
  addMonths,
  addDays,
  addYears,
  differenceInDays,
  differenceInMonths,
  format,
  isAfter,
} from 'date-fns';
import type { SpendContractInput } from '../contractInput';
import type { FeeSegment } from '../types';
import { explicit, inferred, INFERENCE_REASONS } from './shapes';

export interface InitialTermResult {
  segments: FeeSegment[];
  lastEndDate: Date;
  maxYear: number;
  virtualExtensionFired: boolean;
  // Number of product-year rows the RECORDED term actually covers. Equals
  // maxYear normally; when the virtual-extension guard fires it is the count of
  // committed years, and rows above it become renewal hints (see renewals.ts).
  committedYears: number;
}

interface ProductRow {
  product_id: number;
  year?: number;
  fees?: number;
  convertedFees?: number;
  one_time_only?: boolean;
}

// 'usd' reads the pre-converted fee the pipeline stamped at cache fill;
// 'native' reads the original recorded fee — per-contract surfaces (table
// rows) display native currency, and back-converting USD would drift by
// cents. Cross-contract aggregation must stay 'usd' until psk-1796 part B.
export type FeeReadMode = 'usd' | 'native';

export function productFee(product: ProductRow, mode: FeeReadMode): number {
  return mode === 'native'
    ? Number(product.fees) || 0
    : Number(product.convertedFees ?? product.fees) || 0;
}

// Decision #9 (annual-fee-repeat): a single-year fee row prices 12 months, so
// it repeats per cycle when the recorded span holds more than one — a clean
// multi-year span (24/36 months), or dates exceeding an explicit 12-multiple
// subscription_term (legacy's "downward override"). A non-12-multiple span
// with no shorter explicit term is the 'non-12-month-term' shape: the fee
// prices the whole span and does NOT repeat.
export function annualFeeRepeats(
  spanMonths: number,
  subscriptionTerm: number | null | undefined,
): boolean {
  if (spanMonths <= 12) return false;
  if (spanMonths % 12 === 0) return true;
  return Boolean(
    subscriptionTerm &&
    subscriptionTerm % 12 === 0 &&
    subscriptionTerm < spanMonths,
  );
}

function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function explicitSegmentFor(
  product: ProductRow,
  start: Date,
  inclusiveEnd: Date,
  currency: string,
  termStart: string,
  feeMode: FeeReadMode,
): FeeSegment {
  return explicit({
    productId: product.product_id,
    from: format(start, 'yyyy-MM-dd'),
    to: format(addDays(inclusiveEnd, 1), 'yyyy-MM-dd'),
    fee: productFee(product, feeMode),
    currency,
    source: 'year-entry',
    termStart,
  });
}

// Backwards term split, ported from priceHistoryCalculator.generateInitialTerm.
// Each product-year row becomes one half-open [from, to) segment.
//
// PR #1594 "year-as-renewal-hint" (psk-1850 follow-up): when the RECORDED term
// is too short to hold every product-year row (firstYearSliceMonths <= 0), the
// recorded dates are the true commitment. The term is NOT virtually extended;
// only the years the recorded term covers become committed 'year-entry'
// segments, and the extra rows (year committedYears+1 .. maxYear) are handed to
// the renewal projector as renewal hints.
export function generateInitialTerm(
  contract: SpendContractInput,
  initialStartDate: string,
  initialEndDate: string | null | undefined,
  currency: string,
  feeMode: FeeReadMode = 'usd',
): InitialTermResult {
  const startDate = parseISO(initialStartDate);
  const recordedEndDate = initialEndDate
    ? parseISO(initialEndDate)
    : addDays(addMonths(startDate, contract.subscription_term || 12), -1);
  // The whole recorded span is ONE committed term — every slice (year entries,
  // decision-#9 repeat cycles) shares its start, so queryCommitments can
  // rebuild the commitment event.
  const termStart = format(startDate, 'yyyy-MM-dd');

  const maxYear = Math.max(
    ...contract.vendor_products_details.map((p) => p.year || 1),
  );

  const recordedTermMonths = differenceInMonths(
    addDays(recordedEndDate, 1),
    startDate,
  );
  const firstYearSliceMonths = recordedTermMonths - (maxYear - 1) * 12;
  const virtualExtensionFired = maxYear > 1 && firstYearSliceMonths <= 0;

  const committedYears = virtualExtensionFired
    ? Math.max(1, Math.round(recordedTermMonths / 12))
    : maxYear;

  const segments: FeeSegment[] = [];

  if (maxYear === 1) {
    const products = contract.vendor_products_details.filter(
      (p) => (p.year || 1) === 1,
    );
    if (annualFeeRepeats(recordedTermMonths, contract.subscription_term)) {
      let cycleStart = startDate;
      let firstCycle = true;
      while (!isAfter(cycleStart, recordedEndDate)) {
        const fullCycleEnd = addDays(addMonths(cycleStart, 12), -1);
        const cycleEnd = isAfter(fullCycleEnd, recordedEndDate)
          ? recordedEndDate
          : fullCycleEnd;
        // A trailing partial cycle keeps the per-day rate (phase-4 precedent).
        const retainedDays = differenceInDays(cycleEnd, cycleStart) + 1;
        const fullDays = differenceInDays(fullCycleEnd, cycleStart) + 1;
        for (const product of products) {
          // A one-time fee is not an annual price — it books in the first
          // cycle only instead of repeating (psk-1492).
          if (product.one_time_only && !firstCycle) continue;
          segments.push(
            inferred(
              {
                productId: product.product_id,
                from: format(cycleStart, 'yyyy-MM-dd'),
                to: format(addDays(cycleEnd, 1), 'yyyy-MM-dd'),
                fee: toCents(
                  productFee(product, feeMode) * (retainedDays / fullDays),
                ),
                currency,
                source: 'year-entry',
                termStart,
              },
              INFERENCE_REASONS.annualFeeRepeat,
            ),
          );
        }
        firstCycle = false;
        cycleStart = addDays(fullCycleEnd, 1);
      }
    } else {
      for (const product of products) {
        segments.push(
          explicitSegmentFor(
            product,
            startDate,
            recordedEndDate,
            currency,
            termStart,
            feeMode,
          ),
        );
      }
    }
    return {
      segments,
      lastEndDate: recordedEndDate,
      maxYear,
      virtualExtensionFired,
      committedYears,
    };
  }

  const periodEndDates: Date[] = [];
  let currentEnd = recordedEndDate;
  for (let i = 0; i < committedYears; i++) {
    periodEndDates.unshift(currentEnd);
    if (i < committedYears - 1) {
      currentEnd = addYears(currentEnd, -1);
    }
  }

  let currentStart = startDate;
  for (let year = 1; year <= committedYears; year++) {
    const periodEnd = periodEndDates[year - 1];
    const products = contract.vendor_products_details.filter(
      (p) => (p.year || 1) === year,
    );
    for (const product of products) {
      segments.push(
        explicitSegmentFor(
          product,
          currentStart,
          periodEnd,
          currency,
          termStart,
          feeMode,
        ),
      );
    }
    currentStart = addDays(periodEnd, 1);
  }

  return {
    segments,
    lastEndDate: recordedEndDate,
    maxYear,
    virtualExtensionFired,
    committedYears,
  };
}
