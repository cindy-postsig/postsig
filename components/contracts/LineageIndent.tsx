import type { Row } from '@tanstack/react-table';
import type { ContractTableRow } from '@/lib/v2/core/types';

/**
 * Tree connectors for a contract nested inside a lineage chain.
 *
 * Drawn in the vendor column rather than the expander gutter: inside a vendor
 * group the vendor name is constant, so that column is where the space and the
 * reader's attention already are. The gutter is ~40px; this is ~400px, which
 * is what lets the structure read.
 */

/** Horizontal distance between nesting levels. */
const STEP_PX = 16;

/** Centres a 2px line within the step. */
const RAIL_LEFT = STEP_PX / 2 - 1;

/**
 * Bleeds a rail through the cell's vertical padding (`p-3`) so it reaches the
 * row boundary and meets the rail above it. Table rows are flat siblings in a
 * `<tbody>`, so there is no per-subtree container to draw a continuous rail
 * against — each row draws its own and they join at the seam.
 */
const BLEED = '-0.75rem';

/** `compact` rows use `py-2`, so their rails have less padding to escape. */
const COMPACT_BLEED = '-0.5rem';

export type TreeGuides = {
  /** Outermost first: whether an ancestor's rail continues past this row. */
  rails: boolean[];
  /** Last among its siblings, so its own rail stops at this row. */
  isLast: boolean;
};

/**
 * Derive every row's connectors from the flat list the table actually renders.
 *
 * Deliberately not computed from `getParentRow().subRows`: that resolves
 * against the core row model, so it reports sibling order *before* sorting and
 * before collapsed rows are removed — which makes some middle row terminate
 * its rail while the real last row keeps going. Walking the rendered list
 * backwards is the only source that always agrees with what is painted.
 */
export function buildLineageGuides(
  rows: readonly Row<ContractTableRow>[],
): Map<string, TreeGuides> {
  const guides = new Map<string, TreeGuides>();

  // hasFollowing[d] — scanning from the bottom, is there a later row at depth
  // d still inside the subtree we are in?
  const hasFollowing: boolean[] = [];

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const depth = row.depth;

    // A top-level row closes everything below it: the next group starts fresh.
    if (depth === 0) {
      hasFollowing.length = 0;
      continue;
    }

    // Moving up a level closes every deeper subtree.
    hasFollowing.length = depth + 1;

    const rails: boolean[] = [];
    for (let level = 1; level < depth; level += 1) {
      rails.push(Boolean(hasFollowing[level]));
    }

    guides.set(row.id, { rails, isLast: !hasFollowing[depth] });
    hasFollowing[depth] = true;
  }

  return guides;
}

// The rendered row array is stable for a render pass, so keying the cache on
// it lets every cell share one computation without any prop plumbing.
const guidesCache = new WeakMap<object, Map<string, TreeGuides>>();

export function lineageGuidesFor(
  rows: readonly Row<ContractTableRow>[],
): Map<string, TreeGuides> {
  const cached = guidesCache.get(rows);
  if (cached) return cached;

  const built = buildLineageGuides(rows);
  guidesCache.set(rows, built);
  return built;
}

export function LineageIndent({
  rails,
  isLast,
  compact = false,
}: TreeGuides & { compact?: boolean }) {
  const ownLeft = rails.length * STEP_PX + RAIL_LEFT;
  const bleed = compact ? COMPACT_BLEED : BLEED;

  return (
    <span
      className="pointer-events-none relative block shrink-0 self-stretch"
      style={{ width: (rails.length + 1) * STEP_PX }}
      aria-hidden
    >
      {rails.map((continues, level) =>
        continues ? (
          <span
            key={level}
            className="absolute w-0.5 bg-muted-foreground/25"
            style={{
              left: level * STEP_PX + RAIL_LEFT,
              top: bleed,
              bottom: bleed,
            }}
          />
        ) : null,
      )}

      {/* Down to the midpoint, then right. A last child stops there; anything
          else carries its rail on to the next sibling. */}
      <span
        className="absolute w-0.5 bg-muted-foreground/40"
        style={{
          left: ownLeft,
          top: bleed,
          ...(isLast
            ? { height: `calc(50% + ${compact ? '0.5rem' : '0.75rem'})` }
            : { bottom: bleed }),
        }}
      />
      <span
        className="absolute h-0.5 rounded-full bg-muted-foreground/40"
        style={{
          left: ownLeft,
          top: 'calc(50% - 1px)',
          width: STEP_PX / 2 + 4,
        }}
      />
    </span>
  );
}
