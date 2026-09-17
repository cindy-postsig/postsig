'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function MetricStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Card className={cn('px-8 py-6', className)}>{children}</Card>;
}

export function Metric({
  label,
  value,
  note,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="font-bold font-label text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col gap-1">
        <p className={cn('font-serif text-2xl leading-none', valueClassName)}>
          {value}
        </p>
        {note ? (
          <span className="text-xs text-muted-foreground">{note}</span>
        ) : null}
      </div>
    </div>
  );
}
