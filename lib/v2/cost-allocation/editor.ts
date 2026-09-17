import {
  PERCENT_SUM_TOLERANCE,
  PERCENT_UNIT,
  equalSplitPercent,
} from './percent';
import type { AllocationScopeInput } from './service';
import type {
  AllocationMode,
  AllocationTargetRef,
  ResolvedContractAllocation,
  ResolvedScope,
} from './types';
import { targetKey, type PickerCategory } from './picker';
import type { ScopeValues } from './amounts';

export interface ScopeSeat {
  productId: number | null;
  employeeId: number | null;
}

export type SplitMethod = 'equal' | 'manual';

export interface EditorLine {
  target: AllocationTargetRef;
  percent: number;
}

export interface EditorScope {
  /** null = whole-contract scope */
  productId: number | null;
  mode: AllocationMode;
  /** UI affordance only; every saved line is stored as manual. */
  method: SplitMethod;
  lines: EditorLine[];
}

export interface ScopeTotals {
  percent: number;
  amount: number;
  balanced: boolean;
  isEmpty: boolean;
}

export const ACTIVE_USERS_MODE_LABEL = 'Split equally among active users';

/** The scope chooser only matters with 2+ products; fewer go straight to contract scope. */
export function needsScopeChoice(productCount: number): boolean {
  return productCount >= 2;
}

export function roundPercent(percent: number): number {
  return Math.round(percent * PERCENT_UNIT) / PERCENT_UNIT;
}

/** Truncated-equal shares (equalSplitPercent) — the same split the backfill wrote. */
export function equalSplitPercents(count: number): number[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, () => equalSplitPercent(count));
}

export function applyEqualSplit(lines: EditorLine[]): EditorLine[] {
  const percents = equalSplitPercents(lines.length);
  return lines.map((line, i) => ({ ...line, percent: percents[i] }));
}

export function percentToAmount(percent: number, scopeValue: number): number {
  return (percent / 100) * scopeValue;
}

function totalPercent(percents: readonly number[]): number {
  return percents.reduce((sum, percent) => sum + percent, 0);
}

/**
 * The lines' amounts as the tables print them: whole currency units that add
 * up to the same whole-unit total the footer shows. Rounding each
 * `percent × value` on its own does not — an equal split of €1,200 across
 * seven targets printed €171 seven times under a €1,200 total (QA 2026-08-26)
 * — so the units the truncation leaves over go to the lines that lost the most
 * of one, largest remainder first. Percentages stay untouched: `percent.ts`
 * says why they must all stay equal.
 *
 * Whole units because that is what `formatCurrency` renders here; a scope with
 * no value has no amounts to show.
 */
