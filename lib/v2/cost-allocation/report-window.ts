import { fiscalYearOf, type FiscalConfig } from '@/lib/v2/spend/buckets';

/**
 * One preset vocabulary for both cost-allocation reports: the summary and the
 * invoice report offer the same windows and read the same search params. What
 * they do not share is policy — which preset an unchosen window falls back to,
 * and what All Time resolves to — which `WindowPolicy` carries.
 */
export const REPORT_PERIODS = [
  'all',
  'ytd',
  'current-fy',
  'projected-fy',
  'this-quarter',
  'last-quarter',
  'this-month',
  'last-month',
  'custom',
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Everything but `custom`: a period that resolves without typed dates. */
export type PresetReportPeriod = Exclude<ReportPeriod, 'custom'>;

/** The presets a plain calendar window falls out of — no fiscal year, no bounds. */
export type CalendarReportPeriod = Exclude<
  PresetReportPeriod,
  'all' | 'current-fy' | 'projected-fy'
>;

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  all: 'All Time',
  ytd: 'Year to Date',
  'current-fy': 'Current FY',
  'projected-fy': 'Projected FY',
  'this-quarter': 'This Quarter',
  'last-quarter': 'Last Quarter',
  'this-month': 'This Month',
  'last-month': 'Last Month',
  custom: 'Custom Range',
};

/**
 * The same window read mid-sentence ("Invoices billed <phrase>"). Not the
 * label lowercased: that turns Current FY into "current fy".
 */
export const REPORT_PERIOD_PHRASES: Record<ReportPeriod, string> = {
  all: 'all time',
  ytd: 'year to date',
  'current-fy': 'this fiscal year',
  'projected-fy': 'next fiscal year',
  'this-quarter': 'this quarter',
  'last-quarter': 'last quarter',
  'this-month': 'this month',
  'last-month': 'last month',
  custom: 'in the selected range',
};

export function isReportPeriod(value: unknown): value is ReportPeriod {
  return REPORT_PERIODS.includes(value as ReportPeriod);
}

export const DEFAULT_ROLLUP_REPORT_PERIOD: PresetReportPeriod = 'current-fy';

/**
 * The ladder an empty default invoice view widens along: each period strictly
 * contains the one before it, so an empty month falls through to its quarter,
 * the year, and finally all time. `last-month` and `last-quarter` are
 * deliberately absent — different windows, not wider ones. The default is
 * the ladder's first rung by definition, so the two cannot drift apart.
 */
export const INVOICE_WIDENING_PERIODS: readonly PresetReportPeriod[] = [
  'this-month',
  'this-quarter',
  'ytd',
  'all',
];

export const DEFAULT_INVOICE_REPORT_PERIOD: PresetReportPeriod =
  INVOICE_WIDENING_PERIODS[0];

/** Half-open [start, end) as ISO dates. */
export interface ReportWindow {
  start: string;
  end: string;
}

// Every 4-digit-year ISO date sorts inside it as a string: the invoice
// report's All Time, which filters recorded billing dates rather than driving
// an engine query, so a bound at either end could only drop an invoice.
const EVERY_ISO_DATE: ReportWindow = { start: '0000-01-01', end: '9999-12-31' };

function isoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

/**
 * Calendar presets (not fiscal), in UTC so the boundaries match the engine's
 * date handling. Year to date runs through today inclusive; the month and
 * quarter presets take the whole calendar period, so an invoice dated later
 * this month still lists under "This Month".
 */
export function resolveReportWindow(
  period: CalendarReportPeriod,
  today: Date,
): ReportWindow {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const quarterStart = month - (month % 3);
  switch (period) {
    case 'this-month':
      return {
        start: isoDate(year, month, 1),
        end: isoDate(year, month + 1, 1),
      };
    case 'last-month':
      return {
        start: isoDate(year, month - 1, 1),
        end: isoDate(year, month, 1),
      };
    case 'this-quarter':
      return {
        start: isoDate(year, quarterStart, 1),
        end: isoDate(year, quarterStart + 3, 1),
      };
    case 'last-quarter':
      return {
        start: isoDate(year, quarterStart - 3, 1),
        end: isoDate(year, quarterStart, 1),
      };
    case 'ytd':
      return {
        start: isoDate(year, 0, 1),
        end: isoDate(year, month, today.getUTCDate() + 1),
      };
  }
}

