import type { ContractTableRow } from '@/lib/v2/core/types';
import type { RelationshipEdge } from '@/lib/v2/spend';
import { isArchivedStatus } from '@/lib/contracts/lineageNodes';
import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';
import logger from '@/utils/pino';

/**
 * Guards against a pathological chain in malformed data. Real lineage is
 * MSA → SO → amendment, so anything approaching this is a bug upstream.
 */
const MAX_LINEAGE_DEPTH = 32;

export interface NestByLineageResult {
  /** Rows with no visible parent, each carrying its descendants in `subRows`. */
  roots: ContractTableRow[];
  /** Ids re-parented under another row — callers that flatten must not double-count. */
  nestedIds: ReadonlySet<string>;
}

const rowKey = (row: ContractTableRow): string =>
  String(row.contract_id ?? row.id);

/** Earliest of two ISO dates, ignoring blanks. */
function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

/**
 * Nest a flat set of contract rows into a lineage forest.
 *
 * Three invariants, each load-bearing:
 *
 * - **Every input row appears exactly once.** `useReactTable` is configured
 *   with `getRowId: row => String(row.id)`, so a contract emitted twice would
 *   collide on row id and tie the two copies' selection and expansion state
 *   together. This is why a contract belonging to several chains is placed in
 *   one of them rather than shown under each.
 * - **Cycles are tolerated, never thrown on.** `contract_relationships` has no
 *   acyclicity constraint — the invariants migration enforces same-org and
 *   related-vendor only — so one bad edge must not take down the whole list.
 * - **An edge counts only when both endpoints are present.** A child whose
 *   parent was filtered out, or which the user cannot see, becomes a root.
 *   That is the permission fail-safe, and it is why no separate accessibility
 *   filter is needed here.
 */
export function nestContractRowsByLineage(
  rows: readonly ContractTableRow[],
  edges: readonly RelationshipEdge[],
): NestByLineageResult {
  if (rows.length === 0) return { roots: [], nestedIds: new Set() };

  const byKey = new Map(rows.map((row) => [rowKey(row), row]));

  const childToParent = new Map<string, string>();
  const parentToChildren = new Map<string, string[]>();

  for (const edge of edges) {
    // A child keeps its FIRST parent (below), and the fetch has no ORDER BY,
    // so an unfiltered billing edge would nest an invoice under whichever of
    // its parents Postgres happened to return first — non-deterministically,
    // and under a contract that does not structurally own it.
    if (!isHierarchyEdge(edge)) continue;
    if (edge.parent_contract_id == null || edge.child_contract_id == null) {
      continue;
    }
    const parent = String(edge.parent_contract_id);
    const child = String(edge.child_contract_id);

    // Both endpoints must be loaded, and a child keeps its first parent so a
    // diamond resolves deterministically instead of duplicating the row.
    if (!byKey.has(parent) || !byKey.has(child)) continue;
    if (parent === child || childToParent.has(child)) continue;

    childToParent.set(child, parent);
    const siblings = parentToChildren.get(parent);
    if (siblings) siblings.push(child);
    else parentToChildren.set(parent, [child]);
  }

  if (childToParent.size === 0) {
    return { roots: [...rows], nestedIds: new Set() };
  }

  // Siblings read chronologically, archived last — the same ordering the
  // contract-detail sidebar uses, so the two views agree.
  const sortSiblings = (keys: string[]): string[] =>
    [...keys].sort((a, b) => {
      const left = byKey.get(a) as ContractTableRow;
      const right = byKey.get(b) as ContractTableRow;

      const archived =
        Number(isArchivedStatus(left.status)) -
        Number(isArchivedStatus(right.status));
      if (archived !== 0) return archived;

      const byDate = (left.termStartDate ?? '').localeCompare(
        right.termStartDate ?? '',
      );
      return byDate !== 0 ? byDate : a.localeCompare(b);
    });

  const visited = new Set<string>();

  /** Depth-first with an explicit guard; a revisited node is dropped, not followed. */
  const build = (key: string, depth: number): ContractTableRow => {
    visited.add(key);
    const row = byKey.get(key) as ContractTableRow;

    const childKeys = (parentToChildren.get(key) ?? []).filter(
      (childKey) => !visited.has(childKey),
    );

    if (childKeys.length === 0 || depth >= MAX_LINEAGE_DEPTH) {
      if (depth >= MAX_LINEAGE_DEPTH && childKeys.length > 0) {
        logger.warn(
          { contractId: key, depth },
          'Lineage nesting hit the depth cap; descendants omitted',
        );
      }
      return { ...row, lineageDepth: depth, isLineageChild: depth > 0 };
    }

    const children = sortSiblings(childKeys).map((childKey) =>
      build(childKey, depth + 1),
    );

    let earliestEnd = row.termEndDate ?? null;
    let earliestCancel = row.cancelByDate ?? null;
    for (const child of children) {
      earliestEnd = earlier(
        earliestEnd,
        child.subtreeEarliestTermEndDate ?? child.termEndDate ?? null,
      );
      earliestCancel = earlier(
        earliestCancel,
        child.subtreeEarliestCancelByDate ?? child.cancelByDate ?? null,
      );
    }

    return {
      ...row,
      lineageDepth: depth,
      isLineageChild: depth > 0,
      hasLineageChildren: true,
      subtreeEarliestTermEndDate: earliestEnd,
      subtreeEarliestCancelByDate: earliestCancel,
      // Lineage children replace product sub-rows: `subRows` is typed as a
      // union of arrays, not an array of unions, so the two cannot mix. The
      // product cell still summarises as "Name +N".
      subRows: children,
    };
  };

  const roots: ContractTableRow[] = [];
  for (const row of rows) {
    const key = rowKey(row);
    if (childToParent.has(key) || visited.has(key)) continue;
    roots.push(build(key, 0));
  }

  // Anything still unvisited is unreachable from a root — a pure cycle, or the
  // tail of a chain cut off by the depth cap. Emit it as a root so the
  // "exactly once" invariant holds even for malformed data.
  for (const row of rows) {
    const key = rowKey(row);
    if (visited.has(key)) continue;
    logger.warn(
      { contractId: key },
      'Contract lineage is unreachable from any root (cycle or depth cap); rendering at top level',
    );
    roots.push(build(key, 0));
  }

  const nestedIds = new Set(childToParent.keys());
  return { roots, nestedIds };
}