export function displayAmounts(
  percents: readonly number[],
  scopeValue: number | null,
): (number | null)[] {
  if (scopeValue === null) return percents.map(() => null);
  const exact = percents.map((percent) => percentToAmount(percent, scopeValue));
  const amounts = exact.map((amount) => Math.floor(amount));
  const leftover = Math.min(
    Math.max(
      Math.round(percentToAmount(totalPercent(percents), scopeValue)) -
        amounts.reduce((sum, amount) => sum + amount, 0),
      0,
    ),
    amounts.length,
  );
  const byRemainder = exact
    .map((amount, index) => ({ index, remainder: amount - amounts[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder.slice(0, leftover)) amounts[index] += 1;
  return amounts;
}

/**
 * One scope's displayed value. A stamped record's product with no stamp of
 * its own is zero — the engine's answer for a product that booked nothing
 * (superseded, cancelled, never priced), and what the budget table's product
 * rows print. null only when the record itself is absent from the set.
 */
export function scopeValueFor(
  values: ScopeValues,
  productId: number | null,
): number | null {
  if (productId === null) return values.contract;
  if (values.contract === null) return null;
  return values.products[productId] ?? 0;
}

/** Amount edits convert to percent against the scope's displayed value; a zero-value scope cannot take an amount. */
export function amountToPercent(amount: number, scopeValue: number): number {
  if (scopeValue <= 0) return 0;
  const clamped = Math.max(0, Math.min(scopeValue, amount));
  return roundPercent((clamped / scopeValue) * 100);
}

export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return roundPercent(Math.max(0, Math.min(100, percent)));
}

export function scopeTotals(
  lines: readonly { percent: number }[],
  scopeValue: number,
): ScopeTotals {
  const percent = roundPercent(
    lines.reduce((sum, line) => sum + line.percent, 0),
  );
  return {
    percent,
    amount: percentToAmount(percent, scopeValue),
    balanced: Math.abs(percent - 100) <= PERCENT_SUM_TOLERANCE,
    isEmpty: lines.length === 0,
  };
}

export function balanceMessage(totalPercent: number): string | null {
  const gap = roundPercent(Math.abs(totalPercent - 100));
  if (gap <= PERCENT_SUM_TOLERANCE) return null;
  const direction = totalPercent < 100 ? 'under' : 'over';
  return `Allocation is ${gap}% ${direction} 100%. Adjust the percentages to reach 100%.`;
}

function isPopulated(scope: EditorScope): boolean {
  return scope.mode === 'active_users' || scope.lines.length > 0;
}

/**
 * Save gate: every scope with lines totals 100%, and there is something to
 * save — a populated scope, or an existing own allocation being cleared.
 */
export function canSaveScopes(
  scopes: readonly EditorScope[],
  hasOwnAllocation: boolean,
): boolean {
  const populated = scopes.filter(isPopulated);
  const allBalanced = populated.every(
    (scope) =>
      scope.mode === 'active_users' || scopeTotals(scope.lines, 0).balanced,
  );
  return allBalanced && (populated.length > 0 || hasOwnAllocation);
}

export function editorScopeFromResolved(
  productId: number | null,
  resolved: ResolvedScope | undefined,
): EditorScope {
  if (!resolved) {
    return { productId, mode: 'manual', method: 'equal', lines: [] };
  }
  const lines = resolved.lines.map((line) => ({
    target: line.target,
    percent: line.percent,
  }));
  const equal =
    lines.length > 0 &&
    lines.every((line) => line.percent === lines[0].percent);
  return {
    productId,
    mode: resolved.mode,
    method: equal ? 'equal' : 'manual',
    lines,
  };
}

export function toSaveScopes(
  scopes: readonly EditorScope[],
): AllocationScopeInput[] {
  return scopes.filter(isPopulated).map((scope) =>
    scope.mode === 'active_users'
      ? { productId: scope.productId, mode: 'active_users' }
      : {
          productId: scope.productId,
          mode: 'manual',
          lines: scope.lines.map((line) => ({
            orgUnitId: line.target.kind === 'org_unit' ? line.target.id : null,
            orgEmployeeId:
              line.target.kind === 'employee' ? line.target.id : null,
            percent: line.percent,
          })),
        },
  );
}

export type AllocationProvenance =
  | { kind: 'none' }
  | { kind: 'own' }
  | { kind: 'inherited'; sourceContractId: number };

/** All scopes of a resolved contract share one source (the nearest allocated ancestor resolves as a unit). */
/**
 * The scopes that apply to a record: whole-record scopes always, product
 * scopes only for products the record carries. An inherited by-product
 * allocation is the source's; a child billing a subset of the parent's
 * products takes just the matching scopes — the engine likewise attributes
 * a segment through its own product's scope and never reads the rest. null
 * product ids = the record's products are unknown, so nothing is dropped.
 */
export function applicableScopes<T extends { productId: number | null }>(
  scopes: readonly T[],
  productIds: ReadonlySet<number> | null,
): T[] {
  if (productIds === null) return [...scopes];
  return scopes.filter(
    (scope) => scope.productId === null || productIds.has(scope.productId),
  );
}

export function allocationProvenance(
  resolved: ResolvedContractAllocation,
): AllocationProvenance {
  const source = resolved.scopes[0]?.sourceContractId;
  if (source === undefined) return { kind: 'none' };
  if (source === resolved.contractId) return { kind: 'own' };
  return { kind: 'inherited', sourceContractId: source };
}

export function provenanceLabel(
  provenance: AllocationProvenance,
  options: { isInvoice: boolean; sourceContractName?: string },
): string {
  const recordNoun = options.isInvoice ? 'invoice' : 'contract';
  switch (provenance.kind) {
    case 'none':
      return 'No allocation';
    case 'own':
      return `Set on this ${recordNoun}`;
    case 'inherited':
      return `Inherited from ${options.sourceContractName ?? `contract #${provenance.sourceContractId}`}`;
  }
}

export function unlinkedSeatsNote(count: number): string | null {
  if (count <= 0) return null;
  const noun = count === 1 ? 'seat is' : 'seats are';
  return `${count} unlinked ${noun} not included — link them to employees to allocate their share.`;
}

/**
 * Seats on a scope: every current seat for the whole contract, or the
 * product's own seats when product-scoped — the resolver's rule.
 */
export function seatsForScope(
  seats: readonly ScopeSeat[],
  productId: number | null,
): ScopeSeat[] {
  return productId === null
    ? [...seats]
    : seats.filter((seat) => seat.productId === productId);
}

/**
 * Unique active seat holders as employee targets; unlinked seats are counted
 * separately. The catalog's Users category is the org's active employees, so
 * a holder missing from it has departed, is on leave, or was deleted — the
 * seat outlives the employment. Those holders are left out rather than
 * carried on the seat's own name: they are exactly who the picker refuses,
 * and the shortcut that adds them is labelled "active users".
 */
export function seatHolderTargets(
  seats: readonly ScopeSeat[],
  catalog: readonly PickerCategory[],
): { holders: AllocationTargetRef[]; unlinkedCount: number } {
  const known = new Map<number, AllocationTargetRef>();
  for (const category of catalog) {
    if (category.key !== 'user') continue;
    for (const item of category.items) known.set(item.target.id, item.target);
  }
  const holders = new Map<number, AllocationTargetRef>();
  let unlinkedCount = 0;
  for (const seat of seats) {
    if (seat.employeeId === null) {
      unlinkedCount++;
      continue;
    }
    if (holders.has(seat.employeeId)) continue;
    const target = known.get(seat.employeeId);
    if (target === undefined) continue;
    holders.set(seat.employeeId, target);
  }
  return {
    holders: [...holders.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, target]) => target),
    unlinkedCount,
  };
}

/** The live active_users split as editor lines, mirroring the resolver's equal split over linked seats. */
export function activeUsersPreview(
  seats: readonly ScopeSeat[],
  catalog: readonly PickerCategory[],
): { lines: EditorLine[]; unlinkedCount: number } {
  const { holders, unlinkedCount } = seatHolderTargets(seats, catalog);
  return {
    lines: applyEqualSplit(holders.map((target) => ({ target, percent: 0 }))),
    unlinkedCount,
  };
}
