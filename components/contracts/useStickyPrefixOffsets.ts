'use client';

import * as React from 'react';

/**
 * Left offsets, in pixels, for each pinned column.
 *
 * Measured rather than hard-coded: `vendor` is `w-1/4 min-w-[300px]`,
 * `select`/`expander` carry no width at all, the table font size changes at
 * the `3xl` breakpoint, `compact` swaps the cell padding, and the expander
 * widens when lineage nesting is on. Any fixed `left-*` would be wrong in at
 * least one of those.
 *
 * Returns an empty array when nothing is pinned.
 */
export function useStickyPrefixOffsets(
  containerRef: React.RefObject<HTMLElement | null>,
  count: number,
): number[] {
  const [offsets, setOffsets] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (count <= 0) {
      setOffsets((current) => (current.length === 0 ? current : []));
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const cells = Array.from(
        container.querySelectorAll<HTMLElement>('thead th'),
      ).slice(0, count);
      if (cells.length === 0) return;

      const next: number[] = [];
      let running = 0;
      for (const cell of cells) {
        next.push(running);
        running += cell.offsetWidth;
      }

      // Bail out when nothing moved — setting a fresh array every measurement
      // would re-render, which would re-measure, forever.
      setOffsets((current) =>
        current.length === next.length &&
        current.every((value, index) => value === next[index])
          ? current
          : next,
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container
      .querySelectorAll<HTMLElement>('thead th')
      .forEach((cell) => observer.observe(cell));

    return () => observer.disconnect();
  }, [containerRef, count]);

  return offsets;
}
