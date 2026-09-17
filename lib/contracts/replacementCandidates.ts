/**
 * Replacement candidate filter, stage 1 of detection.
 *
 * Vendors often issue a new contract on new paper instead of renewing the
 * existing one. This narrows a newly extracted contract's same-canonical-vendor
 * peers down to the ones plausibly *replaced* by it, so the expensive stage-2
 * LLM pair-check runs over a handful of pairs rather than the whole vendor.
 *
 * Precision beats recall: every criterion here excludes, none includes. The
 * classic false positive is independent per-seat SOs (Bloomberg/Salesforce),
 * which share vendor, window and product names — only stage 2 can tell those
 * apart, so this stage must not widen to compensate.
 *
 * Pure function, no I/O. Callers pass already-fetched rows.
 */

import { contractTypes } from '@/app/lib/constants';

/**
 * Types that can participate in a replacement — "the big 3". Invoices, TOS,
 * trial agreements and EA fee schedules never replace anything.
 *
 * Old and new deliberately need not match: Amendment→SO and Amendment→MSA are
 * both valid replacement shapes.
 */
export const REPLACEMENT_TYPE_IDS: readonly number[] = [
  contractTypes.MSA,
  contractTypes.SO,
  contractTypes.Addendum,
];

/** Days either side of the old contract's end date that count as "at renewal". */
const WINDOW_MONTHS = 1;

export interface ReplacementNewContract {
  contractId: number;
  typeId: number | null;
  /** Raw `contracts.term_start_date` — jsonb array of `{ date }`, or a string. */
  termStartDate?: unknown;
  productNames: string[];
}

export interface ReplacementOldContract {
  contractId: number;
  typeId: number | null;
  /** Raw `contracts.term_end_date` — jsonb array of `{ date }`, or a string. */
  termEndDate?: unknown;
  productNames: string[];
  /** `contracts.status`; only 'active' contracts are worth archiving. */
  status: string | null;
}

export interface ReplacementCandidate {
  oldContractId: number;
  /** Signed days from the old contract's end date to the new one's start. */
  dateDeltaDays: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * The old contract's term end — the LATEST date in the append-only
 * `term_end_date` history.
 *
 * Deliberately NOT `getOrderingDate` (productLineageResolution.ts), which reads
 * the LAST array element to pin chain ordering to the original term. Here the
 * question is "when does this contract actually run out", and an extension
 * appends a later end date; reading the original would make an extended
 * contract look replaceable a year early.
 */
export function getTermEndDate(termEndDate: unknown): Date | null {
  const raw = Array.isArray(termEndDate)
    ? termEndDate.map((entry) => (entry as { date?: unknown } | null)?.date)
    : [termEndDate];

  const times = raw
    .filter((d): d is string => typeof d === 'string' && d.trim() !== '')
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));

  return times.length > 0 ? new Date(Math.max(...times)) : null;
}

/**
 * The new contract's own date — the EARLIEST start in its history, i.e. when it
 * first took effect. That is the date compared against the old contract's end;
 * a later amendment to the new contract must not move it out of the window.
 */
export function getNewContractDate(termStartDate: unknown): Date | null {
  const raw = Array.isArray(termStartDate)
    ? termStartDate.map((entry) => (entry as { date?: unknown } | null)?.date)
    : [termStartDate];

  const times = raw
    .filter((d): d is string => typeof d === 'string' && d.trim() !== '')
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));

  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

/**
 * Is `date` within ±1 calendar month of `endDate`?
 *
 * Calendar months, not a fixed day count: a contract ending Jan 31 should
 * accept a Feb 28 replacement, which a 30-day window would miss. Boundary days
 * are inclusive — a contract dated exactly one month out is the common renewal
 * case, not an edge to exclude.
 */
export function isWithinRenewalWindow(date: Date, endDate: Date): boolean {
  const lower = shiftMonths(endDate, -WINDOW_MONTHS);
  const upper = shiftMonths(endDate, WINDOW_MONTHS);

  return date.getTime() >= lower.getTime() && date.getTime() <= upper.getTime();
}

/**
 * `date` shifted by `months`, clamping the day to the target month's last day.
 *
 * Bare `setMonth` overflows instead of clamping — one month before Mar 31 is
 * "Feb 31", which rolls forward to Mar 3 and shrinks the window to nothing.
 * Clamping makes that Feb 28/29, the boundary the ±1-month rule intends.
 */
