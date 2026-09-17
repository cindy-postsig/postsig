import type { OrgUnitLevel } from '@/lib/v2/org-units/levels';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import type {
  AllocationTargetRef,
  ResolvedContractAllocation,
  ResolvedLine,
} from '@/lib/v2/cost-allocation/types';
import { rollupToLevel } from '@/lib/v2/cost-allocation/resolver';

export type AllocationLevel = OrgUnitLevel | 'user';

/** Contracts with no allocation route here so additivity holds; the goldens pin the key. */
export const UNASSIGNED_KEY = 'unassigned';

/** A percentage share per group key; percents are normalized by their sum when split. */
export type AllocationShares = Array<[string, number]>;

/**
 * The resolved allocation map and the tree it rolls up through. Resolved
 * OUTSIDE the engine (the resolver's own contract, so the Redis-cached
 * contract select never joins allocations) and handed in through
 * SpendQueryOptions.
 */
export interface SpendAllocationInput {
  resolved: ReadonlyMap<number, ResolvedContractAllocation>;
  unitsById: ReadonlyMap<number, OrgUnitNode>;
}

/**
 * The engine's group key for an allocation target. Prefixed because the
 * 'user' level puts employee and org-unit targets in one key space, where a
 * bare numeric id would collide.
 */
export function allocationKey(target: AllocationTargetRef): string {
  return target.kind === 'employee' ? `user:${target.id}` : `unit:${target.id}`;
}

/**
 * rollupToLevel, then merge by key: two lines that roll to the same node
 * become one share, so the split rounds once per key. 'user' is the one
 * non-tree level — lines keep their own target. No lines → the unassigned
 * bucket at 100%, so every contract still contributes to the period total.
 *
 * A line that lands nowhere at the level merges into that same bucket rather
 * than dropping out: splitByAllocation normalizes by the share sum, so a
 * dropped line would hand its money to the groups that did land.
 */
export function allocationShares(
  lines: ResolvedLine[],
  level: AllocationLevel,
  unitsById: ReadonlyMap<number, OrgUnitNode>,
  keyOf: (target: AllocationTargetRef) => string = allocationKey,
): AllocationShares {
  const targets =
    level === 'user' ? lines : rollupToLevel(lines, level, unitsById);
  const merged = new Map<string, number>();
  for (const line of targets) {
    const key = line.target === null ? UNASSIGNED_KEY : keyOf(line.target);
    merged.set(key, (merged.get(key) ?? 0) + line.percent);
  }
  if (merged.size === 0) return [[UNASSIGNED_KEY, 100]];
  return [...merged];
}

/**
 * Cents-preserving largest-remainder split: each key gets the floor of its
 * proportional cents, and the leftover cents go one each to the largest
 * fractional remainders, ties in input order. Pieces sum back to `value`
 * exactly. Flooring runs on the signed raw value, so equal shares reproduce
 * splitEvenly (the sponsor dimension's split) cent for cent — negatives
 * included — and the two splits cannot disagree on a contract they both see.
 */
export function splitByAllocation(
  value: number,
  shares: AllocationShares,
): Array<[string, number]> {
  if (shares.length === 0) {
    throw new Error('splitByAllocation: shares must not be empty');
  }
  const sumPercent = shares.reduce((sum, [, percent]) => sum + percent, 0);
  if (!(sumPercent > 0)) {
    throw new Error('splitByAllocation: shares must sum to a positive percent');
  }

  const totalCents = Math.round(value * 100);
  const floors: number[] = [];
  const remainders: number[] = [];
  for (const [, percent] of shares) {
    const raw = (totalCents * percent) / sumPercent;
    const floor = Math.floor(raw);
    floors.push(floor);
    remainders.push(raw - floor);
  }

  let leftover = totalCents - floors.reduce((sum, cents) => sum + cents, 0);
  const byRemainder = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; leftover > 0; i = (i + 1) % byRemainder.length) {
    floors[byRemainder[i].index] += 1;
    leftover -= 1;
  }

  return shares.map(([key], index) => [key, floors[index] / 100]);
}
