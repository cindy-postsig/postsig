'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
export { MetricRow, BareMetric } from '@/components/investor/metric-row';

export function FieldRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-4 py-2">
      <div className="flex items-center font-sans-neue text-sm leading-tight text-muted-foreground">
        {label}
      </div>
      <div className="text-right font-sans-neue text-sm tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div
        className={
          action ? 'flex flex-row items-center justify-between' : undefined
        }
      >
        <h3 className="font-medium font-sans-neue text-base leading-none">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TabHeader({
  title,
  tooltip,
  action,
}: {
  title: string;
  tooltip?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-9 items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <h2 className="font-medium font-sans-neue text-lg leading-none">
          {title}
        </h2>
        {tooltip && (
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function TabEmptyState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <TabHeader title={title} />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function ReportStatusBadge({
  hasData,
  submittedAt,
}: {
  hasData: boolean;
  submittedAt: string | null;
}) {
  if (submittedAt) {
    return (
      <Badge
        variant="secondary"
        className="border border-green/30 bg-green/10 text-green"
      >
        Submitted
      </Badge>
    );
  }
  if (hasData) {
    return (
      <Badge
        variant="secondary"
        className="border border-amber-500/30 bg-amber-500/10 text-amber-600"
      >
        In progress
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      Awaiting response
    </Badge>
  );
}

export function StatusBadge({
  label,
  value,
}: {
  label: string;
  value: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="font-sans-neue text-sm text-muted-foreground">
        {label}
      </span>
      <BooleanDot value={value} />
    </div>
  );
}

export function BooleanDot({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="inline-flex items-center gap-2 font-sans-neue text-sm">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          value ? 'bg-[#00A419]' : 'bg-foreground/25',
        )}
      />
      <span className={value ? 'text-[#00A419]' : 'text-muted-foreground'}>
        {value ? 'Yes' : 'No'}
      </span>
    </span>
  );
}

export function SubTabCount({
  value,
  accent,
}: {
  value: number;
  accent?: boolean;
}) {
  if (value === 0) return null;
  return (
    <span
      className={cn(
        'font-medium ml-1.5 rounded-full px-1.5 py-px text-[0.65rem] tabular-nums',
        accent
          ? 'bg-amber-500/15 text-amber-600'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {value}
    </span>
  );
}

export function SubTabEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-foreground/15 px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
