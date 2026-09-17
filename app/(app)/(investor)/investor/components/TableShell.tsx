import React from 'react';
import { Table } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Investor-scoped table wrapper: the bordered shell plus zebra striping.
 * `:not(:hover)` drops the band on the hovered row so the base row-hover
 * shows uniformly instead of fighting the stripe.
 */
export function TableShell({
  striped = true,
  scrollX = false,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Table> & {
  striped?: boolean;
  scrollX?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded border',
        scrollX ? 'overflow-x-auto' : 'overflow-hidden',
      )}
    >
      <Table
        className={cn(
          striped && '[&_tbody_tr:nth-child(even):not(:hover)]:bg-band',
          className,
        )}
        {...props}
      >
        {children}
      </Table>
    </div>
  );
}
