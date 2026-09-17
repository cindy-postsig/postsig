import type { OrgUnitLevel } from './levels';

// Refinement identity (design doc §Schema, amendment 2026-08-25): two nodes
// at the same level with the same name are the same target when one's path
// refines the other's — every node of the shorter path appears, in order, on
// the longer one. "Research under Markets" and "Research under Markets → BU"
// are one department whose path got more precise; "Research" under two
// different BUs is two departments. Pure over loaded nodes so the sync walk
// and the merge script share one rule.

export interface RefinementNode {
  id: number;
  level: OrgUnitLevel;
  name: string;
  parent_id: number | null;
}

export interface RefinementLookup {
  byId: ReadonlyMap<number, RefinementNode>;
  byLevelName: ReadonlyMap<string, readonly RefinementNode[]>;
}

export function levelNameKey(level: OrgUnitLevel, name: string): string {
  return `${level}\0${name}`;
}

export function buildRefinementLookup(
  nodes: readonly RefinementNode[],
): RefinementLookup {
  const byId = new Map<number, RefinementNode>();
  const byLevelName = new Map<string, RefinementNode[]>();
  for (const node of nodes) {
    byId.set(node.id, node);
    const key = levelNameKey(node.level, node.name);
    const group = byLevelName.get(key);
    if (group) group.push(node);
    else byLevelName.set(key, [node]);
  }
  return { byId, byLevelName };
}

/** Proper ancestors of `id`, nearest first; cycle-guarded. */
function ancestorIds(
  id: number | null,
  byId: ReadonlyMap<number, RefinementNode>,
): Set<number> {
  const ancestors = new Set<number>();
  let current = id === null ? undefined : byId.get(id);
  while (current) {
    if (ancestors.has(current.id)) break;
    ancestors.add(current.id);
    current =
      current.parent_id === null ? undefined : byId.get(current.parent_id);
  }
  return ancestors;
}

export type RefinementMatch =
  /** An existing node on a more precise path: use it as the step's node. */
  | { kind: 'attach'; node: RefinementNode }
  /** An existing node on a less precise path: move it under the step's parent, then use it. */
  | { kind: 'reparent'; node: RefinementNode };

/**
 * Same-target lookup for a walk step `(parentId, level, name)` with no
 * exact-path node. A candidate matches when its path and the step's path
 * refine each other — deeper (the step's parent is an ancestor of the
 * candidate) or shallower (the candidate's parent is an ancestor of the
 * step's parent, or the candidate is a root). Only an unambiguous single
 * candidate matches: two candidates mean the name is genuinely shared across
 * branches and path identity stands.
 *
 * A ROOT step matches only when `allowRootMatch` says the caller knows it is
 * imprecision rather than an explicit clear. Absence of every higher level is
 * ambiguous on its own: a business-group null override promotes the next level
 * to a root step and MUST keep path identity, or the clear silently re-attaches
 * the employee to the group they were moved out of. But a root step also
 * happens when an HR row simply left the higher levels blank, and refusing
 * those minted a second node for a group that already existed — one business
 * group per import order, splitting its headcount and its cost.
 * Only the walk can tell the two apart, so it decides. A root step's own path
 * is the node alone, so every same-(level, name) node on a longer path refines
 * it; the unique one is attached to.
 */
export function findRefinementMatch(
  lookup: RefinementLookup,
  parentId: number | null,
  level: OrgUnitLevel,
  name: string,
  allowRootMatch = false,
): RefinementMatch | null {
  const candidates = lookup.byLevelName.get(levelNameKey(level, name));
  if (!candidates || candidates.length === 0) return null;

  if (parentId === null) {
    if (!allowRootMatch) return null;
    // Nothing to walk: a positioned node is deeper than a root step by
    // construction. Two of them is the ambiguity rule again — the name is
    // shared across branches and path identity stands. A root candidate is
    // the exact-path node the caller already checked for.
    const deeper = candidates.filter(
      (candidate) => candidate.parent_id !== null,
    );
    return deeper.length === 1 ? { kind: 'attach', node: deeper[0] } : null;
  }

  const parentChain = ancestorIds(parentId, lookup.byId);
  const matches: RefinementMatch[] = [];
  for (const candidate of candidates) {
    if (candidate.parent_id === parentId) continue;
    // A candidate on the step's own ancestor chain can never be the same
    // target (a unit cannot contain itself), and re-parenting it would cycle.
    if (parentChain.has(candidate.id)) continue;

    const candidateChain = ancestorIds(candidate.parent_id, lookup.byId);
    if (candidateChain.has(parentId)) {
      matches.push({ kind: 'attach', node: candidate });
      continue;
    }
    if (candidate.parent_id === null || parentChain.has(candidate.parent_id)) {
      matches.push({ kind: 'reparent', node: candidate });
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

export interface RefinedNodeMerge {
  ghostId: number;
  survivorId: number;
}

/**
 * Pairs forked before refinement identity landed: for each node, the unique
 * same-(level, name) node on a path that refines its own. The shallower node
 * is the ghost; the deeper one survives. Chains (A refines B refines C) are
 * ambiguous for A in one pass and converge over repeated runs — the merge
 * script reports what remains. Cost centers are flat by construction and
 * never pair.
 *
 * Root ghosts are excluded by default: nothing on a stored node records
 * whether its missing levels were blank in the HR file or deliberately
 * cleared, and merging a cleared one would move an employee — and their
 * allocated cost — back into the group they were taken out of. Orgs forked
 * before the walk could match a root step opt in explicitly, after
 * reading the dry run.
 */
export function deriveRefinedNodeMerges(
  nodes: readonly RefinementNode[],
  includeRootGhosts = false,
): RefinedNodeMerge[] {
  // One shared lookup: a node can never match itself (same parent is the
  // exact-path case findRefinementMatch skips).
  const lookup = buildRefinementLookup(nodes);
  const merges: RefinedNodeMerge[] = [];
  for (const node of nodes) {
    if (node.level === 'cost_center') continue;
    const match = findRefinementMatch(
      lookup,
      node.parent_id,
      node.level,
      node.name,
      includeRootGhosts,
    );
    if (match?.kind === 'attach') {
      merges.push({ ghostId: node.id, survivorId: match.node.id });
    }
  }
  return merges;
}
