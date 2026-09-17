import { selectEvenlyStridedTicks } from '@/components/exchange-agreements/ProductDetailSheet';

describe('selectEvenlyStridedTicks', () => {
  it('passes a list no longer than maxTicks through unchanged', () => {
    expect(selectEvenlyStridedTicks(['a', 'b', 'c'], 6)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('returns an empty array for an empty list', () => {
    expect(selectEvenlyStridedTicks([], 6)).toEqual([]);
  });

  it('strides evenly through the indices for a longer list', () => {
    const values = Array.from({ length: 11 }, (_, i) => i); // 0..10
    // stride = ceil(10 / 5) = 2 -> every other index: 0,2,4,6,8,10
    expect(selectEvenlyStridedTicks(values, 6)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('always force-includes the last value when the stride overshoots it', () => {
    const values = Array.from({ length: 10 }, (_, i) => i); // 0..9
    // stride = ceil(9 / 5) = 2 -> 0,2,4,6,8, then 9 force-appended
    expect(selectEvenlyStridedTicks(values, 6)).toEqual([0, 2, 4, 6, 8, 9]);
  });

  it('never duplicates the last value when the stride already lands on it', () => {
    const values = Array.from({ length: 9 }, (_, i) => i); // 0..8
    // stride = ceil(8 / 5) = 2 -> 0,2,4,6,8 -- already ends on the last index
    expect(selectEvenlyStridedTicks(values, 6)).toEqual([0, 2, 4, 6, 8]);
  });
});
