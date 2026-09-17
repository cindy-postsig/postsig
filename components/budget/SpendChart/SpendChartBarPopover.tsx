'use client';

import { memo } from 'react';
import Link from 'next/link';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatCurrency } from '@/app/lib/utils';
import VendorIcon from '@/components/vendors/VendorIcon';
import { contractRowHref } from '@/lib/v2/contracts/rowHref';
import type { SpendChartSlice } from './toChartData';

interface SpendChartBarPopoverProps {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  payload: {
    label: string;
    // The point's TOTAL — in a stacked chart the `value` prop is only this
    // segment's share.
    value: number;
    slices: SpendChartSlice[];
  };
  /** Currency the response's already-converted amounts are expressed in. */
  currency: string;
  fillClassName?: string;
}

export const SpendChartBarPopover = memo(function SpendChartBarPopover({
  x,
  y,
  width,
  height,
  value,
  payload,
  currency,
  fillClassName = 'fill-[#1F1C41] hover:fill-[#1F1C41]/85 dark:fill-primary dark:hover:fill-primary/90',
}: SpendChartBarPopoverProps) {
  const totalValue = payload.value ?? value;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            rx={1}
            className={`transition-colors ${fillClassName}`}
          />
          <rect
            x={x}
            y={y + height}
            width={width}
            height={30}
            className="cursor-pointer opacity-0"
          />
        </g>
      </PopoverTrigger>
      <PopoverContent className="max-h-96 w-96 overflow-auto" side="top">
        <div>
          <div className="border-b pb-4">
            <h3 className="font-serif text-lg">{payload.label}</h3>
            <p className="font-label text-xs text-muted-foreground">
              {formatCurrency(totalValue, currency)}
            </p>
          </div>
          <div>
            {payload.slices.map((slice) => (
              <Link
                key={slice.groupKey}
                href={contractRowHref(slice.groupKey)}
                className="flex items-center justify-between gap-2 border-b border-border px-1 py-2 last:border-0 hover:bg-gray-700/5"
              >
                <div className="flex items-center gap-3">
                  <VendorIcon
                    name={slice.label}
                    domain={slice.vendorDomain || ''}
                    height={34}
                    width={34}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium line-clamp-1 text-[0.8rem] leading-tight">
                      {slice.label}
                      {slice.kind === 'new' && (
                        <span className="ml-1.5 rounded-sm bg-muted px-1 py-0.5 font-label text-[0.6rem] uppercase text-muted-foreground">
                          New
                        </span>
                      )}
                      {slice.kind === 'multi-year' && (
                        <span className="ml-1.5 rounded-sm bg-muted px-1 py-0.5 font-label text-[0.6rem] uppercase text-muted-foreground">
                          Multi-Year
                        </span>
                      )}
                    </span>
                    {slice.productName && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {slice.productName}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-label text-xs">
                  {/* A slice is one contract, so it reads in that contract's
                      own currency; only the bar and the header total above
                      aggregate, and those stay in the chart's target currency
                      (PSK-1796). Slices without a native stamp — a genuinely
                      mixed bucket — fall back to the converted figure. */}
                  {formatCurrency(
                    slice.nativeValue ?? slice.value,
                    slice.nativeCurrency ?? currency,
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});
