import React from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@radix-ui/react-icons';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/app/lib/utils';

interface ReportCardProps {
  title: string;
  count?: number;
  viewMoreHref?: string;
  viewMoreText?: string;
  valueLabel?: string;
  totalValue?: number;
  /** Org base display currency for `totalValue`; defaults to USD. */
  currency?: string;
  className?: string;
  customValueLabel?: string;
  customSubheader?: React.ReactNode;
  additionalInfo?: string;
  noun?: { singular: string; plural: string };
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export const ReportCard = ({
  title,
  count,
  viewMoreHref,
  viewMoreText,
  valueLabel,
  totalValue,
  currency,
  className,
  customValueLabel,
  customSubheader,
  additionalInfo,
  noun = { singular: 'contract', plural: 'contracts' },
  headerAction,
  children,
}: ReportCardProps) => (
  <Card
    className={`flex flex-col justify-between bg-card/50 dark:bg-card ${className || ''}`}
  >
    <div>
      <CardHeader>
        <div
          className={headerAction ? 'flex items-center justify-between' : ''}
        >
          <CardTitle className="font-normal h-6 font-sans text-lg leading-tight tracking-normal">
            <Link href={viewMoreHref!!} className="inline-flex items-center">
              <span className="pt-[2px]">{title}</span>
              {count !== undefined && (
                <Badge
                  variant={'secondary'}
                  className="ml-3 px-2 font-sans-neue"
                >
                  {count}
                </Badge>
              )}
            </Link>
          </CardTitle>
          {headerAction}
        </div>
        {customSubheader ? (
          <div className="mt-1 font-sans text-sm text-muted-foreground">
            {customSubheader}
          </div>
        ) : (valueLabel && totalValue !== undefined) || customValueLabel ? (
          <div className="mt-1 font-sans text-sm text-muted-foreground">
            {customValueLabel ? (
              customValueLabel
            ) : count && count > 0 ? (
              <>
                {count} {count === 1 ? noun.singular : noun.plural} {valueLabel}{' '}
                {formatCurrency(totalValue!, currency)}
                {additionalInfo && <> {additionalInfo}</>}
              </>
            ) : (
              <span className="italic opacity-70">
                No {noun.plural} for this report
              </span>
            )}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </div>
    {viewMoreHref && viewMoreText && (
      <CardFooter className="border-none bg-transparent pt-0">
        <Link
          href={viewMoreHref}
          className="mt-2 flex w-auto items-center border-b border-b-transparent text-[0.85rem] leading-none text-foreground hover:border-b-foreground/50"
        >
          {viewMoreText}
          <ChevronRightIcon width={14} height={14} />
        </Link>
      </CardFooter>
    )}
  </Card>
);
