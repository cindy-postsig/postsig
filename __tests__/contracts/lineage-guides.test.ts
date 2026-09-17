import { buildLineageGuides } from '@/components/contracts/LineageIndent';
import type { Row } from '@tanstack/react-table';
import type { ContractTableRow } from '@/lib/v2/core/types';

/** The only two fields the guide algorithm reads off a rendered row. */
const rendered = (id: string, depth: number) =>
  ({ id, depth }) as Row<ContractTableRow>;

describe('buildLineageGuides', () => {
  it('terminates the rail on the last child and only the last child', () => {
    // The bug this exists for: guides derived from `getParentRow().subRows`
    // report pre-sort sibling order, so a middle row terminated its rail while
    // the genuinely last row kept going.
    const guides = buildLineageGuides([
      rendered('group', 0),
      rendered('a', 1),
      rendered('b', 1),
      rendered('c', 1),
    ]);

    expect(guides.get('a')?.isLast).toBe(false);
    expect(guides.get('b')?.isLast).toBe(false);
    expect(guides.get('c')?.isLast).toBe(true);
  });

  it('continues an ancestor rail only while that ancestor has a later sibling', () => {
    const guides = buildLineageGuides([
      rendered('group', 0),
      rendered('a', 1),
      rendered('a1', 2),
      rendered('b', 1),
      rendered('b1', 2),
    ]);

    // `a` still has `b` below it, so a1's ancestor rail passes through.
    expect(guides.get('a1')?.rails).toEqual([true]);
    // `b` is last, so nothing runs alongside b1.
    expect(guides.get('b1')?.rails).toEqual([false]);
  });

  it('gives a chain root no ancestor rails — the vendor group is not a level', () => {
    const guides = buildLineageGuides([rendered('group', 0), rendered('a', 1)]);
    expect(guides.get('a')).toEqual({ rails: [], isLast: true });
  });

  it('resets at each top-level row so one group cannot bleed into the next', () => {
    const guides = buildLineageGuides([
      rendered('group1', 0),
      rendered('a', 1),
      rendered('group2', 0),
      rendered('b', 1),
    ]);

    expect(guides.get('a')?.isLast).toBe(true);
    expect(guides.get('b')?.isLast).toBe(true);
  });

  it('closes deeper subtrees when the list steps back up a level', () => {
    const guides = buildLineageGuides([
      rendered('group', 0),
      rendered('a', 1),
      rendered('a1', 2),
      rendered('a1x', 3),
      rendered('b', 1),
    ]);

    // Returning to depth 1 must not leave the depth-2/3 rails alive.
    expect(guides.get('b')).toEqual({ rails: [], isLast: true });
    expect(guides.get('a1')?.isLast).toBe(true);
    expect(guides.get('a1x')?.rails).toEqual([true, false]);
  });

  it('emits no guides for top-level rows', () => {
    const guides = buildLineageGuides([rendered('group', 0)]);
    expect(guides.has('group')).toBe(false);
  });

  it('handles an empty list', () => {
    expect(buildLineageGuides([]).size).toBe(0);
  });
});
