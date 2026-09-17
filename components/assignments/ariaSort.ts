import type { SortDirection } from '@tanstack/react-table';

/**
 * The shared column headers render a button, not the `<th>`, so each table
 * puts the sort state on the cell itself for assistive tech.
 */
export function ariaSort(
  sorted: false | SortDirection,
): 'ascending' | 'descending' | undefined {
  if (sorted === 'asc') return 'ascending';
  if (sorted === 'desc') return 'descending';
  return undefined;
}
