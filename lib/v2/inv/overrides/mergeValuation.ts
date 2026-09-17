/**
 * Override-aware recompute of v_inv_company_valuation derived fields.
 *
 * The view computes my_fmv, multiple (MOIC), aggregate_cost, realized
 * proceeds, last/entry transaction data in SQL from source rows, so a value
 * override on an input (snapshot or transaction column) cannot reach those
 * figures by patching the view row alone — they must be re-derived here,
 * mirroring the view's formulas exactly:
 *
 * - my_fmv         = cs.our_fd_ownership_percent * cs.implied_valuation
 * - aggregate_cost = pos.total_cost when the company is Active, else 0
 *                    (NULL — no position group at all — stays NULL)
 * - multiple       = my_fmv / aggregate_cost when it is > 0, else NULL
 *
 * v_inv_position groups inv_transaction by (fund, security, currency) —
 * INNER JOINs drop rows without fund/security — and per group:
 *   total_cost        = COALESCE(-(sum(amount) over purchase-type txs), 0)
 *   realized_proceeds = COALESCE(sum(amount) over sale-type txs, 0)
 * Every group counts: cost is gross capital deployed, so a group whose units
 * net negative (fully transferred out or written off) still contributes the
 * capital it consumed. The valuation view then sums those per
 * company (NULL when the company has no group at all) and zeroes the sum for
 * any company whose inv_company.status is not 'active' — an exited company
 * reports 0 cost and therefore a NULL multiple. `status` is `string | null`
 * here; NULL counts as non-active, exactly as `ic.status = 'active'` is
 * false for NULL in SQL. entry_date/entry_amount come from the earliest
 * 'purchase' transaction with no fund/security requirement.
 *
 * Keep these formulas in sync with the v_inv_company_valuation /
 * v_inv_position migrations.
 *
 * Known limitations (documented, accepted for v1): stage display fields
 * derived from transaction dates are not re-derived, and JS float sums may
 * differ from SQL numeric sums in the last ulps.
 */

import {
  POSITION_COST_TRANSACTION_TYPES,
  POSITION_PROCEEDS_TRANSACTION_TYPES,
} from '../stage-utils';
import type { InvCompanyValuation } from '../types';

import {
  applyOverrides,
  type AppliedOverrideMeta,
  type OverrideMetadataByEntity,
  type ValueOverrideRow,
} from './applyOverrides';

/** Mirrors the transaction_type buckets in v_inv_position. */
const POSITION_COST_TYPES: ReadonlySet<string> = new Set(
  POSITION_COST_TRANSACTION_TYPES,
);
const POSITION_PROCEEDS_TYPES: ReadonlySet<string> = new Set(
  POSITION_PROCEEDS_TRANSACTION_TYPES,
);

/** Latest cap table snapshot columns the valuation view derives from. */
export interface ValuationSnapshotRow {
  id: number;
  implied_valuation: number | null;
  share_price: number | null;
  our_fd_ownership_percent: number | null;
  our_total_shares: number | null;
}

/** inv_transaction columns needed to mirror v_inv_position aggregates. */
export interface PositionTransactionRow {
  id: number;
  fund_id: number | null;
  security_id: number | null;
  currency: string | null;
  transaction_type: string;
  transaction_date: string | null;
  units: number | null;
  amount: number | null;
}

export interface TransactionAggregates {
  aggregateCost: number | null;
  realizedProceeds: number | null;
  lastTransactionDate: string | null;
  entryDate: string | null;
  entryAmount: number | null;
}

/**
 * Which valuation fields reflect an override, for badges and tooltips.
 * `fields` maps props backed 1:1 by an overridden column to that override's
 * lineage; `recomputed` lists derived props re-calculated because an
 * overridden input feeds them (their lineage is the inputs' overrides).
 */
export interface ValuationOverrides {
  fields: Partial<Record<keyof InvCompanyValuation, AppliedOverrideMeta>>;
  recomputed: (keyof InvCompanyValuation)[];
}

export interface MergeValuationInput {
  valuation: InvCompanyValuation;
  /** Latest snapshot for the company; null when unavailable/not fetched. */
  snapshot: ValuationSnapshotRow | null;
  /** ALL of the company's transactions; null when not fetched. */
  transactions: readonly PositionTransactionRow[] | null;
  overrides: readonly ValueOverrideRow[];
}

export interface MergeValuationResult {
  valuation: InvCompanyValuation;
  overridden: ValuationOverrides;
}

interface PositionGroup {
  costSum: number;
  proceedsSum: number;
  lastDate: string | null;
}

function getOrCreateGroup(
  groups: Map<string, PositionGroup>,
  key: string,
): PositionGroup {
  const existing = groups.get(key);
  if (existing) return existing;
  const created: PositionGroup = {
    costSum: 0,
    proceedsSum: 0,
    lastDate: null,
  };
  groups.set(key, created);
  return created;
}

