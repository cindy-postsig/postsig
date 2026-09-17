'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { TableHead, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { SortDirection, SortState } from '@/hooks/useSortableRows';

interface Props<K extends string> {
  label: string;
  sortKey: K;
  currentKey: K;
  direction: SortDirection;
  onSort: (key: K) => void;
  align?: 'left' | 'right';
  className?: string;
}

export default function SortableTableHead<K extends string>({
  label,
  sortKey,
  currentKey,
  direction,
  onSort,
  align = 'left',
  className,
}: Props<K>) {
  const active = currentKey === sortKey;

  return (
    <TableHead
      className={cn(
        'cursor-pointer select-none',
        align === 'right' && 'text-right',
        active && 'font-bold text-foreground',
        className,
      )}
      onClick={() => onSort(sortKey)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {label}
        {active &&
          (direction === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </span>
    </TableHead>
  );
}

export interface SortableColumn<K extends string> {
  key: K;
  label: string;
  align?: 'left' | 'right';
}

interface SortableHeaderRowProps<K extends string> {
  columns: SortableColumn<K>[];
  sort: SortState<K>;
  onSort: (key: K) => void;
  children?: React.ReactNode;
}

// Renders one SortableTableHead per column plus any trailing non-sortable
// TableHead cells (e.g. a Trend column or row actions) passed as children.
export function SortableHeaderRow<K extends string>({
  columns,
  sort,
  onSort,
  children,
}: SortableHeaderRowProps<K>) {
  return (
    <TableRow>
      {columns.map((column) => (
        <SortableTableHead
          key={column.key}
          label={column.label}
          sortKey={column.key}
          currentKey={sort.key}
          direction={sort.direction}
          onSort={onSort}
          align={column.align}
        />
      ))}
      {children}
    </TableRow>
  );
}
