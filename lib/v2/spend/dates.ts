// UTC date helpers shared by the window resolver and the slicers. Bucketing,
// window boundaries, and month/day walks must be timezone-independent so the
// engine yields identical output on any server (design doc, "Invariants":
// "All boundary comparisons are UTC"). date-fns interprets Date objects in the
// host's local zone, so these helpers use UTC getters/setters exclusively.
//
// Amortization / billing DIVISORS are a separate concern: they are computed
// from ISO strings and are purely relative, so they stay timezone-stable even
// when date-fns parses locally — those live with the divisor helpers.

export function parseUTCDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function formatUTCDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addUTCMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const result = new Date(date.getTime());
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  // Clamp to the target month's last day, matching date-fns addMonths.
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, daysInTargetMonth));
  return result;
}

export function addUTCDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function diffUTCDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86400000);
}

// Full months from `earlier` to `later` (later >= earlier), mirroring date-fns
// differenceInMonths for a non-negative difference.
export function fullUTCMonthsBetween(earlier: Date, later: Date): number {
  let months =
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    (later.getUTCMonth() - earlier.getUTCMonth());
  if (later.getUTCDate() < earlier.getUTCDate()) months -= 1;
  return months;
}
