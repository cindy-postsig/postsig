import type { OrgUnitLevel } from './levels';

export interface OrgUnitNode {
  id: number;
  level: OrgUnitLevel;
  name: string;
  parent_id: number | null;
}

export interface OrgUnitTree {
  roots: OrgUnitNode[];
  childrenByParentId: Map<number, OrgUnitNode[]>;
}

/** Cost centers are flat codes orthogonal to the org chart; they never join the tree. */
export function buildOrgUnitTree(nodes: OrgUnitNode[]): OrgUnitTree {
  const roots: OrgUnitNode[] = [];
  const childrenByParentId = new Map<number, OrgUnitNode[]>();
  for (const node of nodes) {
    if (node.level === 'cost_center') continue;
    if (node.parent_id === null) {
      roots.push(node);
      continue;
    }
    const siblings = childrenByParentId.get(node.parent_id);
    if (siblings) siblings.push(node);
    else childrenByParentId.set(node.parent_id, [node]);
  }
  return { roots, childrenByParentId };
}

/** Active means status 'active' only; on_leave and departed employees are inactive. */
export function isActiveEmployee(employee: {
  status: string;
  deleted_at: string | null;
}): boolean {
  return employee.deleted_at === null && employee.status === 'active';
}

export function countActiveLeafAssignments(
  employees: {
    org_unit_id: number | null;
    status: string;
    deleted_at: string | null;
  }[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const employee of employees) {
    if (employee.org_unit_id === null) continue;
    if (!isActiveEmployee(employee)) continue;
    counts.set(
      employee.org_unit_id,
      (counts.get(employee.org_unit_id) ?? 0) + 1,
    );
  }
  return counts;
}

/**
 * For every node, the business-group node on its path: itself when it is one,
 * else the nearest `business_group` ancestor. Nodes with none are absent.
 */
export function mapNodeToBusinessGroup(
  nodes: OrgUnitNode[],
): Map<number, { id: number; name: string }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = new Map<number, { id: number; name: string }>();
  for (const node of nodes) {
    // Visited guard: the parent FK cannot express acyclicity, so a corrupt
    // chain must terminate the walk rather than hang it.
    const visited = new Set<number>();
    let current: OrgUnitNode | undefined = node;
    while (current && !visited.has(current.id)) {
      if (current.level === 'business_group') {
        result.set(node.id, { id: current.id, name: current.name });
        break;
      }
      visited.add(current.id);
      current =
        current.parent_id === null ? undefined : byId.get(current.parent_id);
    }
  }
  return result;
}

/**
 * A node is stale when no active employee resolves to it or any descendant.
 * Derived at read time, never stored: the sync is upsert-only, so a renamed or
 * re-pathed unit leaves its old node behind and this is how readers spot it.
 */
export function getStaleNodeIds(
  nodes: OrgUnitNode[],
  activeCountByNodeId: ReadonlyMap<number, number>,
): Set<number> {
  const childIdsByParentId = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parent_id === null) continue;
    const childIds = childIdsByParentId.get(node.parent_id);
    if (childIds) childIds.push(node.id);
    else childIdsByParentId.set(node.parent_id, [node.id]);
  }

  const subtreeHasActive = new Map<number, boolean>();
  const inProgress = new Set<number>();
  const visit = (id: number): boolean => {
    const memo = subtreeHasActive.get(id);
    if (memo !== undefined) return memo;
    // Same guard as mapNodeToBusinessGroup: a corrupt parent chain must
    // terminate the walk rather than recurse until the stack overflows. A
    // back-edge counts as active so a cycle is never flagged stale on the
    // strength of corrupt data.
    if (inProgress.has(id)) return true;
    inProgress.add(id);
    let hasActive = (activeCountByNodeId.get(id) ?? 0) > 0;
    for (const childId of childIdsByParentId.get(id) ?? []) {
      hasActive = visit(childId) || hasActive;
    }
    inProgress.delete(id);
    subtreeHasActive.set(id, hasActive);
    return hasActive;
  };

  const stale = new Set<number>();
  for (const node of nodes) {
    if (!visit(node.id)) stale.add(node.id);
  }
  return stale;
}
