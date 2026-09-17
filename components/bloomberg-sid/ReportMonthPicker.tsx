'use client';

import { useEffect, useState } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDateFormat } from '@/hooks/useDateFormat';
import type { SidReportMonth } from '@/lib/v2/bloomberg-sid/report';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function ReportMonthPicker({
  value,
  months,
}: {
  /** `yyyy-MM-dd` of the selected report month. */
  value: string;
  months: SidReportMonth[];
}) {
  const [open, setOpen] = useState(false);
  const { formatDate } = useDateFormat();
  const [, setMonth] = useQueryState(
    'month',
    parseAsString.withOptions({ shallow: false }),
  );

  const selectedYear = Number(value.slice(0, 4));
  const selectedMonth = Number(value.slice(5, 7));
  const [yearView, setYearView] = useState(selectedYear);

  useEffect(() => {
    setYearView(selectedYear);
  }, [selectedYear]);

  const importedMonths = new Map(
    months.map((month) => [month.reportMonth.slice(0, 7), month.reportMonth]),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="xs" className="gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {formatDate(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="pointer-events-auto w-56 p-3">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Previous year"
            onClick={() => {
              setYearView((year) => year - 1);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium text-sm">{yearView}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Next year"
            onClick={() => {
              setYearView((year) => year + 1);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTH_LABELS.map((label, index) => {
            const key = `${yearView}-${String(index + 1).padStart(2, '0')}`;
            const reportMonth = importedMonths.get(key);
            const selected =
              yearView === selectedYear && index + 1 === selectedMonth;
            return (
              <Button
                key={label}
                type="button"
                size="xs"
                variant={selected ? 'default' : 'ghost'}
                disabled={!reportMonth}
                className={
                  reportMonth ? undefined : 'cursor-not-allowed opacity-40'
                }
                onClick={() => {
                  if (!reportMonth) return;
                  void setMonth(reportMonth);
                  setOpen(false);
                }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
