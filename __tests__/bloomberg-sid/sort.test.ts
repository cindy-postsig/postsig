import { sortBy } from '@/lib/v2/bloomberg-sid/sort';

const ROWS = [
  { name: 'Berenberg', cost: 300 },
  { name: 'alpha', cost: 1200 },
  { name: 'Citi', cost: 45 },
];

describe('sortBy', () => {
  it('orders numbers numerically, not lexically', () => {
    expect(sortBy(ROWS, (r) => r.cost, 'asc').map((r) => r.cost)).toEqual([
      45, 300, 1200,
    ]);
    expect(sortBy(ROWS, (r) => r.cost, 'desc').map((r) => r.cost)).toEqual([
      1200, 300, 45,
    ]);
  });

  it('orders strings alphabetically, not by character code', () => {
    expect(sortBy(ROWS, (r) => r.name, 'asc').map((r) => r.name)).toEqual([
      'alpha',
      'Berenberg',
      'Citi',
    ]);
  });

  it('leaves the input untouched', () => {
    const before = [...ROWS];
    sortBy(ROWS, (r) => r.cost, 'desc');
    expect(ROWS).toEqual(before);
  });
});
