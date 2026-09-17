/**
 * Sticky leading-column support for the contract tables.
 *
 * Pure module: no React, no DOM. The offset measurement that pairs with this
 * lives in `useStickyPrefixOffsets`.
 */

/**
 * Columns that may be pinned to the left edge, in the order they can appear.
 * Deliberately matched by position rather than by id alone — only a *leading
 * run* of these is pinned, so a table that starts with some other column pins
 * nothing.
 */
export const STICKY_PREFIX_IDS: ReadonlySet<string> = new Set([
  'select',
  'expander',
  'alerts',
  'vendor',
  'vendorAndProduct',
]);

/**
 * How many leading columns to pin.
 *
 * Counting a prefix rather than looking for `vendor` by id handles every
 * arrangement without special cases: `groupByVendor` (select, expander,
 * vendor), plain (vendor), the `vendorAndProduct` variant, and Inventory
 * (expander, alerts, vendor). A view whose first column isn't pinnable — or
 * one where the user has dragged something ahead of Vendor — yields 0 and
 * simply doesn't pin.
 */
export function stickyPrefixCount(columnIds: readonly string[]): number {
  let count = 0;
  for (const id of columnIds) {
    if (!STICKY_PREFIX_IDS.has(id)) break;
    count += 1;
  }
  return count;
}

export type RowTintState = {
  depth: number;
  isBanded: boolean;
  isProductSubRow: boolean;
  isInactive: boolean;
};

/**
 * Tint for a pinned body cell, as `before:` utilities.
 *
 * A sticky cell needs an opaque backdrop or the scrolled content shows
 * straight through it — but every row tint here is translucent by design, and
 * a `<tr>`'s background does not paint under a sticky `<td>`. So the cell
 * carries an opaque `bg-background` and the tint is painted over it by an
 * absolutely-positioned `::before` sitting at a negative z-index: inside the
 * cell's own stacking context that lands above the cell background and below
 * its content, which is exactly the layering a normal row produces.
 *
 * The values mirror the row classes in `ContractsTableClient`'s row renderer.
 * Hover and selection are handled by the caller through `group/row` variants,
 * matching the row's own behaviour of replacing the tint rather than blending.
 */
export function stickyCellTint(state: RowTintState): string {
  if (state.isProductSubRow) {
    return 'before:bg-gray-700/10 dark:before:bg-black/25';
  }
  if (state.isInactive) return 'before:bg-gray-700/10';
  if (state.depth === 0) {
    return state.isBanded ? 'before:bg-muted/40' : '';
  }
  return state.isBanded
    ? 'before:bg-muted/80 dark:before:bg-muted/70'
    : 'before:bg-muted/50 dark:before:bg-muted/40';
}

/**
 * Classes every pinned cell needs regardless of row state: the opaque backdrop
 * and the `::before` layer that `stickyCellTint` colours.
 */
export const STICKY_CELL_BASE =
  'sticky z-10 bg-background before:pointer-events-none before:absolute before:inset-0 before:-z-10';

/** Hover and selection follow the row, replacing the tint as they do normally. */
export const STICKY_CELL_STATE =
  'group-hover/row:before:bg-hover group-data-[state=selected]/row:before:bg-primary/7';
