import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: ReactNode;
  isEmpty?: boolean;
  emptyMessage?: ReactNode;
  height?: number;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function ChartCard({
  title,
  isEmpty = false,
  emptyMessage = 'No data available',
  height = 300,
  children,
  className,
  bodyClassName,
}: ChartCardProps) {
  return (
    <section className={cn('space-y-6 rounded border p-6', className)}>
      <h3 className="font-medium text-base leading-none">{title}</h3>
      <div className={cn('relative', bodyClassName)} style={{ height }}>
        {isEmpty ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