export function isInReportWindow(iso: string, window: ReportWindow): boolean {
  return iso >= window.start && iso < window.end;
}

/**
 * The widest window the spend route accepts (100 years) and the FX provider
 * can price (nothing predates 2000): the summary's "All Time", and the clamp
 * for a custom range, since the engine enumerates a bucket per month.
 */
export const ENGINE_WINDOW_BOUNDS: ReportWindow = {
  start: '2000-01-01',
  end: '2100-01-01',
};

/** The org's recorded contract dates; either end is null when nothing is recorded. */
export interface ContractSpan {
  earliestStart: string | null;
  latestEnd: string | null;
}

function isoOf(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
}

/**
 * A whole org fiscal year: the window the engine resolves for `currentFY` /
 * `nextFY`, so the summary's total on the Current FY and Projected FY presets
 * is the dashboard's Current Estimated Spend and Projected Spend.
 */
function fiscalYearWindow(
  fiscalYear: number,
  fiscalConfig: FiscalConfig,
): ReportWindow {
  const startMonth0 = fiscalConfig.startMonth - 1;
  return {
    start: isoOf(fiscalYear, startMonth0),
    end: isoOf(fiscalYear + 1, startMonth0),
  };
}

function clampIso(value: string, bounds: ReportWindow): string {
  if (value < bounds.start) return bounds.start;
  if (value > bounds.end) return bounds.end;
  return value;
}

/**
 * "All Time" on the summary: the fiscal years the org actually holds contracts
 * in, snapped out to whole fiscal years.
 *
 * It cannot be the engine's full bounds. The renewal resolver takes its
 * horizon from the caller's window and never from `asOf`
 * (`generateRenewalSegments`), compounding `annual_increase` on every
 * projected cycle, so asking for 2100 makes an auto-renewing contract book
 * seventy-odd increasingly expensive years — a Total Spend in the billions
 * against a hundred fiscal years of summed budgets. Recorded term dates are
 * the natural stop: an auto-renewing contract's terms end at its current
 * cycle, and the engine already refuses to project an archived contract past
 * its latest recorded term end.
 *
 * Today is always inside the window, so the current fiscal year — the one the
 * budgets are for — is covered even when every contract has already lapsed. A
 * mis-keyed far-future term end can still stretch the range, which is what
 * `bounds` backstops.
 */
