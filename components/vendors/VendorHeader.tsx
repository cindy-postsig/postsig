'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from 'next/dist/client/components/error-boundary';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import VendorIcon from '@/components/vendors/VendorIcon';
import { formatCurrency } from '@/app/lib/utils';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useDateFormat } from '@/hooks/useDateFormat';

export interface VendorHeaderProps {
  name: string;
  domain?: string | null;
  currentFySpend: number;
  /** Caveat behind an info icon next to the label, e.g. that part of the figure is estimated. */
  currentFySpendNote?: string;
  /** `yyyy-MM-dd` or null. */
  relationshipStartDate: string | null;
  /** `yyyy-MM-dd` or null. */
  projectedEndDate: string | null;
  relationshipLengthDisplay: string | null;
}

function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: string | null;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-bold flex items-center gap-1.5 font-label text-xs uppercase tracking-wide">
        {label}
        {note ? (
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${label}`}
                  className="flex items-center text-muted-foreground"
                >
                  <InfoCircledIcon className="h-3.5 w-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs normal-case tracking-normal">
                {note}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </dt>
      <dd className="font-serif text-xl">{value ?? 'N/A'}</dd>
    </div>
  );
}

export function VendorHeader({
  name,
  domain,
  currentFySpend,
  currentFySpendNote,
  relationshipStartDate,
  projectedEndDate,
  relationshipLengthDisplay,
}: VendorHeaderProps) {
  const { baseCurrency } = useBaseCurrency();
  const { formatDate } = useDateFormat();
  const iconName = name
    .replace(/ /g, '%20')
    .replace(/[.,]/g, '')
    .replace(/(ltd|inc|international%20sl)/gi, '');

  return (
    <div className="flex w-full flex-col gap-14">
      <div className="flex items-center gap-6">
        <ErrorBoundary errorComponent={() => <div>{name}</div>}>
          <Suspense fallback={<div className="h-16 w-16 rounded-sm" />}>
            <VendorIcon
              name={iconName}
              domain={domain ?? undefined}
              width={64}
              height={64}
            />
          </Suspense>
        </ErrorBoundary>
        <h1 className="font-serif text-5xl">{name}</h1>
      </div>
      <dl className="grid w-full grid-cols-4 gap-12">
        <Fact
          label="Current FY Spend"
          value={formatCurrency(currentFySpend, baseCurrency)}
          note={currentFySpendNote}
        />
        <Fact
          label="Relationship Start"
          value={formatDate(relationshipStartDate)}
        />
        <Fact label="Projected End Date" value={formatDate(projectedEndDate)} />
        <Fact label="Relationship Length" value={relationshipLengthDisplay} />
      </dl>
    </div>
  );
}