function shiftMonths(date: Date, months: number): Date {
  const shifted = new Date(date);
  shifted.setDate(1);
  shifted.setMonth(shifted.getMonth() + months);

  const lastDay = new Date(
    shifted.getFullYear(),
    shifted.getMonth() + 1,
    0,
  ).getDate();
  shifted.setDate(Math.min(date.getDate(), lastDay));

  return shifted;
}

/** Whole days from `from` to `to`, signed and truncated toward zero. */
const dayDelta = (from: Date, to: Date): number =>
  Math.trunc((to.getTime() - from.getTime()) / MS_PER_DAY);

/**
 * Product names shared by both contracts, compared case-insensitively but
 * exactly otherwise. Fuzzy matching is deliberately out: near-miss names are
 * exactly where independent per-seat orders masquerade as renewals.
 */
export function matchProductNames(
  newNames: string[],
  oldNames: string[],
): string[] {
  const normalize = (name: string) => name.trim().toLowerCase();
  const newSet = new Set(
    newNames
      .filter((name) => typeof name === 'string' && name.trim() !== '')
      .map(normalize),
  );

  const matched = oldNames.filter(
    (name) =>
      typeof name === 'string' &&
      name.trim() !== '' &&
      newSet.has(normalize(name)),
  );

  return [...new Set(matched)];
}

const isReplacementType = (typeId: number | null): boolean =>
  typeId != null && REPLACEMENT_TYPE_IDS.includes(typeId);

export interface ReplacementCandidateInput {
  newContract: ReplacementNewContract;
  /** Same-canonical-vendor contracts, already scoped to the organization. */
  oldContracts: ReplacementOldContract[];
  /**
   * Contract ids reachable from the new contract over `contract_relationships`
   * edges (its own lineage chain, including itself). An amendment on the same
   * paper is normal lineage, not a replacement.
   */
  chainContractIds: ReadonlySet<number>;
  /**
   * `old_contract_id`s that already have a `contract_lineage_events` row paired
   * with this new contract, at ANY status. A rejection at either screening
   * stage permanently suppresses the pair, so rejected ids belong here too.
   */
  existingEventOldContractIds: ReadonlySet<number>;
}

/**
 * Old contracts this new contract might be replacing.
 *
 * Returns matched products and the date delta alongside each id so the caller
 * can record them as evidence without recomputing — and so the LLM prompt can
 * name the overlap it is being asked to adjudicate.
 */
export function findReplacementCandidates({
  newContract,
  oldContracts,
  chainContractIds,
  existingEventOldContractIds,
}: ReplacementCandidateInput): ReplacementCandidate[] {
  if (!isReplacementType(newContract.typeId)) return [];

  const newDate = getNewContractDate(newContract.termStartDate);
  // An undated new contract sits in no renewal window, so it replaces nothing.
  if (!newDate) return [];

  return oldContracts.flatMap((old) => {
    const candidate = evaluateCandidate(newContract, newDate, old, {
      chainContractIds,
      existingEventOldContractIds,
    });
    return candidate ? [candidate] : [];
  });
}

/** One old contract against the new one; null means "not a candidate". */
function evaluateCandidate(
  newContract: ReplacementNewContract,
  newDate: Date,
  old: ReplacementOldContract,
  sets: {
    chainContractIds: ReadonlySet<number>;
    existingEventOldContractIds: ReadonlySet<number>;
  },
): ReplacementCandidate | null {
  if (old.contractId === newContract.contractId) return null;
  if (!isReplacementType(old.typeId)) return null;
  // Only an active contract is worth prompting the customer to archive.
  if (old.status !== 'active') return null;
  // Same paper: an amendment of the new contract's own chain is lineage.
  if (sets.chainContractIds.has(old.contractId)) return null;
  // Any prior event — including a rejection — permanently settles the pair.
  if (sets.existingEventOldContractIds.has(old.contractId)) return null;

  // An undated old contract has no renewal window to fall inside.
  const endDate = getTermEndDate(old.termEndDate);
  if (!endDate) return null;

  return {
    oldContractId: old.contractId,
    dateDeltaDays: dayDelta(endDate, newDate),
  };
}
