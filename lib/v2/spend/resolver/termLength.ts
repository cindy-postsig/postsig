import {
  parseISO,
  addMonths,
  addDays,
  differenceInMonths,
  differenceInDays,
} from 'date-fns';

export interface TermLengthResult {
  months: number;
  // True when the product-year tie-breaker (subscription_term vs date-derived
  // months, disambiguated by maxProductYear) decided the term identity. Callers
  // stamp confidence:'inferred' when this is set.
  usedTieBreaker: boolean;
}

// The single decoder of a term's length in months, ported verbatim from
// priceHistoryCalculator.getTermLength. The "+1 day then differenceInMonths,
// round up when the leftover exceeds 15 days" span, the product-year
// tie-breaker, and the ±1-month reconcile all live here and nowhere else.
//
// PSK-1850: this reconciles a term's IDENTITY (how many months / years the
// whole term spans). A fee segment's amortization divisor is a different
// question — it is the segment's OWN date span, obtained by calling this with
// no expectedTermLength/maxProductYear so the tie-breaker cannot re-inflate a
// 12-month slice back to the 36-month subscription_term.
export function reconcileTermLength(
  startDate: string,
  endDate: string | null | undefined,
  expectedTermLength?: number | null,
  maxProductYear?: number | null,
): TermLengthResult {
  if (!endDate) {
    return { months: expectedTermLength || 12, usedTieBreaker: false };
  }

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
      return { months: Math.max(calculatedMonths, 1), usedTieBreaker: true };
    }
    if (maxProductYear === expectedYears) {
      return { months: Math.max(expectedTermLength, 1), usedTieBreaker: true };
    }
  }

  if (
    expectedTermLength &&
    Math.abs(expectedTermLength - calculatedMonths) <= 1
  ) {
    return { months: Math.max(expectedTermLength, 1), usedTieBreaker: false };
  }

  return { months: Math.max(calculatedMonths, 1), usedTieBreaker: false };
}

export function getTermLength(
  startDate: string,
  endDate: string | null | undefined,
  expectedTermLength?: number | null,
  maxProductYear?: number | null,
): number {
  return reconcileTermLength(
    startDate,
    endDate,
    expectedTermLength,
    maxProductYear,
  ).months;
}

// A fee segment's amortization / billing divisor: its own dated span, with no
// tie-breaker input. This is the PSK-1850 guarantee in one call.
export function segmentSpanMonths(from: string, inclusiveEnd: string): number {
  return getTermLength(from, inclusiveEnd);
}
