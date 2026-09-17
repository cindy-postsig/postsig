import type { ContractTableRow } from '@/lib/v2/core/types';
import { matchesAllActiveFiltersForRow } from '@/components/ui/data-table/utils/filterUtils';
import { isLeafDetailRow } from '@/components/contracts/rowTypeGuards';

type ActiveFilter = { id: string; value: unknown };

/**
 * Prune a row tree to the rows that survive the active filters.
 *
 * Kept out of the table component so it can be tested directly, and made
 * depth-first because lineage nesting means a match can sit arbitrarily deep.
 * A node is kept when it matches **or any descendant matches** — pruning an
 * ancestor whose descendant matched would make that descendant unreachable,
 * which is the failure this exists to prevent.
 */
export function pruneRowsByFilters(
  rows: readonly ContractTableRow[],
  activeFilters: readonly ActiveFilter[],
): ContractTableRow[] {
  if (activeFilters.length === 0) return [...rows];

  const prune = (row: ContractTableRow): ContractTableRow | null => {
    const children = (row.subRows ?? []) as ContractTableRow[];

    const keptChildren = children
      .map((child) =>
        isLeafDetailRow({ original: child }) ? child : prune(child),
      )
      .filter((child): child is ContractTableRow => child !== null);

    const selfMatches = matchesAllActiveFiltersForRow(row, [...activeFilters]);

    // A vendor group is scaffolding: it survives only for its children, and
    // collapses to the single child when just one is left. A real contract
    // keeps its own identity and its own subtree, so it is never flattened.
    if (row.isGroup) {
      if (keptChildren.length === 0) return null;
      if (keptChildren.length === 1) return keptChildren[0];
      return { ...row, subRows: keptChildren };
    }

    // Leaf children are always kept wholesale, so a kept non-leaf child is
    // exactly a genuine descendant match surviving `prune` above.
    const hasMatchingDescendant = keptChildren.some(
      (child) => !isLeafDetailRow({ original: child }),
    );
    if (!selfMatches && !hasMatchingDescendant) return null;
    return keptChildren.length === children.length
      ? row
      : { ...row, subRows: keptChildren };
  };

  return rows
    .map((row) => prune(row))
    .filter((row): row is ContractTableRow => row !== null);
}
