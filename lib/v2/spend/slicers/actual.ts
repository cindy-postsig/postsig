import type { FeeSegment, SpendGranularity, SpendLineItem } from '../types';
import { segmentSpanMonths } from '../resolver';
import { bucketKey, type FiscalConfig } from '../buckets';
import {
  parseUTCDate,
  formatUTCDate,
  addUTCDays,
  addUTCMonths,
  fullUTCMonthsBetween,
} from '../dates';
import { inWindow, toCents, toLineItems, type WindowBounds } from './shared';

export interface BillingConfig {
  // 1 monthly / 3 quarterly / 6 semi- & bi-annually / 12 annually. 0 is the
  // special "unknown / absent frequency" case: bill the full fee once on the
  // cycle start (ports extractActualCostData's no-frequency branch).
  billingMonths: number;
}

// Ported from getFirstBillingDateInFiscalYear: advance whole billing cycles
// until the billing date reaches the window start.
// Returns the CYCLE INDEX rather than a date, so the caller keeps stepping
// from `cycleStart` — see the anchor note in the billing loop.
function firstBillingCycle(
  cycleStart: Date,
  windowStart: Date,
  billingMonths: number,
): number {
  if (cycleStart.getTime() >= windowStart.getTime()) return 0;
  const monthsDiff = fullUTCMonthsBetween(cycleStart, windowStart);
  const cyclesToSkip = Math.floor(monthsDiff / billingMonths);
  const candidate = addUTCMonths(cycleStart, cyclesToSkip * billingMonths);
  return candidate.getTime() < windowStart.getTime()
    ? cyclesToSkip + 1
    : cyclesToSkip;
}

export function sliceActual(
  segments: FeeSegment[],
  window: WindowBounds,
  granularity: SpendGranularity,
  billingConfig: BillingConfig,
  fiscalConfig: FiscalConfig,
): SpendLineItem[] {
  const bucket = new Map<string, number>();
  const { billingMonths } = billingConfig;

  for (const segment of segments) {
    const from = parseUTCDate(segment.from);
    const inclusiveEnd = addUTCDays(parseUTCDate(segment.to), -1);

    if (billingMonths === 0) {
      if (inWindow(from, window)) {
        const key = bucketKey(from, granularity, fiscalConfig);
        bucket.set(key, toCents((bucket.get(key) ?? 0) + segment.fee));
      }
      continue;
    }

    // PSK-1850: the divisor is the segment's OWN dated span, never the term.
    const spanMonths = Math.max(
      segmentSpanMonths(segment.from, formatUTCDate(inclusiveEnd)),
      1,
    );
    const monthlyRate = segment.fee / spanMonths;

    // The `< window.end` half-open gate lands a boundary bill in exactly one
    // bucket.
    // Anchored on `from`: addUTCMonths clamps to the target month's last day,
    // so stepping from the previous billing date makes the clamp cumulative —
    // a cycle starting the 30th drops to the 28th at February and stays there,
    // admitting an extra cycle before the segment ends (psk-1846 QA).
    let cycle = firstBillingCycle(from, window.start, billingMonths);
    let billingDate = addUTCMonths(from, cycle * billingMonths);
    while (
      billingDate.getTime() <= inclusiveEnd.getTime() &&
      billingDate.getTime() < window.end.getTime()
    ) {
      // A bill covers billingMonths of run-rate, capped where the segment
      // ends first: a segment shorter than its billing interval (mid-cycle
      // amendment truncation, day-scaled stubs) must still conserve — bills
      // within a segment sum to the segment fee, never beyond it.
      const coveredMonths = Math.min(
        billingMonths,
        Math.max(
          segmentSpanMonths(
            formatUTCDate(billingDate),
            formatUTCDate(inclusiveEnd),
          ),
          1,
        ),
      );
      const key = bucketKey(billingDate, granularity, fiscalConfig);
      bucket.set(
        key,
        toCents((bucket.get(key) ?? 0) + monthlyRate * coveredMonths),
      );
      cycle += 1;
      billingDate = addUTCMonths(from, cycle * billingMonths);
    }
  }

  return toLineItems(bucket);
}
