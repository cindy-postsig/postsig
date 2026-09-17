'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// One definition of how an HR status reads, so the Users table and the person
// profile cannot drift apart. Semantic colour, separate from the page's own
// accent: green is "nothing to do here", amber is temporary, red is a seat
// somebody should be reclaiming.

const STATUS: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className:
      'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-0 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  on_leave: {
    label: 'On leave',
    className:
      'border-amber-400 bg-amber-100 text-amber-800 dark:border-0 dark:bg-amber-900/40 dark:text-amber-200',
  },
  inactive: {
    label: 'Inactive',
    className:
      'border-red-300 bg-red-100 text-red-800 dark:border-0 dark:bg-red-900/40 dark:text-red-200',
  },
};

export function HrStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  // A status the CHECK constraint does not know about still gets a badge
  // rather than an empty cell.
  const known = STATUS[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        'whitespace-nowrap',
        known?.className ?? 'text-muted-foreground',
        className,
      )}
    >
      {known?.label ?? status}
    </Badge>
  );
}
