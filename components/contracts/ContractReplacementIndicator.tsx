'use client';

import { AlertTriangle } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

/**
 * Row-level hazard flag for a contract with an unanswered replacement prompt
 * Only verified events reach here — the contract's detail page
 * carries the banner that resolves it.
 */
export default function ContractReplacementIndicator() {
  return (
    <HoverCard openDelay={0}>
      <HoverCardTrigger asChild>
        <span
          className="inline-flex cursor-pointer items-center pl-1"
          aria-label="Potential replacement detected"
          role="img"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 text-sm">
        We detected a potentially newer contract that may replace this one. Open
        the contract to review it.
      </HoverCardContent>
    </HoverCard>
  );
}
