import type { CostMethod } from '@/components/budget/costMethod';
import {
  ORG_UNIT_TREE_LEVELS,
  type OrgUnitLevel,
  type OrgUnitTreeLevel,
} from '@/lib/v2/org-units/levels';
import {
  buildOrgUnitTree,
  countActiveLeafAssignments,
  getStaleNodeIds,
  type OrgUnitNode,
} from '@/lib/v2/org-units/tree';
import { UNASSIGNED_KEY } from '@/lib/v2/spend/allocation';
import {
  PICKER_CATEGORY_LABELS,
  TARGET_TYPE_LABELS,
  activeCostCenterNames,
  type PickerEmployee,
} from './picker';
import type { ReportPeriod, ReportWindow } from './report-window';
import { rollupToLevel } from './resolver';
import { orgUnitPath, sharedNameBreadcrumbs } from './target-path';
import type { AllocationEmployee, AllocationTargetRef } from './types';

// Row shapes and the pure builder behind the Cost Allocation Summary. Kept
// free of data-layer imports so the report's client component can bundle it;
// the loader that runs the engine lives in rollup-report.ts.

export type RollupViewKey = OrgUnitTreeLevel | 'cost_center' | 'user';

export const ROLLUP_VIEW_LABELS: Record<RollupViewKey, string> =
  PICKER_CATEGORY_LABELS;

export const OUTSIDE_HIERARCHY_LABEL = 'Outside hierarchy';
export const UNASSIGNED_LABEL = 'Unassigned';
export const UNRESOLVED_TARGET_LABEL = 'Unresolved allocations';

export interface RollupTarget {
  kind: 'org_unit' | 'employee';
  id: number;
}

export interface RollupRow {
  /** The engine's allocation key: `unit:<id>` / `user:<id>`. */
  key: string;
  name: string;
  level: RollupViewKey;
  levelLabel: string;
  /** Root-first breadcrumb ending at the row itself; a single name for flat rows. */
  path: string[];
  /** Parent path, nearest first; present only when another node at the level shares the name (decision Q3). */
  breadcrumb?: string;
  /** Tree children: sub-units by name, then the unit's own people by name; empty for cost centers and users. */
  childKeys: string[];
  target: RollupTarget;
  /** The row's own budget over the window's fiscal years; null = none set. */
  budget: number | null;
  /** Sum of every descendant's own budget. */
  rolledUpBudget: number;
  direct: number;
  rollup: number;
  total: number;
  /** budget − total; null without a budget. */
  difference: number | null;
  stale: boolean;
}

export interface OutsideHierarchyRow {
  key: string;
  name: string;
  amount: number;
  /** What kind of target this is, as the picker names it. Absent on the
      synthetic unresolved row, which stands for no target at all. */
  levelLabel?: string;
}

export interface RollupView {
  key: RollupViewKey;
  label: string;
  rootKeys: string[];
  /** Spend this view cannot place on any of its rows (§Reports, Q2/Q2b). */
  outsideHierarchy: number;
  outsideHierarchyRows: OutsideHierarchyRow[];
  /** The engine's bucket for contracts with no allocation; identical in every view. */
  unassigned: number;
  /** Every budget under the view's roots, counted once. */
  budgetTotal: number;
  /** Roots + both catch-alls: the same number in every view. */
  spendTotal: number;
}

export interface AllocationRollupRows {
  rows: Record<string, RollupRow>;
  views: RollupView[];
}

export interface UnallocatedContractRow {
  id: number;
  vendor: string | null;
  vendorDomain: string;
  /** The contract's order number, or its type and id when it has none. */
  name: string;
  /** The live product the row leads with; '' when the contract has none. */
  product: string;
  products: { id: number; name: string }[];
  /** Earliest term start and latest term end, ISO; null when the contract states none. */
  termStart: string | null;
  termEnd: string | null;
  /** The window's spend for this contract; null when it books nothing in it. */
  amount: number | null;
}

