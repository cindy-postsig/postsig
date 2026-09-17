import type { OrgUnitLevel } from '@/lib/v2/org-units/levels';
import type { AssignmentNode, ScopeKey } from './types';
import { FIRMWIDE } from './types';

// Subtree walks over the org_units tree. Nodes carry parent/child edges, so
// "in scope" is a descent from the selected node; Firmwide is every node.

/**
 * The node and every descendant, ids only. The parent FK cannot express
 * acyclicity, so a corrupt chain must terminate the walk rather than hang it —
 * the same visited guard `lib/v2/org-units/tree.ts` uses.
 */
export function descendantIds(
  nodes: Readonly<Record<number, AssignmentNode>>,
  unitId: number,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const stack = [unitId];
  while (stack.length > 0) {
    const id = stack.pop() as number;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes[id];
    if (!node) continue;
    out.push(id);
    stack.push(...node.childIds);
  }
  return out;
}

/** The org_employees.id set a scope covers: everyone whose leaf is in the subtree. */
export function employeeIdsInScope(
  nodes: Readonly<Record<number, AssignmentNode>>,
  scope: ScopeKey,
  allEmployeeIds: readonly number[],
): number[] {
  if (scope === FIRMWIDE) return [...allEmployeeIds];
  const ids: number[] = [];
  for (const unitId of descendantIds(nodes, scope)) {
    ids.push(...(nodes[unitId]?.memberIds ?? []));
  }
  return ids;
}

export interface UnitPath {
  /** Root-first names ending at the unit itself. */
  path: string[];
  /**
   * The same names keyed by level. HR paths are ragged — a unit can sit under
   * a Division and a Department but no Business Unit — so a column or filter
   * must look its level up by name, never by position in `path`.
   */
  pathByLevel: Partial<Record<OrgUnitLevel, string>>;
}

const emptyUnitPath = (): UnitPath => ({ path: [], pathByLevel: {} });

/**
 * Ancestry per unit, derived once from the parent edges the nodes already
 * carry. It is a property of the unit, so the payload ships it nowhere: a
 * per-person copy costs more than the whole tree does.
 */
export function unitPaths(
  nodes: Readonly<Record<number, AssignmentNode>>,
): ReadonlyMap<number, UnitPath> {
  const paths = new Map<number, UnitPath>();
  const resolve = (node: AssignmentNode, seen: Set<number>): UnitPath => {
    const memo = paths.get(node.id);
    if (memo) return memo;
    // A corrupt parent chain must terminate the walk rather than hang it.
    if (seen.has(node.id)) return emptyUnitPath();
    seen.add(node.id);
    const parent = node.parentId === null ? undefined : nodes[node.parentId];
    const above = parent ? resolve(parent, seen) : emptyUnitPath();
    const unitPath: UnitPath = {
      path: [...above.path, node.name],
      pathByLevel: { ...above.pathByLevel, [node.level]: node.name },
    };
    paths.set(node.id, unitPath);
    return unitPath;
  };
  for (const node of Object.values(nodes)) resolve(node, new Set());
  return paths;
}

/** The ancestry of one unit; empty for someone outside the tree. */
export function unitPathOf(
  paths: ReadonlyMap<number, UnitPath>,
  unitId: number | null,
): UnitPath {
  const found = unitId === null ? undefined : paths.get(unitId);
  return found ?? emptyUnitPath();
}

/** Root-first path of nodes from the top of the tree down to `unitId`, inclusive. */
export function scopePath(
  nodes: Readonly<Record<number, AssignmentNode>>,
  unitId: number,
): AssignmentNode[] {
  const path: AssignmentNode[] = [];
  const seen = new Set<number>();
  let current: AssignmentNode | undefined = nodes[unitId];
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId === null ? undefined : nodes[current.parentId];
  }
  return path;
}

/**
 * What the scope nav lists under the current scope: child units first, then
 * the node's own people. Making people the bottom level is what keeps the
 * KPI rollup additive — a parent equals the sum of its children only if its
 * directly-attached employees are children too, the rule the Cost Allocation
 * Summary settled on.
 */
export function childrenOfScope(
  nodes: Readonly<Record<number, AssignmentNode>>,
  scope: ScopeKey,
  rootIds: readonly number[],
  unplacedEmployeeIds: readonly number[] = [],
): { unitIds: number[]; memberIds: number[] } {
  // Firmwide's own people are the ones no node claims: without them the roots
  // would not sum to the whole org for an employee whose HR row has no levels.
  if (scope === FIRMWIDE) {
    return { unitIds: [...rootIds], memberIds: [...unplacedEmployeeIds] };
  }
  const node = nodes[scope];
  if (!node) return { unitIds: [], memberIds: [] };
  return { unitIds: [...node.childIds], memberIds: [...node.memberIds] };
}
