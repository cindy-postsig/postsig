'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { AmendedField } from '@/lib/v2/core/amendments';

interface AmendmentIndicatorProps<T> {
  amendment: AmendedField<T>;
  formatOriginal?: (value: T) => string;
  fieldLabel?: string;
}

/**
 * Amber dot indicator with hovercard showing original value and link to amending contract.
 * Generic component that can be used for any amended field.
 */
export function AmendmentIndicator<T>({
  amendment,
  formatOriginal = String,
  fieldLabel = 'This field',
}: AmendmentIndicatorProps<T>) {
  return (
    <HoverCard openDelay={0}>
      <HoverCardTrigger asChild>
        <span className="inline-block cursor-pointer p-1">
          <span className="block h-1.5 w-1.5 rounded-full bg-blue-300" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 space-y-3">
        <div className="space-y-2">
          <div className="font-bold font-label text-sm uppercase tracking-wide">
            Modified Field
          </div>
          <div>
            <div className="font-bold font-label text-xs uppercase tracking-wide">
              Original
            </div>
            <div className="font-serif">
              {formatOriginal(amendment.original) || 'N/A'}
            </div>
          </div>
        </div>
        <div className="border-t pt-2">
          <Link
            href={`/contracts/${amendment.amendedBy.contractId}`}
            target="_blank"
            className="flex items-center gap-1 text-xs hover:underline"
          >
            View {amendment.amendedBy.contractType || 'Amendment'}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
