/**
 * Daily USD-based FX rate store (PSK-1796).
 *
 * Every rate in this module is oriented as "quote-currency units per 1 USD",
 * matching the provider's `base_currency=USD` response. USD is the identity
 * and is never stored or fetched.
 *
 * Historical rates are immutable, so `fx_rates_daily` is a store rather than a
 * cache: reads hit Postgres first and only the spans missing from it are
 * fetched from the provider, upserted, and merged into the result.
 *
 * The same immutability lets each process keep every series it has read: a
 * span already explored is answered from memory, and the series is mirrored
 * to Redis so a cold instance loads it in one read instead of paging the
 * store. Only the days past what was explored ever touch the store or the
 * provider again.
 *
 * Nothing here throws. A provider or database failure degrades to whatever
 * rates are already known; callers fall back to 1:1 for the rest.
 */

import { cache } from 'react';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { getCacheService } from '@/app/lib/redis/cache-service';
import logger from '@/utils/pino';
import { getExchangeRates } from './currency';

const USD = 'USD';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The provider's range endpoint, called directly rather than through
 * `@everapi/currencyapi-js`: the client issues its own un-abortable fetch, so
 * a hung provider connection would pin a request for as long as the platform
 * allows. Calling it here lets the timeout below cut it loose.
 */
const RANGE_ENDPOINT = 'https://api.currencyapi.com/v3/range';
const RANGE_TIMEOUT_MS = 15_000;

/** Provider cap on a single range request; also keeps responses small. */
const MAX_SPAN_DAYS = 366;

/** PostgREST caps a response at 1000 rows, so reads are paged. */
const DB_PAGE_SIZE = 1000;

/** How long a span the provider rejected stays off the wire on this instance. */
const FAILED_SPAN_RETRY_MS = 60 * 60 * 1000;
const failedSpansUntil = new Map<string, number>();

export function resetFxProviderBackoff(): void {
  failedSpansUntil.clear();
}

/** Quote code -> 'yyyy-MM-dd' -> units of that quote per 1 USD. */
export type DailyUsdRates = Map<string, Map<string, number>>;

export interface DateSpan {
  start: string;
  end: string;
}

interface RateRow {
  rate_date: string;
  quote: string;
  rate: number;
}

/** One point in the range, e.g. `2022-01-01T23:59:59Z` for accuracy=day. */
interface RangeEntry {
  datetime?: string;
  currencies?: Record<string, { code: string; value: number }>;
}

interface RangeResponse {
  data?: RangeEntry[];
}

/**
 * One quote's rates plus the stretches of dates already explored for it. The
 * two differ: the provider quotes nothing on weekends and holidays, so
 * `explored` reaches over days `rates` has no entry for, and those days are
 * never asked about again. The stretches are kept disjoint and sorted: two
 * reads that never touched leave the gap between them unexplored, so a later
 * read inside that gap still reaches the store and the provider.
 */
interface QuoteSeries {
  rates: Map<string, number>;
  explored: DateSpan[];
}

const seriesByQuote = new Map<string, QuoteSeries>();

/** Fills in flight per (quotes, span), so concurrent cold reads share one. */
const fillsInFlight = new Map<string, Promise<void>>();

/** Bumped whenever the Redis entry's shape changes. v2 = explored as spans. */
const SERIES_CACHE_VERSION = 'v2';
/** Long enough that a quote read every day never expires; unused ones do. */
const SERIES_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

interface StoredSeries {
  gz: string;
  explored: DateSpan[];
}

export function resetFxRateSeries(): void {
  seriesByQuote.clear();
  fillsInFlight.clear();
}

/**
 * Trim, uppercase, de-duplicate, and drop USD (the identity) and empty codes.
 * Trimming matters because these codes key a store shared with `baseRates`,
 * whose own normalize trims — ' eur ' and 'EUR' must not become two quotes.
 */
export function normalizeQuotes(quotes: string[]): string[] {
  return [
    ...new Set(
      quotes
        .map((quote) => quote?.trim().toUpperCase())
        .filter((quote) => !!quote),
    ),
  ].filter((quote) => quote !== USD);
}

function parseDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  return formatDate(parseDate(date) + days * DAY_MS);
}

