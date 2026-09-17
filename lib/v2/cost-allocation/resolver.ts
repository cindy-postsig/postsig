import type { OrgUnitLevel, OrgUnitNode } from '@/lib/v2/org-units';
import type {
  AllocationContext,
  AllocationEmployee,
  AllocationLineRow,
  AllocationRow,
  AllocationTargetRef,
  ResolvedContractAllocation,
  ResolvedLine,
  ResolvedScope,
  RolledUpLine,
} from './types';

function requireEmployee(
  employeeId: number,
  ctx: AllocationContext,
): AllocationEmployee {
  const employee = ctx.employeesById.get(employeeId);
  if (!employee) {
    throw new Error(`Employee ${employeeId} missing from allocation context`);
  }
  return employee;
}

function employeeRef(
  employeeId: number,
  ctx: AllocationContext,
): AllocationTargetRef {
  const employee = requireEmployee(employeeId, ctx);
  return {
    kind: 'employee',
    id: employee.id,
    name: employee.name,
    orgUnitId: employee.org_unit_id,
    costCenterUnitId: employee.cost_center_unit_id,
  };
}

function toTargetRef(
  line: AllocationLineRow,
  ctx: AllocationContext,
): AllocationTargetRef {
  if (line.org_unit_id !== null) {
    const unit = ctx.unitsById.get(line.org_unit_id);
    if (!unit) {
      throw new Error(
        `Org unit ${line.org_unit_id} missing from allocation context`,
      );
    }
    return { kind: 'org_unit', id: unit.id, name: unit.name };
  }
  if (line.org_employee_id === null) {
    throw new Error(`Allocation line ${line.id} has no target`);
  }
  return employeeRef(line.org_employee_id, ctx);
}

/**
 * Live equal split over the source contract's current linked seats, per
 * product when the scope is product-scoped. Unlinked legacy seats (no
 * org_employee_id) cannot be targets; they are excluded and counted so the
 * tab can surface them. Zero linked seats leaves the scope empty — the
 * consumer routes it to the engine's `unassigned` bucket.
 *
 * A seat outlives the employment — nothing releases a departed employee's
 * seats — so an inactive holder is excluded too: "active users" is the
 * employee's status, the same rule the picker offers targets by.
 */
function resolveActiveUsers(
  sourceContractId: number,
  productId: number | null,
  ctx: AllocationContext,
): Pick<ResolvedScope, 'lines' | 'unlinkedUserCount'> {
  const seats = ctx.seatsByContractId.get(sourceContractId) ?? [];
  const relevant =
    productId === null
      ? seats
      : seats.filter((seat) => seat.product_id === productId);

  const linkedIds = new Set<number>();
  let unlinkedUserCount = 0;
  for (const seat of relevant) {
    if (seat.org_employee_id === null) {
      unlinkedUserCount++;
      continue;
    }
    if (!requireEmployee(seat.org_employee_id, ctx).active) continue;
    linkedIds.add(seat.org_employee_id);
  }

  const orderedIds = [...linkedIds].sort((a, b) => a - b);
  const percent = orderedIds.length > 0 ? 100 / orderedIds.length : 0;
  const lines: ResolvedLine[] = orderedIds.map((id) => ({
    target: employeeRef(id, ctx),
    percent,
  }));
  return { lines, unlinkedUserCount };
}

function resolveScope(
  row: AllocationRow,
  ctx: AllocationContext,
): ResolvedScope {
  if (row.mode === 'manual') {
    const lines = (ctx.linesByAllocationId.get(row.id) ?? []).map((line) => ({
      target: toTargetRef(line, ctx),
      percent: line.percent,
    }));
    return {
      productId: row.product_id,
      mode: row.mode,
      sourceContractId: row.contract_id,
      lines,
      unlinkedUserCount: 0,
    };
  }
  return {
    productId: row.product_id,
    mode: row.mode,
    sourceContractId: row.contract_id,
    ...resolveActiveUsers(row.contract_id, row.product_id, ctx),
  };
}

/**
 * Nearest allocated ancestor (decision Q7), starting at the contract itself:
 * own rows win, and an override on a middle amendment flows to later records
 * instead of being skipped by a root-only rule. The walk runs over
 * `HierarchyMap.parents`, which already excludes billing edges and resolves a
 * multi-parent child to its lowest-numbered parent. A contract replaced
 * through contract_lineage_events has no relationship edge, so it never
 * inherits.
 */
function nearestAllocatedContractId(
  contractId: number,
  ctx: AllocationContext,
): number | null {
  let currentId = contractId;
  const visited = new Set<number>();
  for (;;) {
    if (visited.has(currentId)) {
      throw new Error(
        `Cycle detected in parent chain at contract ID ${currentId}`,
      );
    }
    visited.add(currentId);
    if ((ctx.allocationsByContractId.get(currentId)?.length ?? 0) > 0) {
      return currentId;
    }
    const parentId = ctx.hierarchy.parents.get(currentId);
    if (parentId === undefined) return null;
    currentId = parentId;
  }
}

