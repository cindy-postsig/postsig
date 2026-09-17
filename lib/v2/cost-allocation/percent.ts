/** Percentage points a populated scope's total may deviate from 100. */
export const PERCENT_SUM_TOLERANCE = 0.01;

/** numeric(7,4): validation and storage both work in 0.0001% units. */
export const PERCENT_UNIT = 10000;

/**
 * The equal-split convention everywhere (backfill, editor, Owner tab): the
 * numeric(7,4) floor of 100/n — 33.3333 each, never 33.3334/33.3333/33.3333.
 * Distributing the remainder units would give the first target a genuinely
 * larger share, which the backfill gate caught moving report cents (a cent
 * per ~$10k of value); the truncated sum (>= 99.9993 for any realistic n)
 * sits inside PERCENT_SUM_TOLERANCE, and "all at the same percent" keeps the
 * Owner tab's simple rule true for every equal split.
 */
export function equalSplitPercent(count: number): number {
  return Math.floor((100 * PERCENT_UNIT) / count) / PERCENT_UNIT;
}
