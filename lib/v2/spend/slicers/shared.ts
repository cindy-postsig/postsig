import type { SpendLineItem } from '../types';
import type { ResolvedWindow } from '../window';

export type WindowBounds = Pick<ResolvedWindow, 'start' | 'end'>;

export function toCents(value: number): number {
  return Math.round((value ?? 0) * 100) / 100;
}

export function inWindow(date: Date, window: WindowBounds): boolean {
  return (
    date.getTime() >= window.start.getTime() &&
    date.getTime() < window.end.getTime()
  );
}

// Phase 3a slices a single contract, so every line item is groupKey 'total';
// grouping across contracts is the phase-3b querySpend seam.
export function toLineItems(bucket: Map<string, number>): SpendLineItem[] {
  return [...bucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, groupKey: 'total', value }));
}
