'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  seatStatusLabel,
  type SeatInactiveReason,
} from '@/lib/v2/seats/status';

/** One rendering of a seat's status wherever a seat is listed. */
export function SeatStatusBadge({
  reasons,
  className,
}: {
  reasons: readonly SeatInactiveReason[];
  className?: string;
}) {
  return (
    <Badge
      variant={reasons.length > 0 ? 'destructive' : 'secondary'}
      className={cn('whitespace-nowrap', className)}
    >
      {seatStatusLabel(reasons)}
    </Badge>
  );
}
