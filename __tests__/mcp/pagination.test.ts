import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  paginate,
} from '@/app/lib/mcp/pagination';

describe('paginate', () => {
  it('returns the first page with no cursor and uses the default limit', () => {
    const items = Array.from({ length: 75 }, (_, i) => i);
    const result = paginate(items, {});
    expect(result.items).toHaveLength(DEFAULT_PAGE_LIMIT);
    expect(result.items[0]).toBe(0);
    expect(result.totalAvailable).toBe(75);
    expect(result.nextCursor).not.toBeNull();
  });

  it('respects an explicit limit', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const result = paginate(items, { limit: 3 });
    expect(result.items).toEqual([0, 1, 2]);
    expect(result.nextCursor).not.toBeNull();
  });

  it('returns null nextCursor when items fit in one page', () => {
    const items = [1, 2, 3];
    const result = paginate(items, { limit: 10 });
    expect(result.items).toEqual([1, 2, 3]);
    expect(result.nextCursor).toBeNull();
  });

  it('handles an empty input array', () => {
    const result = paginate<number>([], { limit: 5 });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.totalAvailable).toBe(0);
  });

  it('round-trips a cursor across pages', () => {
    const items = Array.from({ length: 7 }, (_, i) => i);
    const page1 = paginate(items, { limit: 3 });
    expect(page1.items).toEqual([0, 1, 2]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = paginate(items, {
      limit: 3,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toEqual([3, 4, 5]);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = paginate(items, {
      limit: 3,
      cursor: page2.nextCursor!,
    });
    expect(page3.items).toEqual([6]);
    expect(page3.nextCursor).toBeNull();
  });

  it('rejects an invalid cursor with a tool-error throw', () => {
    expect(() =>
      paginate([1, 2, 3], { cursor: 'not-base64-url-json' }),
    ).toThrow(/Invalid cursor/);
  });

  it('rejects a cursor with a negative offset', () => {
    const bad = Buffer.from(JSON.stringify({ o: -1 }), 'utf-8').toString(
      'base64url',
    );
    expect(() => paginate([1, 2, 3], { cursor: bad })).toThrow(
      /Invalid cursor/,
    );
  });

  it('clamps the offset to the array bounds', () => {
    const items = [1, 2, 3];
    const beyond = Buffer.from(JSON.stringify({ o: 100 }), 'utf-8').toString(
      'base64url',
    );
    const result = paginate(items, { cursor: beyond });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.totalAvailable).toBe(3);
  });

  it('exposes the max limit constant for callers to validate against', () => {
    expect(MAX_PAGE_LIMIT).toBe(25);
  });
});