function accumulatePositionRow(
  group: PositionGroup,
  row: PositionTransactionRow,
): void {
  if (row.amount != null && POSITION_COST_TYPES.has(row.transaction_type)) {
    group.costSum += row.amount;
  }
  if (row.amount != null && POSITION_PROCEEDS_TYPES.has(row.transaction_type)) {
    group.proceedsSum += row.amount;
  }
  if (row.transaction_date == null) return;
  if (group.lastDate === null || row.transaction_date > group.lastDate) {
    group.lastDate = row.transaction_date;
  }
}

function buildPositionGroups(
  rows: readonly PositionTransactionRow[],
): Map<string, PositionGroup> {
  const groups = new Map<string, PositionGroup>();
  for (const row of rows) {
    // v_inv_position INNER JOINs inv_fund and inv_security
    if (row.fund_id == null || row.security_id == null) continue;
    const key =
      row.fund_id + ':' + row.security_id + ':' + (row.currency ?? '');
    accumulatePositionRow(getOrCreateGroup(groups, key), row);
  }
  return groups;
}

/** ORDER BY transaction_date ASC NULLS LAST — is `candidate` earlier? */
function isEarlierPurchase(
  candidate: PositionTransactionRow,
  current: PositionTransactionRow | null,
): boolean {
  if (current === null) return true;
  if (candidate.transaction_date == null) return false;
  if (current.transaction_date == null) return true;
  return candidate.transaction_date < current.transaction_date;
}

/** entry_tx lateral: earliest 'purchase', no fund/security requirement. */
function findEntryPurchase(
  rows: readonly PositionTransactionRow[],
): PositionTransactionRow | null {
  let entry: PositionTransactionRow | null = null;
  for (const row of rows) {
    if (row.transaction_type !== 'purchase') continue;
    if (isEarlierPurchase(row, entry)) entry = row;
  }
  return entry;
}

/**
 * Re-derive the transaction aggregates of v_inv_company_valuation in TS.
 * Exported for tests; see module doc for the mirrored SQL semantics.
 */
export function computeTransactionAggregates(
  rows: readonly PositionTransactionRow[],
): TransactionAggregates {
  let aggregateCost: number | null = null;
  let realizedProceeds: number | null = null;
  let lastTransactionDate: string | null = null;
  for (const group of buildPositionGroups(rows).values()) {
    aggregateCost = (aggregateCost ?? 0) - group.costSum;
    realizedProceeds = (realizedProceeds ?? 0) + group.proceedsSum;
    if (group.lastDate === null) continue;
    if (lastTransactionDate === null || group.lastDate > lastTransactionDate) {
      lastTransactionDate = group.lastDate;
    }
  }

  const entry = findEntryPurchase(rows);
  return {
    aggregateCost,
    realizedProceeds,
    lastTransactionDate,
    entryDate: entry?.transaction_date ?? null,
    entryAmount: entry?.amount ?? null,
  };
}

interface MergeAccumulator {
  merged: InvCompanyValuation;
  fields: ValuationOverrides['fields'];
  recomputed: Set<keyof InvCompanyValuation>;
}

/** my_fmv = our_fd_ownership_percent * implied_valuation (NULL propagates) */
function computeMyFmv(snapshot: ValuationSnapshotRow): number | null {
  if (snapshot.our_fd_ownership_percent == null) return null;
  if (snapshot.implied_valuation == null) return null;
  return snapshot.our_fd_ownership_percent * snapshot.implied_valuation;
}

/** multiple = my_fmv / total_cost when total_cost > 0, else NULL */
function computeMultiple(
  myFmv: number | null,
  aggregateCost: number | null,
): number | null {
  if (aggregateCost == null || aggregateCost <= 0) return null;
  if (myFmv == null) return null;
  return myFmv / aggregateCost;
}

function applyDirectSnapshotFields(
  acc: MergeAccumulator,
  snapMerged: ValuationSnapshotRow,
  snapMeta: Record<string, AppliedOverrideMeta>,
): void {
  if (snapMeta.implied_valuation) {
    acc.merged.postMoneyValuation = snapMerged.implied_valuation;
    acc.fields.postMoneyValuation = snapMeta.implied_valuation;
  }
  if (snapMeta.share_price) {
    acc.merged.currentPriceUnit = snapMerged.share_price;
    acc.fields.currentPriceUnit = snapMeta.share_price;
  }
  if (snapMeta.our_total_shares) {
    acc.merged.myUnits = snapMerged.our_total_shares;
    acc.fields.myUnits = snapMeta.our_total_shares;
  }
  if (snapMeta.our_fd_ownership_percent) {
    acc.merged.myFdPct = snapMerged.our_fd_ownership_percent;
    acc.merged.ownershipPct = snapMerged.our_fd_ownership_percent;
    acc.fields.myFdPct = snapMeta.our_fd_ownership_percent;
    acc.fields.ownershipPct = snapMeta.our_fd_ownership_percent;
  }
}

