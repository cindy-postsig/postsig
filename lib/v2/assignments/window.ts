import type { AssignmentsWindow } from './types';

// The page prices one calendar month. Pure `YYYY-MM` arithmetic, so the loader
// can resolve the window and the stepper can walk it without either reaching
// for a date library.

const MONTH_PARAM = /^\d{4}-(?:0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `YYYY-MM` — the shape of the `month` search param. */
export function isAssignmentsMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PARAM.test(value);
}

/**
 * The month to show when the URL names none: the current calendar month. Any
 * month may be asked for — one after the latest seat import carries that
 * report's rate forward, which is the engine's own answer for it.
 */
export function defaultAssignmentsMonth(today: Date): string {
  return today.toISOString().slice(0, 7);
}

export function assignmentsWindow(month: string): AssignmentsWindow {
  return {
    month,
    label: `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`,
  };
}

/** Half-open `[start, end)`: the first of the month to the first of the next. */
export function monthRange(month: string): { start: Date; end: Date } {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

/** The month `months` on from this one — the stepper's back and forward. */
export function stepMonth(month: string, months: number): string {
  const stepped = monthRange(month).start;
  stepped.setUTCMonth(stepped.getUTCMonth() + months);
  return stepped.toISOString().slice(0, 7);
}
