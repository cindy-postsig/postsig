/**
 * Start-date FX for the pre-engine surfaces (PSK-1796).
 *
 * The legacy enrichment paths — product fee stamps, pricing/amendment
 * enrichment, the dashboard aggregates — all convert one way: a contract's
 * recorded amount into the org's base currency, at the rate of the day that
 * contract STARTED. That rule is the same one the engine's committed basis
 * applies; only the plumbing differs, because these callers have a contract
 * row rather than a fee segment.
 *
 * Rates come from `fxRates`, the single historical source: one prefetch for
 * the whole set, then synchronous lookups. Nothing here throws — a currency
 * the provider never quoted converts 1:1, which `isKnown` reports so callers
 * can tell a real 1.0 from a fallback.
 */

import {
  crossMultiplier,
  dailyCrossMultiplier,
  getDailyUsdRates,
  getLatestUsdRates,
  type DailyUsdRates,
} from './fxRates';

/** Matches spendRates: no contract predates it, and neither does useful history. */
const EARLIEST_FETCHABLE_DATE = '2000-01-01';

export interface BaseCurrencyRates {
  /** The currency every multiplier converts INTO. */
  target: string;
  /**
   * Multiplier turning a `from`-denominated amount into the target as of
   * `startDate`, or NULL when no quote backs it — a provider outage or an
   * exhausted quota, which a caller stamping an FX rate must disclose rather
   * than record as a fabricated 1.0.
   */
  quote(from: string, startDate: string | null): number | null;
  /** `quote` with the 1:1 fallback applied; for callers that only convert. */
  multiplier(from: string, startDate: string | null): number;
}

export interface BaseRateEntry {
  currency?: string | null;
  /** 'yyyy-MM-dd'; null uses the latest rate. */
  startDate: string | null;
}

function normalize(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase() || 'USD';
}

function identityRates(target: string): BaseCurrencyRates {
  return { target, quote: () => 1, multiplier: () => 1 };
}

/**
 * Prefetch every rate the entries can ask for. Returns an identity lookup
 * WITHOUT any fetch when every entry is already denominated in the target —
 * rate requests count against the provider quota, and an all-EUR org on a EUR
 * base needs none of them.
 */
export async function buildBaseCurrencyRates(
  entries: BaseRateEntry[],
  targetCurrency: string,
): Promise<BaseCurrencyRates> {
  const target = normalize(targetCurrency);
  const codes = [...new Set(entries.map((e) => normalize(e.currency)))];
  if (codes.every((code) => code === target)) return identityRates(target);

  const today = new Date().toISOString().slice(0, 10);
  let earliest: string | null = null;
  for (const entry of entries) {
    const date = entry.startDate?.slice(0, 10);
    if (date && (!earliest || date < earliest)) earliest = date;
  }
  const wanted = earliest ?? today;
  const from =
    wanted < EARLIEST_FETCHABLE_DATE ? EARLIEST_FETCHABLE_DATE : wanted;

  const quotes = [...codes, target];
  const [daily, latest] = await Promise.all([
    getDailyUsdRates(quotes, from < today ? from : today, today),
    getLatestUsdRates(quotes),
  ]);

  return lookup(target, daily, latest);
}

function lookup(
  target: string,
  daily: DailyUsdRates,
  latest: Record<string, number>,
): BaseCurrencyRates {
  const quote = (from: string, startDate: string | null): number | null => {
    const code = normalize(from);
    if (code === target) return 1;

    const dated = startDate
      ? dailyCrossMultiplier(code, target, startDate.slice(0, 10), daily)
      : undefined;
    if (dated !== undefined) return dated;

    // `crossMultiplier` answers 1 for an unquoted pair, which is
    // indistinguishable from a genuine parity — so check coverage first.
    const known =
      (code === 'USD' || latest[code] != null) &&
      (target === 'USD' || latest[target] != null);
    return known ? crossMultiplier(code, target, latest) : null;
  };

  return {
    target,
    quote,
    multiplier: (from, startDate) => quote(from, startDate) ?? 1,
  };
}
