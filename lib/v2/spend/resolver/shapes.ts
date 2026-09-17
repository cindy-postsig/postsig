import type { FeeSegment } from '../types';

// Reasons attached to inferred segments. Each names the heuristic that decided
// a boundary so the integrity report can list it for human confirmation.
export const INFERENCE_REASONS = {
  tieBreaker:
    'term length resolved via product-year tie-breaker (dates disagreed with subscription_term)',
  renewalHint:
    'projected renewal from a recorded future-year fee; assumes step-ups persist',
  renewalLengthDefault:
    'renewal length was non-positive; defaulted to 12 months',
  renewalProjection: 'projected from final-year fee; assumes step-ups persist',
  annualFeeRepeat:
    'single-year fee read as an annual price, repeated per 12-month cycle across a longer recorded span',
  parentTermInherited:
    'no end date and no subscription_term recorded; term length inherited from the parent contract',
  invoiceSingleMonth:
    'invoice records no end date and no term; full amount books in its start month',
} as const;

export function explicit(
  segment: Omit<FeeSegment, 'confidence' | 'reason'>,
): FeeSegment {
  return { ...segment, confidence: 'explicit' };
}

export function inferred(
  segment: Omit<FeeSegment, 'confidence' | 'reason'>,
  reason: string,
): FeeSegment {
  return { ...segment, confidence: 'inferred', reason };
}
