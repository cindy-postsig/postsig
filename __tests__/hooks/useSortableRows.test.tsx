/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { useSortableRows } from '@/hooks/useSortableRows';

interface Row {
  name: string;
  amount: number | null;
}

const rows: Row[] = [
  { name: 'Bravo', amount: 20 },
  { name: 'alpha', amount: null },
  { name: 'Charlie', amount: 10 },
];

const accessors = {
  name: (row: Row) => row.name,
  amount: (row: Row) => row.amount,
};

describe('useSortableRows', () => {
  it('sorts numeric values ascending, nulls last', () => {
    const { result } = renderHook(() =>
      useSortableRows(rows, accessors, { key: 'amount', direction: 'asc' }),
    );
    expect(result.current.sorted.map((r) => r.name)).toEqual([
      'Charlie',
      'Bravo',
      'alpha',
    ]);
  });

  it('sorts numeric values descending, nulls still last', () => {
    const { result } = renderHook(() =>
      useSortableRows(rows, accessors, { key: 'amount', direction: 'desc' }),
    );
    expect(result.current.sorted.map((r) => r.name)).toEqual([
      'Bravo',
      'Charlie',
      'alpha',
    ]);
  });

  it('sorts string values ascending', () => {
    const { result } = renderHook(() =>
      useSortableRows(rows, accessors, { key: 'name', direction: 'asc' }),
    );
    expect(result.current.sorted.map((r) => r.name)).toEqual([
      'alpha',
      'Bravo',
      'Charlie',
    ]);
  });

  it('toggles direction when re-sorting the same key, resets to desc on a new key', () => {
    const { result } = renderHook(() =>
      useSortableRows<Row, 'name' | 'amount'>(rows, accessors, {
        key: 'amount',
        direction: 'asc',
      }),
    );

    act(() => result.current.toggleSort('amount'));
    expect(result.current.sort).toEqual({ key: 'amount', direction: 'desc' });

    act(() => result.current.toggleSort('name'));
    expect(result.current.sort).toEqual({ key: 'name', direction: 'desc' });
  });
});