function applySnapshotOverrides(
  acc: MergeAccumulator,
  snapshot: ValuationSnapshotRow | null,
  overrides: readonly ValueOverrideRow[],
): void {
  if (!snapshot) return;
  const { rows, overridden } = applyOverrides(
    'inv_cap_table_snapshot',
    [snapshot],
    overrides,
  );
  const snapMeta = overridden[snapshot.id];
  if (!snapMeta) return;

  const snapMerged = rows[0];
  applyDirectSnapshotFields(acc, snapMerged, snapMeta);
  if (snapMeta.implied_valuation || snapMeta.our_fd_ownership_percent) {
    acc.merged.myFmv = computeMyFmv(snapMerged);
    acc.recomputed.add('myFmv');
  }
}

function collectOverriddenColumns(
  overridden: OverrideMetadataByEntity,
): Set<string> {
  const columns = new Set<string>();
  for (const metaByField of Object.values(overridden)) {
    Object.keys(metaByField).forEach((column) => columns.add(column));
  }
  return columns;
}

/**
 * aggregate_cost is 0 for any company that is not Active, mirroring the
 * CASE in v_inv_company_valuation. NULL (no position group) stays NULL.
 */
function zeroCostWhenNotActive(acc: MergeAccumulator): void {
  if (acc.merged.status === 'active') return;
  if (acc.merged.aggregateCost == null) return;
  acc.merged.aggregateCost = 0;
}

function applyTransactionAggregates(
  acc: MergeAccumulator,
  aggregates: TransactionAggregates,
  overriddenColumns: ReadonlySet<string>,
): void {
  const amountChanged = overriddenColumns.has('amount');
  const dateChanged = overriddenColumns.has('transaction_date');

  // Units feed no aggregate: every position group counts regardless of its
  // unit sum, so only amount moves cost/proceeds and only the date moves the
  // date.
  if (amountChanged) {
    acc.merged.aggregateCost = aggregates.aggregateCost;
    acc.merged.realizedProceeds = aggregates.realizedProceeds;
    zeroCostWhenNotActive(acc);
    acc.recomputed.add('aggregateCost');
    acc.recomputed.add('realizedProceeds');
  }
  if (dateChanged) {
    acc.merged.lastTransactionDate = aggregates.lastTransactionDate;
    acc.recomputed.add('lastTransactionDate');
  }
  // Entry fields are raw pass-throughs of the earliest purchase, so an
  // exact diff avoids false "recomputed" marks when the entry transaction
  // itself was not the one overridden.
  if (dateChanged && aggregates.entryDate !== acc.merged.entryDate) {
    acc.merged.entryDate = aggregates.entryDate;
    acc.recomputed.add('entryDate');
  }
  if (
    (amountChanged || dateChanged) &&
    aggregates.entryAmount !== acc.merged.entryAmount
  ) {
    acc.merged.entryAmount = aggregates.entryAmount;
    acc.recomputed.add('entryAmount');
  }
}

function applyTransactionOverrides(
  acc: MergeAccumulator,
  transactions: readonly PositionTransactionRow[] | null,
  overrides: readonly ValueOverrideRow[],
): void {
  if (!transactions || transactions.length === 0) return;
  const { rows, overridden } = applyOverrides(
    'inv_transaction',
    transactions,
    overrides,
  );
  const overriddenColumns = collectOverriddenColumns(overridden);
  if (overriddenColumns.size === 0) return;
  applyTransactionAggregates(
    acc,
    computeTransactionAggregates(rows),
    overriddenColumns,
  );
}

/**
 * Merge active overrides into a valuation row, re-deriving every computed
 * field whose inputs were overridden. Pure: inputs are not mutated. Fields
 * whose inputs carry no applicable override keep the view's values exactly
 * (no precision drift on the no-override path).
 */
export function mergeValuationOverrides(
  input: MergeValuationInput,
): MergeValuationResult {
  const acc: MergeAccumulator = {
    merged: { ...input.valuation },
    fields: {},
    recomputed: new Set(),
  };

  applySnapshotOverrides(acc, input.snapshot, input.overrides);
  applyTransactionOverrides(acc, input.transactions, input.overrides);

  if (acc.recomputed.has('myFmv') || acc.recomputed.has('aggregateCost')) {
    acc.merged.multiple = computeMultiple(
      acc.merged.myFmv,
      acc.merged.aggregateCost,
    );
    acc.recomputed.add('multiple');
  }

  return {
    valuation: acc.merged,
    overridden: { fields: acc.fields, recomputed: [...acc.recomputed] },
  };
}