/**
 * Pure over the context — no queries, no engine coupling. The nearest
 * allocated contract resolves as a unit: all of its scopes (whole-contract, or
 * one per vendor_products.id) apply to the descendant, so product-scoped
 * allocations inherit by product id. A contract whose resolution yields no
 * scopes is unassigned.
 */
export function resolveAllocations(
  contracts: { id: number }[],
  ctx: AllocationContext,
): Map<number, ResolvedContractAllocation> {
  const resolved = new Map<number, ResolvedContractAllocation>();
  for (const contract of contracts) {
    if (resolved.has(contract.id)) continue;
    const sourceId = nearestAllocatedContractId(contract.id, ctx);
    const rows =
      sourceId === null
        ? []
        : (ctx.allocationsByContractId.get(sourceId) ?? []);
    resolved.set(contract.id, {
      contractId: contract.id,
      scopes: rows.map((row) => resolveScope(row, ctx)),
    });
  }
  return resolved;
}

/**
 * The engine's unassigned rule (spend/pipeline.ts, `case 'allocation'`) as a
 * per-contract predicate: every cent this contract books lands in the
 * `unassigned` bucket, in every view.
 *
 * A whole-contract scope decides on its own — the engine prefers it over any
 * product scope — and is unassigned when it resolved no lines, which is what
 * an `active_users` scope with no linked active seat leaves behind
 * (allocationShares merges nothing and returns the 100% unassigned share).
 * Product scopes are unassigned only when not one of them resolved a line.
 *
 * Lines rather than allocationShares, because a share is level-dependent: a
 * line above the level, or off the tree, lands nowhere and merges into
 * `unassigned` there while still being spend on a target at level 'user'. No
 * lines is the one state that is unassigned at every level.
 */
export function isFullyUnallocated(
  resolved: ResolvedContractAllocation | undefined,
): boolean {
  const scopes = resolved?.scopes ?? [];
  if (scopes.length === 0) return true;
  const whole = scopes.find((scope) => scope.productId === null);
  if (whole) return whole.lines.length === 0;
  return scopes.every((scope) => scope.lines.length === 0);
}

/**
 * Walk each line's target up to its ancestor at `level`; an EmployeeRef starts
 * at the employee's org_unit_id. A target at the level is direct spend there;
 * one below it rolls up (direct false). A target that reaches no node at that
 * level lands nowhere and resolves to null — a target above the level, a
 * ragged branch, a cost center (flat, parentless), an employee outside the
 * tree. It is the caller's decision what that means: money routes it to
 * `unassigned` so no cents move, a label leaves it out. Naming the original
 * target at the wrong level was the earlier rule; it put people in the
 * Business Group column.
 *
 * `cost_center` is the one non-tree level (decision Q2b): an employee line
 * starts at the flat node matching the employee's cost_center value and rolls
 * there; a CC-targeted line is direct on its node; a tree-node line, or an
 * employee with no cost-center value, lands nowhere.
 */
export function rollupToLevel(
  lines: ResolvedLine[],
  level: OrgUnitLevel,
  unitsById: ReadonlyMap<number, OrgUnitNode>,
): RolledUpLine[] {
  return lines.map((line) => {
    let startNodeId: number | null;
    if (line.target.kind === 'employee') {
      startNodeId =
        level === 'cost_center'
          ? (line.target.costCenterUnitId ?? null)
          : line.target.orgUnitId;
    } else {
      startNodeId = line.target.id;
    }
    if (startNodeId === null) {
      return { target: null, percent: line.percent, direct: false };
    }

    const start = unitsById.get(startNodeId);
    if (!start) {
      throw new Error(`Org unit ${startNodeId} missing from rollup tree`);
    }

    // Visited guard: the parent FK cannot express acyclicity, so a corrupt
    // chain must terminate the walk rather than hang it.
    const visited = new Set<number>();
    let current: OrgUnitNode | undefined = start;
    let found: OrgUnitNode | undefined;
    while (current && !visited.has(current.id)) {
      if (current.level === level) {
        found = current;
        break;
      }
      visited.add(current.id);
      current =
        current.parent_id === null
          ? undefined
          : unitsById.get(current.parent_id);
    }

    if (!found) {
      return { target: null, percent: line.percent, direct: false };
    }
    return {
      target: { kind: 'org_unit', id: found.id, name: found.name },
      percent: line.percent,
      direct: line.target.kind === 'org_unit' && found.id === line.target.id,
    };
  });
}
