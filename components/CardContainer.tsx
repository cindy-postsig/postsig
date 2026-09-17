import { cn } from '@/lib/utils';
import React from 'react';

type CardContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export default function CardContainer({
  children,
  className,
}: CardContainerProps) {
  return (
    <div
      className={cn(
        'term-card h-full w-auto shrink-0 rounded border border-gray-700 border-opacity-[.08] bg-muted px-6 py-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
