'use client';

import { orderBy, partition } from 'lodash';
import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export function useSortableRows<T, K extends string>(
  rows: T[],
  accessors: Record<K, (row: T) => string | number | null>,
  initial: SortState<K>,
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => {
    const accessor = accessors[sort.key];
    // Case-insensitive: lodash's default string comparison is by code unit
    // (e.g. 'alpha' sorts after 'Bravo'), unlike the previous localeCompare.
    const sortValue = (row: T) => {
      const value = accessor(row);
      return typeof value === 'string' ? value.toLowerCase() : value;
    };
    const [withValue, withoutValue] = partition(
      rows,
      (row) => accessor(row) != null,
    );
    return [...orderBy(withValue, sortValue, sort.direction), ...withoutValue];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  const toggleSort = (key: K) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' },
    );
  };

  return { sorted, sort, toggleSort };
}
