import { buildPageItems } from '@/components/ui/data-table/components/TablePagination';

describe('buildPageItems', () => {
  it('lists every page when they fit without truncation', () => {
    expect(buildPageItems(1, 1)).toEqual([1]);
    expect(buildPageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('anchors to the start without a leading ellipsis', () => {
    expect(buildPageItems(1, 10)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 10]);
    expect(buildPageItems(3, 10)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 10]);
  });

  it('anchors to the end without a trailing ellipsis', () => {
    expect(buildPageItems(10, 10)).toEqual([1, 'ellipsis', 6, 7, 8, 9, 10]);
    expect(buildPageItems(8, 10)).toEqual([1, 'ellipsis', 6, 7, 8, 9, 10]);
  });

  it('windows around the current page in the middle', () => {
    expect(buildPageItems(5, 10)).toEqual([
      1,
      'ellipsis',
      4,
      5,
      6,
      'ellipsis',
      10,
    ]);
  });

  it('keeps the slot count stable across every page of a long range', () => {
    const pageCount = 40;
    for (let page = 1; page <= pageCount; page++) {
      const items = buildPageItems(page, pageCount);
      expect(items).toHaveLength(7);
      expect(items).toContain(page);
      expect(items[0]).toBe(1);
      expect(items[items.length - 1]).toBe(pageCount);
    }
  });
});