/** Split a span into consecutive chunks of at most `maxDays` days each. */
export function chunkSpan(
  span: DateSpan,
  maxDays: number = MAX_SPAN_DAYS,
): DateSpan[] {
  const chunks: DateSpan[] = [];
  let start = span.start;
  while (start <= span.end) {
    const chunkEnd = shiftDate(start, maxDays - 1);
    const end = chunkEnd < span.end ? chunkEnd : span.end;
    chunks.push({ start, end });
    start = shiftDate(end, 1);
  }
  return chunks;
}

/**
 * Spans of [fromDate, toDate] that were never fetched for a quote.
 *
 * Coverage is judged by the envelope of the dates already stored, not by every
 * individual day: the provider legitimately omits days (weekends, holidays,
 * outages), and treating those holes as missing would make every subsequent
 * read hit the API again. Only the stretches before the first and after the
 * last stored date are unexplored.
 */
export function missingSpans(
  storedDates: ReadonlySet<string>,
  fromDate: string,
  toDate: string,
): DateSpan[] {
  if (fromDate > toDate) return [];
  if (storedDates.size === 0) return [{ start: fromDate, end: toDate }];

  const sorted = [...storedDates].sort();
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];

  const spans: DateSpan[] = [];
  if (fromDate < earliest) {
    spans.push({ start: fromDate, end: shiftDate(earliest, -1) });
  }
  if (toDate > latest) {
    spans.push({ start: shiftDate(latest, 1), end: toDate });
  }
  return spans;
}

/**
 * Collapse overlapping or adjacent spans. Quotes usually share the same gaps,
 * so this turns N identical per-quote spans into one provider request.
 */
