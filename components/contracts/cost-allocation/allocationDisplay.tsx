'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/user-avatar';
import type { AllocationTargetRef } from '@/lib/v2/cost-allocation/types';

export function TypeTag({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      size="sm"
      className="whitespace-nowrap text-muted-foreground"
    >
      {label}
    </Badge>
  );
}

/**
 * A person gets the app's user avatar, seeded colour and all. An org unit is
 * not a person — that colour and a two-letter monogram would read as one — so
 * a unit keeps a neutral single initial.
 */
export function TargetAvatar({ target }: { target: AllocationTargetRef }) {
  if (target.kind === 'employee') {
    return (
      <UserAvatar
        name={target.name}
        size="sm"
        initialsCount={2}
        className="h-7 w-7 shrink-0"
      />
    );
  }
  return (
    <span className="font-medium flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs uppercase text-muted-foreground">
      {target.name.trim().charAt(0)}
    </span>
  );
}

/**
 * A target's share as a donut. Sized to sit inside a Badge, so it reads as a
 * glyph beside the name rather than a chart — the exact figure is the percent
 * printed next to it, which is why this carries no label of its own and stays
 * out of the accessibility tree.
 */
export function TargetDonut({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  const share = Math.max(0, Math.min(100, percent)) / 100;
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      className={cn('h-3 w-3 shrink-0', className)}
    >
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        strokeWidth="3"
        className="stroke-primary/20"
      />
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        strokeWidth="3"
        className="stroke-primary"
        strokeDasharray={`${circumference * share} ${circumference}`}
        // Start the arc at twelve o'clock rather than three.
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}
