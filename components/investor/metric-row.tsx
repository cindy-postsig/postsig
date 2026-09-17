'use client';

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

// Responsive layouts for column counts that wrap on smaller screens.
// When items wrap to multiple rows, divide-x (keyed on DOM order) gives unwanted
// left-borders on row-first items. nth-child selectors fix the break points.
const RESPONSIVE_COLUMN_CLASSES: Record<number, string> = {
  5: cn(
    'grid-cols-3 gap-y-8 xl:grid-cols-5',
    '[&>*:nth-child(3n+1)]:border-l-0 [&>*:nth-child(3n+1)]:pl-0',
    '[&>*:nth-child(3n)]:pr-0',
    'xl:[&>*:nth-child(4)]:border-l xl:[&>*:nth-child(4)]:pl-5',
    'xl:[&>*:nth-child(3)]:pr-5',
  ),
  6: cn(
    'grid-cols-3 gap-y-8 xl:grid-cols-6',
    '[&>*:nth-child(3n+1)]:border-l-0 [&>*:nth-child(3n+1)]:pl-0',
    '[&>*:nth-child(3n)]:pr-0',
    'xl:[&>*:nth-child(4)]:border-l xl:[&>*:nth-child(4)]:pl-5',
    'xl:[&>*:nth-child(3)]:pr-5',
  ),
};

export function MetricRow({
  columns,
  className,
  children,
}: {
  columns: number;
  className?: string;
  children: React.ReactNode;
}) {
  const responsive = RESPONSIVE_COLUMN_CLASSES[columns];
  return (
    <div
      className={cn(
        'grid divide-x divide-foreground/10 [&>*:first-child]:pl-0 [&>*:last-child]:pr-0 [&>*]:px-5',
        responsive,
        className,
      )}
      style={
        responsive
          ? undefined
          : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
      }
    >
      {children}
    </div>
  );
}

export function BareMetric({
  title,
  value,
  valueContent,
  tooltip,
  editable,
}: {
  title: string;
  value: string;
  valueContent?: React.ReactNode;
  tooltip?: { title: string; description: string };
  // Renders a hover-fade pencil next to the value to signal the card opens an
  // edit affordance. Relies on a `group` ancestor (e.g. the wrapping button).
  editable?: boolean;
}) {
  const isEditable = editable;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 font-sans-neue text-[0.7rem] uppercase tracking-wider text-foreground/60">
        {title}
        {tooltip && (
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label={`${title} info`}
                  className="inline-flex cursor-default items-center justify-center focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/60"
                >
                  <HelpCircle className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="w-72">
                <p className="font-semibold">{tooltip.title}</p>
                <p>{tooltip.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex items-center gap-1.5 font-sans-neue text-2xl !leading-none">
        {valueContent ?? (value || '-')}
        {isEditable && (
          <Pencil className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-60" />
        )}
      </div>
    </div>
  );
}