export interface AllocationRollupData extends AllocationRollupRows {
  period: ReportPeriod;
  window: ReportWindow;
  custom: { from: string; to: string } | null;
  costMethod: CostMethod;
  fiscalYears: number[];
  /** The one FY inline edits write to; null (budgets read-only) when the window spans several. */
  budgetFiscalYear: number | null;
  /** The dashboard's Projected Spend (the engine's nextFY total); carried by the Current FY preset only. */
  projected: number | null;
  /**
   * The estimated price step, in percent, applied to Bloomberg seat renewals
   * in these figures, so the page can say part of them is an estimate; null
   * when the org has no seats in the population.
   */
  bloombergSeatRenewalIncreasePercent: number | null;
  /**
   * Contracts the engine books entirely to `unassigned` — the resolver's
   * verdict, so membership is window-independent and a contract inheriting an
   * allocated ancestor is not one of them.
   *
   * These rows do not add up to a view's Unassigned bucket, and are not meant
   * to: a product-scoped contract with one unallocated product keeps that
   * product's spend in the bucket without being listed here, and an invoice
   * record's spend lands in the bucket while the list names contracts only.
   */
  unallocatedContracts: UnallocatedContractRow[];
}

export interface RollupBuildInput {
  /** The engine's allocation dimension at level 'user': one total per explicit target key, plus `unassigned`. */
  targetTotals: ReadonlyMap<string, number>;
  unitsById: ReadonlyMap<number, OrgUnitNode>;
  employeesById: ReadonlyMap<number, AllocationEmployee>;
  levelOrder: readonly OrgUnitTreeLevel[];
  /** Non-deleted employees with status: the stale derivation and the Users view. */
  employees: readonly PickerEmployee[];
  /** Each target's budget over the window's fiscal years (budgetsByTargetKey). */
  budgetByKey: ReadonlyMap<string, number>;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

const byName = <T extends { name: string }>(a: T, b: T): number =>
  a.name.localeCompare(b.name);

interface Target {
  key: string;
  ref: AllocationTargetRef;
  amount: number;
}

function targetRef(
  key: string,
  input: RollupBuildInput,
): AllocationTargetRef | null {
  const [kind, rawId] = key.split(':');
  const id = Number(rawId);
  if (kind === 'unit') {
    const unit = input.unitsById.get(id);
    return unit ? { kind: 'org_unit', id, name: unit.name } : null;
  }
  if (kind === 'user') {
    const employee = input.employeesById.get(id);
    return employee
      ? {
          kind: 'employee',
          id,
          name: employee.name,
          orgUnitId: employee.org_unit_id,
          costCenterUnitId: employee.cost_center_unit_id,
        }
      : null;
  }
  return null;
}

/** targetKey → the node at `level` it lands on, per rollupToLevel; absent when it lands nowhere at that level. */
type Attribution = Map<string, { nodeKey: string; direct: boolean }>;

function attributeAtLevel(
  targets: readonly Target[],
  level: OrgUnitLevel,
  unitsById: ReadonlyMap<number, OrgUnitNode>,
): Attribution {
  const routed = rollupToLevel(
    targets.map((target) => ({ target: target.ref, percent: 100 })),
    level,
    unitsById,
  );
  const attribution: Attribution = new Map();
  routed.forEach((line, index) => {
    if (line.target === null) return;
    attribution.set(targets[index].key, {
      nodeKey: `unit:${line.target.id}`,
      direct: line.direct,
    });
  });
  return attribution;
}

/**
 * Every view's rows and catch-alls from one set of per-target engine totals.
 * A node's direct/rollup figures are view-independent — they are what
 * rollupToLevel attributes to it at its own level — so a department reads the
 * same whether it is a root of the Departments view or expanded under its
 * entity. Only the roots and the "Outside hierarchy" remainder change per
 * view, which is what makes every view's grand total the same number.
 */
export function buildAllocationRollup(
  input: RollupBuildInput,
): AllocationRollupRows {
  const units = [...input.unitsById.values()];
  const treeNodes = units.filter((unit) => unit.level !== 'cost_center');
  const tree = buildOrgUnitTree(units);
  const breadcrumbs = sharedNameBreadcrumbs(units, input.unitsById);

  const targets: Target[] = [];
  let unassigned = 0;
  // A key the context no longer resolves (an allocation written between the
  // engine's load and ours) keeps its money in "Outside hierarchy" rather
  // than vanishing from the total.
  let unresolvable = 0;
  for (const [key, amount] of input.targetTotals) {
    if (key === UNASSIGNED_KEY) {
      unassigned += amount;
      continue;
    }
    const ref = targetRef(key, input);
    if (ref) targets.push({ key, ref, amount });
    else unresolvable += amount;
  }

  const levelsWithNodes = new Set<OrgUnitLevel>(units.map((u) => u.level));
  const attributionByLevel = new Map<OrgUnitLevel, Attribution>();
  for (const level of [...ORG_UNIT_TREE_LEVELS, 'cost_center'] as const) {
    if (!levelsWithNodes.has(level)) continue;
    attributionByLevel.set(
      level,
      attributeAtLevel(targets, level, input.unitsById),
    );
  }

  const spendByNode = new Map<string, { direct: number; rollup: number }>();
  for (const attribution of attributionByLevel.values()) {
    for (const target of targets) {
      const landed = attribution.get(target.key);
      if (!landed) continue;
      const spend = spendByNode.get(landed.nodeKey) ?? { direct: 0, rollup: 0 };
      if (landed.direct) spend.direct += target.amount;
      else spend.rollup += target.amount;
      spendByNode.set(landed.nodeKey, spend);
    }
  }

  const staleTreeIds = getStaleNodeIds(
    treeNodes,
    countActiveLeafAssignments([...input.employees]),
  );
  const activeCostCenters = activeCostCenterNames(input.employees);

  const rows: Record<string, RollupRow> = {};
  const rowFor = (
    key: string,
    name: string,
    level: RollupViewKey,
    path: string[],
    childKeys: string[],
    target: RollupTarget,
    stale: boolean,
  ): RollupRow => {
    const spend = spendByNode.get(key) ?? { direct: 0, rollup: 0 };
    const budget = input.budgetByKey.get(key) ?? null;
    const total = cents(spend.direct + spend.rollup);
    return {
      key,
      name,
      level,
      levelLabel: TARGET_TYPE_LABELS[level],
      path,
      childKeys,
      target,
      budget,
      rolledUpBudget: 0,
      direct: cents(spend.direct),
      rollup: cents(spend.rollup),
      total,
      difference: budget === null ? null : cents(budget - total),
      stale,
    };
  };

  for (const unit of units) {
    const key = `unit:${unit.id}`;
    const children = [...(tree.childrenByParentId.get(unit.id) ?? [])].sort(
      byName,
    );
    rows[key] = rowFor(
      key,
      unit.name,
      unit.level,
      orgUnitPath(unit.id, input.unitsById),
      children.map((child) => `unit:${child.id}`),
      { kind: 'org_unit', id: unit.id },
      unit.level === 'cost_center'
        ? !activeCostCenters.has(unit.name)
        : staleTreeIds.has(unit.id),
    );
    const breadcrumb = breadcrumbs.get(unit.id);
    if (breadcrumb) rows[key].breadcrumb = breadcrumb;
  }

  // Individual User is the tree's bottom level (the prototype's LEVEL_ORDER):
  // active employees, plus any inactive one carrying spend or a budget, each
  // nested under the unit the roster assigns them to. A user row's spend is
  // the employee's own explicit lines and nothing else — its unit already
  // counts them as rollup, so the nesting adds no money to any total.
  const activeEmployeeIds = new Set(
    input.employees
      .filter((e) => e.deleted_at === null && e.status === 'active')
      .map((e) => e.id),
  );
  const userIds = new Set<number>(activeEmployeeIds);
  for (const target of targets) {
    if (target.ref.kind === 'employee') userIds.add(target.ref.id);
  }
  for (const key of input.budgetByKey.keys()) {
    if (key.startsWith('user:')) userIds.add(Number(key.slice(5)));
  }
  const amountByKey = new Map(targets.map((t) => [t.key, t.amount]));
  const userRows: { row: RollupRow; unitKey: string | null }[] = [];
  for (const id of userIds) {
    const employee = input.employeesById.get(id);
    if (!employee) continue;
    const key = `user:${id}`;
    spendByNode.set(key, { direct: amountByKey.get(key) ?? 0, rollup: 0 });
    const unitKey =
      employee.org_unit_id !== null && rows[`unit:${employee.org_unit_id}`]
        ? `unit:${employee.org_unit_id}`
        : null;
    const row = rowFor(
      key,
      employee.name,
      'user',
      unitKey ? [...rows[unitKey].path, employee.name] : [employee.name],
      [],
      { kind: 'employee', id },
      !activeEmployeeIds.has(id),
    );
    userRows.push({ row, unitKey });
  }
  // Sub-units first, then the people directly in the unit, each by name.
  const userRowKeys: string[] = [];
  for (const { row, unitKey } of userRows.sort((a, b) =>
    byName(a.row, b.row),
  )) {
    rows[row.key] = row;
    userRowKeys.push(row.key);
    if (unitKey) rows[unitKey].childKeys.push(row.key);
  }

  const rolledUpBudgetMemo = new Map<string, number>();
  const rolledUpBudget = (key: string, visiting: Set<string>): number => {
    const memo = rolledUpBudgetMemo.get(key);
    if (memo !== undefined) return memo;
    // Visited guard: the parent FK cannot express acyclicity, so a corrupt
    // chain must terminate the walk rather than hang it.
    if (visiting.has(key)) return 0;
    visiting.add(key);
    let sum = 0;
    for (const childKey of rows[key].childKeys) {
      sum += (rows[childKey].budget ?? 0) + rolledUpBudget(childKey, visiting);
    }
    rolledUpBudgetMemo.set(key, sum);
    return sum;
  };
  for (const key of Object.keys(rows)) {
    rows[key].rolledUpBudget = cents(rolledUpBudget(key, new Set()));
  }

  const treeLevelsInUse = input.levelOrder.filter((level) =>
    levelsWithNodes.has(level),
  );

  /**
   * The bucket mixes kinds by construction — a cost center sits beside an
   * entity beside a person — so each row says which it is. A unit whose node
   * the context no longer resolves gets no label rather than a wrong one.
   */
  const outsideTargetLabel = (ref: AllocationTargetRef): string | undefined => {
    if (ref.kind === 'employee') return TARGET_TYPE_LABELS.user;
    const level = input.unitsById.get(ref.id)?.level;
    return level ? TARGET_TYPE_LABELS[level] : undefined;
  };

  const viewFor = (
    key: RollupViewKey,
    rootKeys: string[],
    placed: (target: Target) => boolean,
  ): RollupView => {
    let outsideHierarchy = unresolvable;
    const outsideHierarchyRows: OutsideHierarchyRow[] = [];
    for (const target of targets) {
      if (placed(target)) continue;
      outsideHierarchy += target.amount;
      outsideHierarchyRows.push({
        key: target.key,
        name: target.ref.name,
        amount: cents(target.amount),
        levelLabel: outsideTargetLabel(target.ref),
      });
    }
    outsideHierarchyRows.sort(byName);
    if (unresolvable !== 0) {
      outsideHierarchyRows.push({
        key: 'unresolved',
        name: UNRESOLVED_TARGET_LABEL,
        amount: cents(unresolvable),
      });
    }
    let budgetTotal = 0;
    let rootSpend = 0;
    for (const rootKey of rootKeys) {
      const row = rows[rootKey];
      budgetTotal += (row.budget ?? 0) + row.rolledUpBudget;
      rootSpend += row.total;
    }
    return {
      key,
      label: ROLLUP_VIEW_LABELS[key],
      rootKeys,
      outsideHierarchy: cents(outsideHierarchy),
      outsideHierarchyRows,
      unassigned: cents(unassigned),
      budgetTotal: cents(budgetTotal),
      spendTotal: cents(rootSpend + outsideHierarchy + unassigned),
    };
  };

  // Name first, then the breadcrumb, so same-named roots sit together in the
  // order of the parents that tell them apart.
  const byNameThenBreadcrumb = (a: OrgUnitNode, b: OrgUnitNode): number =>
    byName(a, b) ||
    (breadcrumbs.get(a.id) ?? '').localeCompare(breadcrumbs.get(b.id) ?? '');
  const nodeRootKeys = (level: OrgUnitLevel): string[] =>
    units
      .filter((unit) => unit.level === level)
      .sort(byNameThenBreadcrumb)
      .map((unit) => `unit:${unit.id}`);

  const views: RollupView[] = [];
  for (const level of treeLevelsInUse) {
    const attribution = attributionByLevel.get(level);
    views.push(
      viewFor(level, nodeRootKeys(level), (target) =>
        Boolean(attribution?.has(target.key)),
      ),
    );
  }
  if (levelsWithNodes.has('cost_center')) {
    const attribution = attributionByLevel.get('cost_center');
    views.push(
      viewFor('cost_center', nodeRootKeys('cost_center'), (target) =>
        Boolean(attribution?.has(target.key)),
      ),
    );
  }
  if (userRowKeys.length > 0) {
    views.push(
      viewFor('user', userRowKeys, (target) => target.ref.kind === 'employee'),
    );
  }

  return { rows, views };
}

/**
 * A saved budget edit applied to already-built rows — the pure client-side
 * mirror of rebuilding with the changed budget, so the report never re-runs
 * the engine for a number spend does not depend on. Updates the row's budget
 * and difference, every ancestor's rolled-up budget, and each view's budget
 * total; spend figures are untouched. The rebuild-parity test pins the
 * equivalence.
 */
export function applyBudgetEdit(
  data: AllocationRollupRows,
  key: string,
  amount: number | null,
): AllocationRollupRows {
  const edited = data.rows[key];
  if (!edited || edited.budget === amount) return data;

  const rows: Record<string, RollupRow> = {
    ...data.rows,
    [key]: {
      ...edited,
      budget: amount,
      difference: amount === null ? null : cents(amount - edited.total),
    },
  };

  const delta = (amount ?? 0) - (edited.budget ?? 0);
  const parentByKey = new Map<string, string>();
  for (const [rowKey, row] of Object.entries(data.rows)) {
    for (const childKey of row.childKeys) parentByKey.set(childKey, rowKey);
  }
  // Visited guard: the parent FK cannot express acyclicity, so a corrupt
  // chain must terminate the walk rather than hang it.
  const visited = new Set([key]);
  let parentKey = parentByKey.get(key);
  while (parentKey !== undefined && !visited.has(parentKey)) {
    visited.add(parentKey);
    const parent = rows[parentKey];
    rows[parentKey] = {
      ...parent,
      rolledUpBudget: cents(parent.rolledUpBudget + delta),
    };
    parentKey = parentByKey.get(parentKey);
  }

  const views = data.views.map((view) => {
    let budgetTotal = 0;
    for (const rootKey of view.rootKeys) {
      const root = rows[rootKey];
      budgetTotal += (root.budget ?? 0) + root.rolledUpBudget;
    }
    return { ...view, budgetTotal: cents(budgetTotal) };
  });

  return { rows, views };
}

export interface RollupDisplayRow {
  row: RollupRow;
  depth: number;
}

/** Depth-first rows under the view's roots, descending only where `isExpanded` allows. */
export function flattenRollupView(
  rows: Readonly<Record<string, RollupRow>>,
  rootKeys: readonly string[],
  isExpanded: (key: string) => boolean = () => true,
): RollupDisplayRow[] {
  const out: RollupDisplayRow[] = [];
  const visit = (key: string, depth: number, seen: Set<string>) => {
    const row = rows[key];
    if (!row || seen.has(key)) return;
    seen.add(key);
    out.push({ row, depth });
    if (!isExpanded(key)) return;
    for (const childKey of row.childKeys) visit(childKey, depth + 1, seen);
  };
  for (const rootKey of rootKeys) visit(rootKey, 0, new Set());
  return out;
}

/**
 * Rows whose name contains `query`, once each and across every view — the
 * searcher need not know which level a name lives at. Node figures are
 * view-independent, so a match reads the same here as in its own tree. The
 * catch-alls are per-view figures rather than rows, so nothing can match them.
 */
export function searchRollupRows(
  rows: Readonly<Record<string, RollupRow>>,
  query: string,
): RollupRow[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  return Object.values(rows)
    .filter((row) => row.name.toLowerCase().includes(needle))
    .sort(byName);
}

/**
 * A single view with nothing to expand (§Fallback matrix: D1, or one level
 * with nobody assigned): the report renders as a flat list without the
 * rollup columns or the slicer.
 */
export function isFlatRollup(data: AllocationRollupRows): boolean {
  if (data.views.length !== 1) return false;
  const [view] = data.views;
  return (
    view.key !== 'cost_center' &&
    view.rootKeys.every((key) => data.rows[key].childKeys.length === 0)
  );
}
