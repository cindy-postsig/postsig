'use client';

import { useState } from 'react';
import { CalendarIcon } from '@radix-ui/react-icons';
import { format, isValid, parse } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DATE_FORMAT_DEFAULT } from '@/lib/date-format';

// The calendar hands back local Dates and the field's value is a calendar
// day, so both directions go through local parts — never toISOString, which
// slides a picked day across the UTC boundary west of Greenwich.
const ISO_DAY = 'yyyy-MM-dd';
const toIso = (date: Date) => format(date, ISO_DAY);
const fromIso = (iso: string) => parse(iso, ISO_DAY, new Date());

/** Year bounds for the calendar's dropdown: the FX provider prices nothing
 *  before 2000, and a date past a few years out is a typo. */
const CALENDAR_START = new Date(2000, 0);
const CALENDAR_END = new Date(new Date().getFullYear() + 5, 11);

/**
 * A date typed in the user's own format, with the calendar behind its icon —
 * typing stays the fast path and the calendar is there for jumping years,
 * which is what its month/year dropdowns are for. A native `type="date"`
 * renders in the browser's locale and cannot follow the regional setting,
 * so the field is text parsed against the pattern: only a complete date in
 * that pattern reaches `onChange`; anything else clears the value and stays
 * in the box for correction.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  pattern = DATE_FORMAT_DEFAULT,
  container = null,
}: {
  label: string;
  /** ISO calendar day, or '' for none. */
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  /** The user's date-fns pattern (`lib/date-format`), for display and typing. */
  pattern?: string;
  /** Where the calendar portals. Inside another popover, pass that popover's
   *  node: a body-portalled child reads as an outside click to the parent and
   *  closes both. */
  container?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const selected = value ? fromIso(value) : undefined;
  const display = draft ?? (selected ? format(selected, pattern) : '');
  // startMonth/endMonth only bound navigation; the calendar has to refuse the
  // out-of-range days itself, or it hands back a day the field rejects.
  const outOfRange = [
    ...(min ? [{ before: fromIso(min) }] : []),
    ...(max ? [{ after: fromIso(max) }] : []),
  ];

  const typed = (text: string) => {
    const parsed = parse(text, pattern, new Date());
    // Round-tripping rejects a partial or padded entry ('2026-1-5') and a
    // two-digit year that date-fns would otherwise accept as year 26.
    if (isValid(parsed) && format(parsed, pattern) === text) {
      setDraft(null);
      onChange(toIso(parsed));
      return;
    }
    setDraft(text);
    if (value) onChange('');
  };

  return (
    <label className="flex flex-col gap-1 font-sans text-[0.7rem] text-muted-foreground">
      {label}
      <div className="relative">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={pattern.toLowerCase()}
          value={display}
          onChange={(event) => typed(event.target.value)}
          onKeyDown={(event) => {
            // Alt+ArrowDown, the combobox convention for opening the picker.
            if (event.altKey && event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className="h-8 pr-8"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Pick the ${label.toLowerCase()} date`}
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            container={container}
            className="w-auto p-0"
          >
            <Calendar
              mode="single"
              captionLayout="dropdown"
              startMonth={CALENDAR_START}
              endMonth={CALENDAR_END}
              defaultMonth={selected}
              selected={selected}
              disabled={outOfRange}
              onSelect={(date) => {
                if (!date) return;
                setDraft(null);
                onChange(toIso(date));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </label>
  );
}
