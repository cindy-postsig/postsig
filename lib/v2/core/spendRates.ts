/**
 * Builds the spend engine's `SpendRateProvider` — the prefetched FX the
 * 'base' currency policy looks rates up in (PSK-1796).
 *
 * The engine is pure and synchronous, so every rate a query can need is
 * fetched HERE, at the async boundary, and handed in as a lookup table. That
 * means one bounded set of reads per request instead of a fetch hiding inside
 * a hot loop.
 *
 * Nothing in here throws: `fxRates` degrades to whatever it knows and the
 * lookups below degrade to 1, which is the identity conversion — an FX outage
 * shows unconverted amounts rather than an error page.
 */

import type { SpendContractInput } from '@/lib/v2/spend/contractInput';
import { readTermDateEntries } from '@/lib/v2/spend/contractInput';
import type { SpendRateProvider } from '@/lib/v2/spend/types';
import {
  crossMultiplier,
  dailyCrossMultiplier,
  getDailyUsdRates,
  getLatestUsdRates,
  monthlyAverageMultipliers,
  type DailyUsdRates,
} from './fxRates';

/**
 * No contract predates this, and the provider's own history is thinner than
 * it. Without the floor a sentinel window start (the price-history page opens
 * at 1970) or a typo'd term start would request decades of daily rates.
 */
const EARLIEST_FETCHABLE_DATE = '2000-01-01';

/**
 * Every amount is already in the target: the engine skips identity
 * conversions anyway, so the only thing this saves is the fetch — which is the
 * point. An all-EUR org on a EUR base must never touch the rate provider.
 */
const IDENTITY: SpendRateProvider = { monthRate: () => 1, dateRate: () => 1 };

/** Only these two fields decide which rates a contract can ask for. */
type RateContractInput = Pick<
  SpendContractInput,
  'currency' | 'term_start_date'
>;

export interface SpendRateProviderInput {
  contracts: RateContractInput[];
  /** The org's base display currency; every multiplier converts INTO it. */
  target: string;
  asOf: Date;
  /**
   * Union of the windows the caller will query, half-open. Sizes the monthly
   * averages, and under `dailyRange: 'span'` the daily range as well.
   */
  span: { start: Date; end: Date };
  /**
   * How far back the DAILY rates reach. Only term-start conversion asks for a
   * rate by date (the committed basis and the renewals / tcv / commitments
   * kinds), and a term start routinely predates the window, so those callers
   * need the default 'term-starts'. The flow bases only ever read a month's
   * average from inside the span, and reaching back to a term start decades
   * old costs thousands of daily rows per currency — 'span' skips it.
   */
  dailyRange?: 'span' | 'term-starts';
}

function normalize(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase() || 'USD';
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Every 'YYYY-MM' touched by the half-open range [start, end). */
function monthsIn(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  while (cursor < end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/** Earliest recorded term start across the set, as 'yyyy-MM-dd'. */
function earliestTermStart(contracts: RateContractInput[]): string | null {
  let earliest: string | null = null;
  for (const contract of contracts) {
    // Untyped JSON column: a writer that stored an object here (invoice-sync
    // once did) must not take the whole org's rate provider down.
    if (!Array.isArray(contract.term_start_date)) continue;
    for (const entry of readTermDateEntries(contract.term_start_date)) {
      const date = entry?.date?.slice(0, 10);
      if (date && (!earliest || date < earliest)) earliest = date;
    }
  }
  return earliest;
}

export async function buildSpendRateProvider(
  input: SpendRateProviderInput,
): Promise<SpendRateProvider> {
  const target = normalize(input.target);
  const quotes = [
    ...new Set(input.contracts.map((c) => normalize(c.currency))),
  ];
  if (quotes.every((quote) => quote === target)) return IDENTITY;

  const today = toIsoDate(input.asOf);
  const spanStart = toIsoDate(input.span.start);
  const termStart =
    input.dailyRange === 'span' ? null : earliestTermStart(input.contracts);
  const wanted = termStart && termStart < spanStart ? termStart : spanStart;
  const from =
    wanted < EARLIEST_FETCHABLE_DATE ? EARLIEST_FETCHABLE_DATE : wanted;

  const codes = [...quotes, target];
  const [daily, latest] = await Promise.all([
    getDailyUsdRates(codes, from < today ? from : today, today),
    getLatestUsdRates(codes),
  ]);

  const months = monthsIn(input.span.start, input.span.end);
  const monthly = new Map<string, Map<string, number>>();
  for (const quote of quotes) {
    if (quote === target) continue;
    monthly.set(quote, monthlyAverageMultipliers(quote, target, months, daily));
  }

  return buildProvider(target, daily, latest, monthly);
}

function buildProvider(
  target: string,
  daily: DailyUsdRates,
  latest: Record<string, number>,
  monthly: Map<string, Map<string, number>>,
): SpendRateProvider {
  return {
    // A month outside the prefetched span — or one no day quoted — falls back
    // to today's cross. That is also the honest answer for the current and
    // future months an average cannot exist for yet.
    monthRate(from: string, monthKey: string): number {
      const code = normalize(from);
      if (code === target) return 1;
      return (
        monthly.get(code)?.get(monthKey) ??
        crossMultiplier(code, target, latest)
      );
    },
    dateRate(from: string, isoDate: string): number {
      const code = normalize(from);
      if (code === target) return 1;
      return (
        dailyCrossMultiplier(code, target, isoDate, daily) ??
        crossMultiplier(code, target, latest)
      );
    },
  };
}
