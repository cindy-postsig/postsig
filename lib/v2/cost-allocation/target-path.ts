import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import type { AllocationTargetRef } from './types';

/** Node names root-first, ending at the node itself; empty for an unknown id. */
export function orgUnitPath(
  unitId: number,
  unitsById: ReadonlyMap<number, OrgUnitNode>,
): string[] {
  const names: string[] = [];
  const visited = new Set<number>();
  let current = unitsById.get(unitId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current =
      current.parent_id === null ? undefined : unitsById.get(current.parent_id);
  }
  return names;
}

/** Parent names nearest-first, joined for display; '' for a root. */
export function parentPath(
  node: OrgUnitNode,
  unitsById: ReadonlyMap<number, OrgUnitNode>,
): string {
  const names: string[] = [];
  const visited = new Set<number>([node.id]);
  let parentId = node.parent_id;
  while (parentId !== null && !visited.has(parentId)) {
    const parent = unitsById.get(parentId);
    if (!parent) break;
    visited.add(parent.id);
    names.push(parent.name);
    parentId = parent.parent_id;
  }
  return names.join(' · ');
}

/**
 * The parent path of every node whose name another node at the same level
 * shares (decision Q3), keyed by id and absent for the rest. Identity is the
 * path, so two nodes can share a level and a name only on different branches
 * — the parents are what tell them apart, and every surface that prints a
 * node's name shows this beside it, muted.
 */
export function sharedNameBreadcrumbs(
  units: readonly OrgUnitNode[],
  unitsById: ReadonlyMap<number, OrgUnitNode>,
): Map<number, string> {
  const identity = (unit: OrgUnitNode) => `${unit.level}:${unit.name}`;
  const counts = new Map<string, number>();
  for (const unit of units) {
    counts.set(identity(unit), (counts.get(identity(unit)) ?? 0) + 1);
  }
  const breadcrumbs = new Map<number, string>();
  for (const unit of units) {
    if ((counts.get(identity(unit)) ?? 0) > 1) {
      breadcrumbs.set(unit.id, parentPath(unit, unitsById));
    }
  }
  return breadcrumbs;
}

/**
 * Breadcrumb for a target: a unit's own path, or the path of the unit an
 * employee sits under (empty for an employee outside the tree). Cost centers
 * are flat, so their path is the single name.
 */
export function targetPath(
  target: AllocationTargetRef,
  unitsById: ReadonlyMap<number, OrgUnitNode>,
): string[] {
  if (target.kind === 'org_unit') return orgUnitPath(target.id, unitsById);
  return target.orgUnitId === null
    ? []
    : orgUnitPath(target.orgUnitId, unitsById);
}