export function allTimeWindow(
  span: ContractSpan,
  fiscalConfig: FiscalConfig,
  today: Date,
  bounds: ReportWindow = ENGINE_WINDOW_BOUNDS,
): ReportWindow {
  const startMonth0 = fiscalConfig.startMonth - 1;
  const fyOf = (date: Date) => fiscalYearOf(date, fiscalConfig);
  const parse = (value: string) => new Date(`${value}T00:00:00.000Z`);

  // A term date is free-form enough to arrive malformed ("2026-99-99" sorts
  // as a plausible future date but parses to an Invalid Date, and isoOf then
  // throws). Anything that is not a real calendar date is treated as absent.
  const usable = (value: string | null) =>
    isValidIsoDate(value) ? clampIso(value, bounds) : null;

  const start = usable(span.earliestStart);
  const end = usable(span.latestEnd);
  const startSource = start ? parse(start) : today;
  const endSource = end && end > toIso(today) ? parse(end) : today;

  const firstFy = Math.min(fyOf(startSource), fyOf(today));
  const lastFy = Math.max(fyOf(endSource), fyOf(today));
  return {
    start: clampIso(isoOf(firstFy, startMonth0), bounds),
    end: clampIso(isoOf(lastFy + 1, startMonth0), bounds),
  };
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

export interface ReportWindowParams {
  period?: string;
  from?: string;
  to?: string;
}

export interface ResolvedReportWindow {
  period: ReportPeriod;
  /** Half-open [start, end). */
  window: ReportWindow;
  /** The inclusive dates the user typed; null unless the period is custom. */
  custom: { from: string; to: string } | null;
}

/**
 * All the two reports do not share. `defaultPeriod` cannot itself be `custom`,
 * so an unusable typed range always has somewhere to land. `allTime` is the
 * report's whole representable range: what the All Time preset resolves to,
 * and the bounds a typed range is clamped to.
 */
interface WindowPolicy {
  defaultPeriod: PresetReportPeriod;
  allTime: ReportWindow;
}

// The summary drives an engine query whose renewal horizon follows the window,
// so its All Time is bounded — and rollup-report narrows it further, to the
// fiscal years the org actually holds contracts in. The invoice report only
// filters recorded billing dates, where a bound could only lose an invoice.
const ROLLUP_WINDOW_POLICY: WindowPolicy = {
  defaultPeriod: DEFAULT_ROLLUP_REPORT_PERIOD,
  allTime: ENGINE_WINDOW_BOUNDS,
};

const INVOICE_WINDOW_POLICY: WindowPolicy = {
  defaultPeriod: DEFAULT_INVOICE_REPORT_PERIOD,
  allTime: EVERY_ISO_DATE,
};

function resolvePreset(
  period: PresetReportPeriod,
  today: Date,
  fiscalConfig: FiscalConfig,
  policy: WindowPolicy,
): ResolvedReportWindow {
  if (period === 'all') {
    return { period, window: policy.allTime, custom: null };
  }
  if (period === 'current-fy' || period === 'projected-fy') {
    const fiscalYear =
      fiscalYearOf(today, fiscalConfig) + (period === 'projected-fy' ? 1 : 0);
    return {
      period,
      window: fiscalYearWindow(fiscalYear, fiscalConfig),
      custom: null,
    };
  }
  return { period, window: resolveReportWindow(period, today), custom: null };
}

/**
 * A custom range is typed inclusive (`to` is the last day shown) and becomes
 * half-open here, clamped to the policy's own bounds — so a report keeps one
 * bound for All Time and typed ranges alike: the summary stays inside the
 * engine bounds, and the invoice register can be asked for a pre-2000 range
 * just as its All Time lists one. null when there is no usable range:
 * missing, malformed, reversed, or so far outside the bounds that the clamp
 * inverts it.
 */
function nextDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function resolveCustomWindow(
  params: ReportWindowParams,
  policy: WindowPolicy,
): ResolvedReportWindow | null {
  const { from, to } = params;
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || to < from) return null;
  const bounds = policy.allTime;
  // A `to` at or past the bound takes the bound as its half-open end
  // directly: advancing 9999-12-31 a day leaves 4-digit ISO dates, and the
  // lexical clamp below cannot see the expanded-year string.
  const end = to >= bounds.end ? bounds.end : nextDay(to);
  const start = from < bounds.start ? bounds.start : from;
  const clampedEnd = end > bounds.end ? bounds.end : end;
  if (start >= clampedEnd) return null;
  return {
    period: 'custom',
    window: { start, end: clampedEnd },
    custom: { from, to },
  };
}

function resolveWindowParams(
  params: ReportWindowParams,
  today: Date,
  fiscalConfig: FiscalConfig,
  policy: WindowPolicy,
): ResolvedReportWindow {
  const period = isReportPeriod(params.period)
    ? params.period
    : policy.defaultPeriod;
  if (period === 'custom') {
    return (
      resolveCustomWindow(params, policy) ??
      resolvePreset(policy.defaultPeriod, today, fiscalConfig, policy)
    );
  }
  return resolvePreset(period, today, fiscalConfig, policy);
}

/** The Cost Allocation Summary's window; defaults to the current fiscal year. */
export function resolveRollupWindow(
  params: ReportWindowParams,
  today: Date,
  fiscalConfig: FiscalConfig,
): ResolvedReportWindow {
  return resolveWindowParams(params, today, fiscalConfig, ROLLUP_WINDOW_POLICY);
}

/** The invoice report's window; defaults to this month. */
export function resolveInvoiceWindow(
  params: ReportWindowParams,
  today: Date,
  fiscalConfig: FiscalConfig,
): ResolvedReportWindow {
  return resolveWindowParams(
    params,
    today,
    fiscalConfig,
    INVOICE_WINDOW_POLICY,
  );
}
