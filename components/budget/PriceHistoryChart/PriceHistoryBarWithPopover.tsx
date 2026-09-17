'use client';

import { useState, useRef, memo } from 'react';
import Link from 'next/link';
import { format, parseISO, differenceInMonths } from 'date-fns';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatCurrency } from '@/app/lib/utils';
import VendorIcon from '@/components/vendors/VendorIcon';
import { PriceHistory } from '@/app/lib/budget/types';
import {
  ChartType,
  ViewMode,
  getBillingIntervalMonths,
} from '@/app/lib/budget/priceHistoryChartUtils';

interface BarWithPopoverProps {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  payload: {
    label: string;
    contracts: Array<
      PriceHistory & { calculatedValue: number; calculatedValueNative: number }
    >;
  };
  chartType: ChartType;
  viewMode: ViewMode;
  baseCurrency: string;
}

// Using memo to prevent unnecessary re-rendering which can cause infinite loops
// We need to use a pure component approach to avoid the infinite update issue
export const PriceHistoryBarWithPopover = memo(
  function PriceHistoryBarWithPopover({
    x,
    y,
    width,
    height,
    value,
    payload,
    chartType,
    viewMode,
    baseCurrency,
  }: BarWithPopoverProps) {
    // Prevent state updates during render
    const [open, setOpen] = useState(false);

    // Use refs instead of state for values that don't need to trigger re-renders
    const popoverContentRef = useRef<HTMLDivElement>(null);
    // Format the popover title based on the label
    const getPopoverTitle = () => {
      const { label } = payload;
      if (label.includes('FQ')) {
        // Quarterly format: "FQ1 '25" -> "Q1 2025"
        const [quarter, year] = label.split(' ');
        return `${quarter.replace('FQ', 'Q')} 20${year.replace("'", '')}`;
      } else {
        // Monthly format: "Jan '25" -> "January 2025"
        try {
          const [month, year] = label.split(' ');
          const monthMap: Record<string, string> = {
            Jan: '01',
            Feb: '02',
            Mar: '03',
            Apr: '04',
            May: '05',
            Jun: '06',
            Jul: '07',
            Aug: '08',
            Sep: '09',
            Oct: '10',
            Nov: '11',
            Dec: '12',
          };
          const fullDate = parseISO(
            `20${year.replace("'", '')}-${monthMap[month]}-01`,
          );
          return format(fullDate, 'MMMM yyyy');
        } catch {
          return label; // Fallback to original label if parsing fails
        }
      }
    };

    // We now use the imported getBillingIntervalMonths function from priceHistoryChartUtils

    // Get the appropriate value for each contract based on view mode. A row is
    // a single contract, so it reads in that contract's own currency — only the
    // bar and the header total below aggregate, and those stay base (PSK-1796).
    const getContractValue = (
      contract: PriceHistory & { calculatedValueNative: number },
    ) => {
      // Simply use the pre-calculated value that was computed in priceHistoryChartUtils
      return contract.calculatedValueNative ?? 0;
    };

    // Use the original precise value from the chart data, don't recalculate
    const totalValue = value;

    // Define the popup content separately to avoid re-render issues
    const PopupContent = () => (
      <div>
        {/* Header */}
        <div className="border-b pb-4">
          <h3 className="font-serif text-lg">{getPopoverTitle()}</h3>
          <p className="font-label text-xs text-muted-foreground">
            {/* Total value of contracts - use original value and format for display */}
            {formatCurrency(totalValue, baseCurrency)}
          </p>
        </div>

        {/* Contracts list */}
        <div>
          {payload.contracts.map((contract) => (
            <Link
              key={contract.id}
              href={`/contracts/${contract.id}`}
              className="flex items-center justify-between gap-2 border-b border-border px-1 py-2 last:border-0 hover:bg-gray-700/5"
            >
              <div className="flex items-center gap-3">
                <VendorIcon
                  name={contract.vendor}
                  domain={contract.vendorDomain || ''}
                  height={34}
                  width={34}
                />
                <div className="flex flex-col">
                  <span className="font-medium line-clamp-1 text-[0.8rem] leading-tight">
                    {contract.vendor}
                  </span>
                  {/* Show first product if available */}
                  {contract.periods.length > 0 &&
                    contract.periods[0].productFees.length > 0 && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {contract.periods[0].productFees[0].productName}
                      </span>
                    )}
                </div>
              </div>
              <span className="font-label text-xs">
                {/* Contract value, in the contract's own currency */}
                {formatCurrency(getContractValue(contract), contract.currency)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    );

    // Use a simpler approach with less reactivity to avoid the infinite loop
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
              className="fill-[#1F1C41] transition-colors hover:fill-[#1F1C41]/85 dark:fill-primary dark:hover:fill-primary/90"
            />

            {/* Invisible extended hit area */}
            <rect
              x={x}
              y={y + height}
              width={width}
              height={30}
              className="cursor-pointer opacity-0"
            />
          </g>
        </PopoverTrigger>
        <PopoverContent
          className="max-h-96 w-96 overflow-auto"
          side="top"
          ref={popoverContentRef}
        >
          <PopupContent />
        </PopoverContent>
      </Popover>
    );
  },
);
