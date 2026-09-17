import type { FeeSegment, SpendGranularity, SpendLineItem } from '../types';
import { bucketKey, type FiscalConfig } from '../buckets';
import { parseUTCDate } from '../dates';
import { inWindow, toLineItems, type WindowBounds } from './shared';

// The full cycle fee lands in the single bucket where the cycle STARTS — no
// proration, no billing walk (ports distributeFeeAcrossYears, generalized to
// fiscal buckets per the locked decision). A zero-fee cycle contributes
// nothing; a super-annual cycle still lands entirely in its start bucket,
// leaving the intervening buckets as intentional gaps.
export function sliceCommitted(
  segments: FeeSegment[],
  window: WindowBounds,
  granularity: SpendGranularity,
  fiscalConfig: FiscalConfig,
): SpendLineItem[] {
  const bucket = new Map<string, number>();

  for (const segment of segments) {
    if (segment.fee === 0) continue;
    const from = parseUTCDate(segment.from);
    if (!inWindow(from, window)) continue;
    const key = bucketKey(from, granularity, fiscalConfig);
    bucket.set(key, (bucket.get(key) ?? 0) + segment.fee);
  }

  return toLineItems(bucket);
}
