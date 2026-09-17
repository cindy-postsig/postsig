'use client';

import { useState } from 'react';
import { CalendarIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDate } from '@/lib/date-format';
import {
  isReportPeriod,
  REPORT_PERIODS,
  REPORT_PERIOD_LABELS,
  type ReportPeriod,
  type ReportWindow,
} from '@/lib/v2/cost-allocation/report-window';

const PRESETS = REPORT_PERIODS.filter(
  (period): period is Exclude<ReportPeriod, 'custom'> => period !== 'custom',
);

const DAY_MS = 24 * 60 * 60 * 1000;

function lastDayOf(window: ReportWindow): string {
  return new Date(new Date(`${window.end}T00:00:00.000Z`).getTime() - DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The date filter both cost-allocation reports carry: the shared presets, plus
 * two typed fields for a range. Seeded from what the report is showing, so the
 * caller must remount it (`key`) whenever the server comes back on a different
 * window — otherwise the fields keep the dates of the window just left.
 */
export function DateRangeControl({
  period,
  window,
  custom,
  dateFormat,
  onNavigate,
  pending,
}: {
  period: ReportPeriod;
  window: ReportWindow;
  custom: { from: string; to: string } | null;
  dateFormat: string;
  onNavigate: (query: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Seeded from what the report is showing — a preset's resolved dates as much
  // as a typed range — so adjusting a preset starts from its own dates. All
  // Time resolves to a bounds sentinel rather than dates anyone meant, so its
  // fields start from today instead.
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(
    custom?.from ?? (period === 'all' ? today : window.start),
  );
  const [to, setTo] = useState(
    custom?.to ?? (period === 'all' ? today : lastDayOf(window)),
  );
  // Callback ref + state so the fields re-render once the node is attached.
  const [popoverNode, setPopoverNode] = useState<HTMLDivElement | null>(null);

  const periodName = REPORT_PERIOD_LABELS[period];
  // All Time has no meaningful span to print; every other period pairs its
  // name with the dates it resolves to.
  const range =
    period === 'all'
      ? null
      : period === 'custom' && custom
        ? `${formatDate(custom.from, dateFormat)} – ${formatDate(custom.to, dateFormat)}`
        : `${formatDate(window.start, dateFormat)} – ${formatDate(lastDayOf(window), dateFormat)}`;

  const choosePreset = (next: ReportPeriod) => {
    setOpen(false);
    onNavigate(`period=${next}`);
  };
  const applyCustom = () => {
    if (!from || !to || to < from) return;
    setOpen(false);
    onNavigate(`period=custom&from=${from}&to=${to}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="font-normal h-8 gap-1.5 px-2.5 font-sans-neue"
          aria-label="Date range"
        >
          {pending ? (
            <Spinner className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="font-medium">{periodName}</span>
          {range && <span className="text-muted-foreground">{range}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent ref={setPopoverNode} align="start" className="w-80 p-3">
        <div className="flex flex-col gap-3">
          {/* A grid, not a wrapping flex row: every preset gets the same
              width so the block reads as a set rather than a ragged line. */}
          <ToggleGroup
            type="single"
            variant="outline"
            size="xs"
            aria-label="Period"
            value={period}
            onValueChange={(next) => isReportPeriod(next) && choosePreset(next)}
            className="grid grid-cols-2 gap-1.5"
          >
            {PRESETS.map((preset) => (
              <ToggleGroupItem key={preset} value={preset} className="w-full">
                {REPORT_PERIOD_LABELS[preset]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
            <DateField
              label="From"
              value={from}
              max={to}
              pattern={dateFormat}
              onChange={setFrom}
              container={popoverNode}
            />
            <DateField
              label="To"
              value={to}
              min={from}
              pattern={dateFormat}
              onChange={setTo}
              container={popoverNode}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-7"
              disabled={!from || !to || to < from}
              onClick={applyCustom}
            >
              Apply range
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