export function mergeSpans(spans: DateSpan[]): DateSpan[] {
  const sorted = [...spans].sort((a, b) => a.start.localeCompare(b.start));
  const merged: DateSpan[] = [];
  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && span.start <= shiftDate(previous.end, 1)) {
      if (span.end > previous.end) previous.end = span.end;
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

/**
 * Multiplier turning an amount denominated in `from` into `to`.
 * Rates are quote-per-USD, so the USD leg cancels out. A rate we never
 * obtained yields 1 (the fetch path already logged the failure).
 */
export function crossMultiplier(
  from: string,
  to: string,
  usdRates: { [code: string]: number },
): number {
  const fromCode = from?.toUpperCase() || USD;
  const toCode = to?.toUpperCase() || USD;
  if (fromCode === toCode) return 1;

  const fromRate = fromCode === USD ? 1 : usdRates[fromCode];
  const toRate = toCode === USD ? 1 : usdRates[toCode];
  if (!fromRate || !toRate) return 1;

  return toRate / fromRate;
}

/** Days a same-day quote may be missing before `dailyCrossMultiplier` gives up. */
const MAX_RATE_LOOKBACK_DAYS = 7;

/**
 * `from -> to` multiplier on `date`, taken from the nearest STORED day at or
 * before it.
 *
 * The provider quotes nothing on weekends, holidays or outage days, so an
 * exact-day miss is routine rather than exceptional: a term starting on a
 * Sunday must convert at Friday's rate, not at 1:1. Returns undefined when no
 * day within `lookbackDays` quotes both sides — including every date past the
 * stored range — leaving the fallback (today's rate) to the caller.
 */
export function dailyCrossMultiplier(
  from: string,
  to: string,
  date: string,
  daily: DailyUsdRates,
  lookbackDays: number = MAX_RATE_LOOKBACK_DAYS,
): number | undefined {
  const fromCode = from?.toUpperCase() || USD;
  const toCode = to?.toUpperCase() || USD;
  if (fromCode === toCode) return 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;

  const fromRates = fromCode === USD ? undefined : daily.get(fromCode);
  const toRates = toCode === USD ? undefined : daily.get(toCode);
  if ((fromCode !== USD && !fromRates) || (toCode !== USD && !toRates)) {
    return undefined;
  }

  let day = date;
  for (let step = 0; step <= lookbackDays; step += 1) {
    const fromRate = fromCode === USD ? 1 : fromRates?.get(day);
    const toRate = toCode === USD ? 1 : toRates?.get(day);
    if (fromRate && toRate) return toRate / fromRate;
    day = shiftDate(day, -1);
  }
  return undefined;
}

/**
 * Average `from -> to` multiplier per calendar month.
 *
 * The average is taken over the daily cross rates, not over each currency's
 * monthly average: avg(b_d / a_d) is the rate a spender actually experienced,
 * while avg(b) / avg(a) is a different number whenever the two currencies move
 * on different days. Months with no day where both rates are known are absent
 * from the result rather than defaulted.
 */
export function monthlyAverageMultipliers(
  from: string,
  to: string,
  months: string[],
  daily: DailyUsdRates,
): Map<string, number> {
  const fromCode = from?.toUpperCase() || USD;
  const toCode = to?.toUpperCase() || USD;
  const wanted = new Set(months);
  const result = new Map<string, number>();

  if (fromCode === toCode) {
    for (const month of wanted) result.set(month, 1);
    return result;
  }

  const fromRates = daily.get(fromCode);
  const toRates = daily.get(toCode);
  // USD holds on every day, so the non-USD side supplies the candidate days.
  const candidateDays = fromCode === USD ? toRates : fromRates;
  if (!candidateDays) return result;

  const totals = new Map<string, { sum: number; count: number }>();
  for (const date of candidateDays.keys()) {
    const month = date.slice(0, 7);
    if (!wanted.has(month)) continue;

    const fromRate = fromCode === USD ? 1 : fromRates?.get(date);
    const toRate = toCode === USD ? 1 : toRates?.get(date);
    if (!fromRate || !toRate) continue;

    const total = totals.get(month) ?? { sum: 0, count: 0 };
    total.sum += toRate / fromRate;
    total.count += 1;
    totals.set(month, total);
  }

  for (const [month, total] of totals) {
    result.set(month, total.sum / total.count);
  }
  return result;
}

/** Yesterday (UTC): the latest day whose rate can exist. */
function lastCompleteDay(): string {
  return formatDate(Date.now() - DAY_MS);
}

/**
 * Daily USD rates for `quotes` across [fromDate, toDate], read-through:
 * stored rows first, then one provider request per unexplored span.
 *
 * Reads stop at yesterday whatever `toDate` says. A day's rate exists only
 * once the day is over, and the provider rejects any range ending after now
 * (422) — so a span through today meant a doomed provider call on every read,
 * with nothing stored to spare the next one. Today's rate is
 * `getLatestUsdRates`'s job, which every consumer's lookup already falls
 * back to.
 */
export function getDailyUsdRates(
  quotes: string[],
  fromDate: string,
  toDate: string,
): Promise<DailyUsdRates> {
  return readDailyUsdRates(
    [...normalizeQuotes(quotes)].sort().join(','),
    fromDate,
    toDate,
  );
}

/**
 * One read per span per request: pricing enrichment and the engine's rate
 * provider ask for the same span back to back, and `cache` keys on these
 * primitives (never on the callers' arrays). The codes reach it sorted, so
 * callers naming the same quotes in a different order share that one read.
 */
const readDailyUsdRates = cache(
  async (
    codeList: string,
    fromDate: string,
    toDate: string,
  ): Promise<DailyUsdRates> => {
    const codes = codeList === '' ? [] : codeList.split(',');
    const yesterday = lastCompleteDay();
    const end = toDate < yesterday ? toDate : yesterday;
    if (codes.length > 0 && fromDate <= end) {
      await fillSeries(codes, fromDate, end);
    }
    return new Map(
      codes.map((code) => [
        code,
        sliceSeries(seriesOf(code).rates, fromDate, end),
      ]),
    );
  },
);

function seriesOf(quote: string): QuoteSeries {
  let series = seriesByQuote.get(quote);
  if (!series) {
    series = { rates: new Map(), explored: [] };
    seriesByQuote.set(quote, series);
  }
  return series;
}

function sliceSeries(
  rates: Map<string, number>,
  fromDate: string,
  toDate: string,
): Map<string, number> {
  const slice = new Map<string, number>();
  for (const [date, rate] of rates) {
    if (date >= fromDate && date <= toDate) slice.set(date, rate);
  }
  return slice;
}

/** The parts of [fromDate, toDate] that no explored stretch covers. */
function unexploredSpans(
  series: QuoteSeries,
  fromDate: string,
  toDate: string,
): DateSpan[] {
  let remaining: DateSpan[] = [{ start: fromDate, end: toDate }];
  for (const explored of series.explored) {
    remaining = remaining.flatMap((span) => {
      if (explored.end < span.start || explored.start > span.end) return [span];
      const parts: DateSpan[] = [];
      if (explored.start > span.start) {
        parts.push({ start: span.start, end: shiftDate(explored.start, -1) });
      }
      if (explored.end < span.end) {
        parts.push({ start: shiftDate(explored.end, 1), end: span.end });
      }
      return parts;
    });
  }
  return remaining;
}

function sameSpans(a: DateSpan[], b: DateSpan[]): boolean {
  return (
    a.length === b.length &&
    a.every((span, i) => span.start === b[i].start && span.end === b[i].end)
  );
}

/**
 * Brings every series up to cover [fromDate, toDate]: Redis for quotes this
 * process has never seen, then the store for the stretches outside what was
 * explored, then the provider for what the store lacks. Concurrent calls for
 * the same quotes and span wait on the first one rather than each paging the
 * store.
 */
function fillSeries(
  codes: string[],
  fromDate: string,
  toDate: string,
): Promise<void> {
  const key = `${codes.join(',')}:${fromDate}:${toDate}`;
  const inFlight = fillsInFlight.get(key);
  if (inFlight) return inFlight;

  const fill = (async () => {
    await hydrateFromRedis(codes.filter((code) => !seriesByQuote.has(code)));

    const supabase = createServiceClient();
    const grown = new Set<string>();
    for (const [span, spanCodes] of storeSpans(codes, fromDate, toDate)) {
      await readStoredRates(supabase, spanCodes, span, grown);
    }

    // The provider is asked only for the unexplored stretches the store left
    // empty, judged by the rates now held inside each stretch (`missingSpans`'
    // rule). A stretch explored earlier stays out even when no row exists
    // for it: that is what a weekend looks like.
    const providerSpans = mergeSpans(
      codes.flatMap((code) => {
        const series = seriesOf(code);
        return unexploredSpans(series, fromDate, toDate).flatMap((span) =>
          missingSpans(
            new Set(sliceSeries(series.rates, span.start, span.end).keys()),
            span.start,
            span.end,
          ),
        );
      }),
    ).flatMap((span) => chunkSpan(span));
    let complete = true;
    if (providerSpans.length > 0) {
      const fetched = await fetchRangeRates(codes, providerSpans);
      complete = fetched.complete;
      for (const row of fetched.rows) {
        seriesOf(row.quote).rates.set(row.rate_date, row.rate);
        grown.add(row.quote);
      }
      if (fetched.rows.length > 0) await persistRates(supabase, fetched.rows);
    }

    // A span the provider answered — even with no rows, as it does for a
    // weekend — is explored and not asked about again. A failed provider call
    // leaves the whole stretch unexplored so the next read retries it once
    // the backoff lapses: only the provider can say whether a day the store
    // lacks is empty or merely unread.
    if (complete) {
      for (const code of codes) {
        const series = seriesOf(code);
        const explored = mergeSpans([
          ...series.explored,
          { start: fromDate, end: toDate },
        ]);
        if (sameSpans(explored, series.explored)) continue;
        series.explored = explored;
        grown.add(code);
      }
    }

    await persistSeries([...grown]);
  })().finally(() => {
    fillsInFlight.delete(key);
  });
  fillsInFlight.set(key, fill);
  return fill;
}

/**
 * The stretches of [fromDate, toDate] outside each quote's explored spans,
 * grouped so quotes missing the same stretch share one store read.
 */
function storeSpans(
  codes: string[],
  fromDate: string,
  toDate: string,
): Array<[DateSpan, string[]]> {
  const groups = new Map<string, { span: DateSpan; codes: string[] }>();
  for (const code of codes) {
    const spans = unexploredSpans(seriesOf(code), fromDate, toDate);
    for (const span of spans) {
      const key = `${span.start}:${span.end}`;
      const group = groups.get(key);
      if (group) group.codes.push(code);
      else groups.set(key, { span, codes: [code] });
    }
  }
  return [...groups.values()].map((group) => [group.span, group.codes]);
}

function seriesCacheKey(quote: string): string {
  return `fx:daily:${SERIES_CACHE_VERSION}:${quote}`;
}

function encodeSeries(series: QuoteSeries): StoredSeries {
  return {
    gz: gzipSync(Buffer.from(JSON.stringify([...series.rates]))).toString(
      'base64',
    ),
    explored: series.explored,
  };
}

function decodeSeries(stored: StoredSeries): QuoteSeries {
  const pairs = JSON.parse(
    gunzipSync(Buffer.from(stored.gz, 'base64')).toString('utf8'),
  ) as Array<[string, number]>;
  return {
    rates: new Map(pairs),
    explored: Array.isArray(stored.explored) ? stored.explored : [],
  };
}

async function hydrateFromRedis(quotes: string[]): Promise<void> {
  if (quotes.length === 0) return;

  let stored: (StoredSeries | null)[] = quotes.map(() => null);
  try {
    const cacheService = await getCacheService();
    stored = await cacheService.redisService.mget<StoredSeries>(
      quotes.map(seriesCacheKey),
      undefined,
    );
  } catch (error) {
    logger.warn({ err: error, quotes }, 'Failed to read FX rate series');
  }

  quotes.forEach((quote, index) => {
    // Registered even when empty, so a quote Redis does not hold is not
    // looked up there on every read.
    const series = seriesOf(quote);
    const entry = stored[index];
    if (!entry?.gz) return;
    try {
      const decoded = decodeSeries(entry);
      for (const [date, rate] of decoded.rates) series.rates.set(date, rate);
      series.explored = mergeSpans([...series.explored, ...decoded.explored]);
    } catch (error) {
      logger.warn({ err: error, quote }, 'Discarding unreadable FX series');
    }
  });
}

async function persistSeries(quotes: string[]): Promise<void> {
  if (quotes.length === 0) return;
  try {
    const cacheService = await getCacheService();
    await cacheService.redisService.mset(
      quotes.map((quote) => ({
        key: seriesCacheKey(quote),
        value: encodeSeries(seriesOf(quote)),
      })),
      undefined,
      SERIES_CACHE_TTL_SECONDS,
    );
  } catch (error) {
    logger.warn({ err: error, quotes }, 'Failed to store FX rate series');
  }
}

/**
 * Today's rates in this module's orientation. `getExchangeRates` returns the
 * inverse (quote -> USD) off a shared Redis cache, so it is re-inverted here
 * rather than issuing a second provider call.
 */
export function getLatestUsdRates(
  quotes: string[],
): Promise<Record<string, number>> {
  return readLatestUsdRates([...normalizeQuotes(quotes)].sort().join(','));
}

/**
 * Same reason `readDailyUsdRates` exists: `cache` keys on the joined primitive,
 * never on the callers' arrays, so the many callers asking for the same quotes
 * within one request share a single Redis read.
 */
const readLatestUsdRates = cache(
  async (codeList: string): Promise<Record<string, number>> => {
    const codes = codeList === '' ? [] : codeList.split(',');
    const rates: Record<string, number> = { USD: 1 };
    if (codes.length === 0) return rates;

    const toUsdRates = await getExchangeRates(codes);
    for (const code of codes) {
      const toUsd = toUsdRates[code];
      if (toUsd) rates[code] = 1 / toUsd;
    }
    return rates;
  },
);

type ServiceClient = ReturnType<typeof createServiceClient>;

async function readStoredRates(
  supabase: ServiceClient,
  codes: string[],
  span: DateSpan,
  grown: Set<string>,
): Promise<void> {
  // Only the first page asks for the total: PostgREST runs a count query for
  // every request that carries the preference, and the later pages need
  // none. Ordering ends on the primary key so paging over several quotes
  // neither skips nor repeats a row.
  const readPage = (offset: number) =>
    supabase
      .from('fx_rates_daily')
      .select('rate_date, quote, rate', offset === 0 ? { count: 'exact' } : {})
      .in('quote', codes)
      .gte('rate_date', span.start)
      .lte('rate_date', span.end)
      .order('rate_date')
      .order('quote')
      .range(offset, offset + DB_PAGE_SIZE - 1);

  // The first page carries the total, so the rest are read concurrently: a
  // span back to a contract's first term runs to tens of pages, and reading
  // them one after another cost a second or more on every render.
  const first = await readPage(0);
  const total = first.count ?? first.data?.length ?? 0;
  const offsets: number[] = [];
  for (let offset = DB_PAGE_SIZE; offset < total; offset += DB_PAGE_SIZE) {
    offsets.push(offset);
  }
  const rest = await Promise.all(offsets.map(readPage));

  // Pages are date-ordered, so the merge stops at the first failed one and
  // drops what came after it. Keeping those later rows would bury the hole
  // inside the stored envelope, where `missingSpans` cannot see it; ending
  // here leaves the gap trailing, and the provider is asked for it.
  for (const page of [first, ...rest]) {
    if (page.error) {
      logger.warn(
        { error: page.error, codes },
        'Failed to read stored FX rates',
      );
      return;
    }
    for (const row of page.data ?? []) {
      seriesOf(row.quote).rates.set(row.rate_date, row.rate);
      grown.add(row.quote);
    }
  }
}

function spanKey(codes: string[], span: DateSpan): string {
  return `${[...codes].sort().join(',')}:${span.start}:${span.end}`;
}

/**
 * Rows the provider returned for `spans`, and whether every span was
 * answered — a span that failed (or is still backed off from an earlier
 * failure) leaves `complete` false so the caller does not mark it explored.
 */
async function fetchRangeRates(
  codes: string[],
  spans: DateSpan[],
): Promise<{ rows: RateRow[]; complete: boolean }> {
  const rows: RateRow[] = [];
  const wanted = new Set(codes);
  const now = Date.now();
  for (const [key, until] of failedSpansUntil) {
    if (until <= now) failedSpansUntil.delete(key);
  }
  const due = spans.filter(
    (span) => !failedSpansUntil.has(spanKey(codes, span)),
  );
  if (due.length === 0) return { rows, complete: false };

  try {
    const apiKey = process.env.CURRENCY_API_KEY;
    if (!apiKey) {
      throw new Error('CURRENCY_API_KEY environment variable is not set');
    }

    for (const span of due) {
      const url = new URL(RANGE_ENDPOINT);
      url.searchParams.set('datetime_start', `${span.start}T00:00:00Z`);
      url.searchParams.set('datetime_end', `${span.end}T23:59:59Z`);
      url.searchParams.set('accuracy', 'day');
      url.searchParams.set('base_currency', USD);
      url.searchParams.set('currencies', codes.join(','));

      const httpResponse = await fetch(url, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(RANGE_TIMEOUT_MS),
      });
      if (!httpResponse.ok) {
        throw new Error(
          `FX range request failed with status ${httpResponse.status}`,
        );
      }
      const response = (await httpResponse.json()) as RangeResponse;

      // `range` with accuracy=day returns one entry per day, stamped
      // `2022-01-01T23:59:59Z`; the date half is the rate date.
      for (const entry of response.data ?? []) {
        const rateDate = entry.datetime?.slice(0, 10);
        if (!rateDate) continue;
        for (const [code, quoted] of Object.entries(entry.currencies ?? {})) {
          if (wanted.has(code) && Number.isFinite(quoted?.value)) {
            rows.push({ rate_date: rateDate, quote: code, rate: quoted.value });
          }
        }
      }
    }
  } catch (error) {
    // Degrade to the rows already collected: an FX outage must not fail the
    // surfaces that render amounts. The spans stay off the wire for a while,
    // or every read on this instance would repeat the failed call. Logged
    // under `err` — pino serializes an Error only under that key.
    for (const span of due) {
      failedSpansUntil.set(spanKey(codes, span), now + FAILED_SPAN_RETRY_MS);
    }
    logger.warn(
      { err: error, codes, spans: due },
      'Failed to fetch FX rates from the provider',
    );
    return { rows, complete: false };
  }

  return { rows, complete: due.length === spans.length };
}

async function persistRates(
  supabase: ServiceClient,
  rows: RateRow[],
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += DB_PAGE_SIZE) {
    const { error } = await supabase
      .from('fx_rates_daily')
      .upsert(rows.slice(offset, offset + DB_PAGE_SIZE), {
        onConflict: 'rate_date,quote',
      });
    if (error) {
      logger.warn({ error }, 'Failed to store fetched FX rates');
      return;
    }
  }
}
