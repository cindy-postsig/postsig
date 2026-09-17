'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

const ARIA_SORT: Record<SortDirection, 'ascending' | 'descending'> = {
  asc: 'ascending',
  desc: 'descending',
};

/** A column header that sorts on click; `direction` is null while another
 *  column (or none) holds the sort, which is also when no arrow shows. */
export function SortableHeader({
  label,
  direction,
  onSort,
  align = 'left',
  className,
}: {
  label: string;
  direction: SortDirection | null;
  onSort: () => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <TableHead
      aria-sort={direction ? ARIA_SORT[direction] : undefined}
      className={cn(
        'whitespace-nowrap',
        align === 'right' && 'text-right',
        className,
      )}
    >
      <button
        type="button"
        onClick={onSort}
        aria-label={`Sort by ${label}`}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
          direction
            ? 'font-medium text-foreground'
            : 'font-normal text-muted-foreground',
        )}
      >
        {label}
        {direction === 'asc' && <ArrowUp className="h-3.5 w-3.5" />}
        {direction === 'desc' && <ArrowDown className="h-3.5 w-3.5" />}
      </button>
    </TableHead>
  );
}
