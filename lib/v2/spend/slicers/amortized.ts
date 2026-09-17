import {
  parseISO,
  addMonths,
  addYears,
  differenceInMonths,
  differenceInYears,
} from 'date-fns';
import type {
  FeeSegment,
  SpendGranularity,
  SpendLineItem,
  SpendProration,
} from '../types';
import { bucketKey, type FiscalConfig } from '../buckets';
import {
  parseUTCDate,
  formatUTCDate,
  addUTCDays,
  addUTCMonths,
  diffUTCDays,
} from '../dates';
import { inWindow, toCents, toLineItems, type WindowBounds } from './shared';

// getContractMonths semantics (priceHistoryChartUtils): an exact N-year span is
// N*12, an exact N-month span is N, otherwise differenceInMonths + 1. Computed
// from ISO strings and purely relative, so it is timezone-stable even though
// date-fns parses locally.
function amortizationMonths(fromISO: string, inclusiveEndISO: string): number {
  const start = parseISO(fromISO);
  const end = parseISO(inclusiveEndISO);

  const yearsDiff = differenceInYears(end, start);
  if (yearsDiff > 0 && addYears(start, yearsDiff).getTime() === end.getTime()) {
    return yearsDiff * 12;
  }

  const monthsDiff = differenceInMonths(end, start);
  if (addMonths(start, monthsDiff).getTime() === end.getTime()) {
    return monthsDiff;
  }

  return differenceInMonths(end, start) + 1;
}

function inclusiveEndISO(segment: FeeSegment): string {
  return formatUTCDate(addUTCDays(parseUTCDate(segment.to), -1));
}

// MONTHLY proration (default): reproduces extractAmortizedData exactly — each
// month gets toCents(fee / span-months), the latest-STARTING segment wins each
// calendar month so overlapping renewal boundaries never double-count within a
// product, and the monthly contribution is then placed into its granularity
// bucket.
function accumulateMonthly(
  segments: FeeSegment[],
  window: WindowBounds,
  granularity: SpendGranularity,
  fiscalConfig: FiscalConfig,
  bucket: Map<string, number>,
): void {
  const byProduct = new Map<number, FeeSegment[]>();
  for (const segment of segments) {
    const list = byProduct.get(segment.productId) ?? [];
    list.push(segment);
    byProduct.set(segment.productId, list);
  }

  for (const list of byProduct.values()) {
    const monthWinner = new Map<string, { date: Date; segment: FeeSegment }>();
    for (const segment of list) {
      const from = parseUTCDate(segment.from);
      const inclusiveEnd = addUTCDays(parseUTCDate(segment.to), -1);
      // Step from the anchor, never from the previous cursor. addUTCMonths
      // clamps to the target month's last day, so re-adding to the result
      // makes the clamp cumulative: a term starting the 30th drops to the
      // 28th at February and stays there, leaving room for a thirteenth
      // month inside a twelve-month term. The divisor below is 12 either
      // way, so the segment booked 13/12 of its fee (psk-1846 QA).
      let step = 0;
      let month = from;
      while (month.getTime() <= inclusiveEnd.getTime()) {
        if (inWindow(month, window)) {
          const monthKey = bucketKey(month, 'month', fiscalConfig);
          const existing = monthWinner.get(monthKey);
          if (
            !existing ||
            from.getTime() >= parseUTCDate(existing.segment.from).getTime()
          ) {
            monthWinner.set(monthKey, { date: month, segment });
          }
        }
        step += 1;
        month = addUTCMonths(from, step);
      }
    }

    for (const { date, segment } of monthWinner.values()) {
      const months = amortizationMonths(segment.from, inclusiveEndISO(segment));
      const monthlyValue = toCents(segment.fee / months);
      const key = bucketKey(date, granularity, fiscalConfig);
      bucket.set(key, toCents((bucket.get(key) ?? 0) + monthlyValue));
    }
  }
}

// DAILY proration (opt-in): fee / span-days × (segment-days landing in the
// bucket), with span-days = the half-open span (differenceInDays, no +1). This
// is the version where conservation is EXACT — a segment's daily contributions
// over its full span sum back to its fee (invariant 1). Half-open segments own
// each day uniquely, so no per-month dedup is needed.
function accumulateDaily(
  segments: FeeSegment[],
  window: WindowBounds,
  granularity: SpendGranularity,
  fiscalConfig: FiscalConfig,
  bucket: Map<string, number>,
): void {
  for (const segment of segments) {
    const from = parseUTCDate(segment.from);
    const to = parseUTCDate(segment.to);
    const spanDays = diffUTCDays(to, from);
    if (spanDays <= 0) continue;

    const dayCounts = new Map<string, number>();
    let day = from;
    while (day.getTime() < to.getTime()) {
      if (inWindow(day, window)) {
        const key = bucketKey(day, granularity, fiscalConfig);
        dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
      }
      day = addUTCDays(day, 1);
    }

    for (const [key, days] of dayCounts) {
      bucket.set(key, (bucket.get(key) ?? 0) + (segment.fee * days) / spanDays);
    }
  }
}

export function sliceAmortized(
  segments: FeeSegment[],
  window: WindowBounds,
  granularity: SpendGranularity,
  proration: SpendProration,
  fiscalConfig: FiscalConfig,
): SpendLineItem[] {
  const bucket = new Map<string, number>();
  if (proration === 'daily') {
    accumulateDaily(segments, window, granularity, fiscalConfig, bucket);
  } else {
    accumulateMonthly(segments, window, granularity, fiscalConfig, bucket);
  }
  return toLineItems(bucket);
}
