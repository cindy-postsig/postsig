import type { SpendContractInput } from './contractInput';
import { bucketKey } from './buckets';
import { toCents } from './grouping';
import type { Placed, Placer } from './pipeline';
import type {
  CurrencyPolicy,
  FeeSegment,
  FiscalConfig,
  SpendGranularity,
} from './types';

/**
 * Base-currency conversion, expressed as two `Placer` decorators.
 *
 * Conversion is a PLACEMENT concern, not a resolution one: the rate to apply
 * depends on when the money is recognised, which is exactly what a placer
 * decides. Wrapping the placer also puts conversion strictly BEFORE the
 * pipeline's accumulator, so every groupBy sums amounts already denominated in
 * one currency and additivity survives untouched.
 *
 * The engine stays pure and synchronous throughout: rates arrive prefetched on
 * the policy (SpendRateProvider) and are only ever looked up here.
 */

/** The 'base' arm of CurrencyPolicy: a target display currency plus its rates. */
export type BaseCurrencyPolicy = Extract<CurrencyPolicy, { mode: 'base' }>;

// Currency codes reach the engine in whatever case the row was written in, so
// the identity test — is this amount already denominated in the target? —
// compares normalized codes.
function normalize(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase();
}

/**
 * Contract-Term rule: every slice of a term converts at the rate of the day
 * that TERM started, so a contract renewing across years converts each cycle at
 * its own term-start rate rather than one blended rate. Segments carry
 * `termStart` for exactly this; an unstamped segment falls back to its own
 * start. An amount already in the target is returned untouched — multiplying by
 * an identity rate would only add float noise.
 */
export function convertAtTermStart(
  segments: FeeSegment[],
  policy: BaseCurrencyPolicy,
): FeeSegment[] {
  const target = normalize(policy.target);
  return segments.map((segment) => {
    if (normalize(segment.currency) === target) return segment;
    const rate = policy.rates.dateRate(
      segment.currency,
      segment.termStart ?? segment.from,
    );
    return { ...segment, fee: toCents(segment.fee * rate) };
  });
}

/**
 * Zips a native placement run onto the converted one. Placement is pure date
 * math over the segments — the two runs differ only in fee magnitudes — so
 * they produce the same period (and product) keys; the native value is looked
 * up by that key rather than recovered by dividing the converted figure, which
 * is cents-rounded and would not land back on the native amount exactly.
 */
function zipNative<T extends Placed>(
  converted: T[],
  native: T[],
  keyOf: (item: T) => string,
): T[] {
  const nativeByKey = new Map(native.map((item) => [keyOf(item), item.value]));
  return converted.map((item) => ({
    ...item,
    native: nativeByKey.get(keyOf(item)) ?? 0,
  }));
}

/**
 * Converts SEGMENTS at their term-start rate, then delegates. Used wherever the
 * value IS the term — basis 'committed' and all three event views — so the
 * decorated placer sees fees that are already in the target currency and every
 * downstream valuation (term totals, per-product shares, cancel-by dating)
 * inherits the conversion without knowing about it.
 *
 * Each placement also carries its pre-conversion amount: an identity contract's
 * native IS its value, and a converted contract runs the inner placer once more
 * over the unconverted segments. Only foreign-currency contracts pay for the
 * second pass.
 */
export function withTermStartConversion(
  placer: Placer,
  policy: BaseCurrencyPolicy,
): Placer {
  const isIdentity = (contract: SpendContractInput) =>
    normalize(contract.currency || 'usd') === normalize(policy.target);
  return {
    total: (segments, contract, window) => {
      const converted = placer.total(
        convertAtTermStart(segments, policy),
        contract,
        window,
      );
      if (isIdentity(contract)) {
        return converted.map((item) => ({ ...item, native: item.value }));
      }
      return zipNative(
        converted,
        placer.total(segments, contract, window),
        (item) => item.period,
      );
    },
    byProduct: (segments, contract, window) => {
      const converted = placer.byProduct(
        convertAtTermStart(segments, policy),
        contract,
        window,
      );
      if (isIdentity(contract)) {
        return converted.map((item) => ({ ...item, native: item.value }));
      }
      return zipNative(
        converted,
        placer.byProduct(segments, contract, window),
        (item) => `${item.productId}|${item.period}`,
      );
    },
  };
}

function monthStart(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

/**
 * Converts each MONTH's placed value at that month's rate, then re-buckets to
 * the granularity the caller asked for. Collisions (twelve months landing in
 * one fiscal year) sum with the running cents-rounding the slicers use, so a
 * converted year equals the sum of its converted months.
 */
function convertMonthly<T extends Placed>(
  placed: T[],
  contract: SpendContractInput,
  policy: BaseCurrencyPolicy,
  requestedGranularity: SpendGranularity,
  fiscalConfig: FiscalConfig,
  seriesKeyOf: (item: T) => string,
): T[] {
  const from = contract.currency || 'usd';
  const isIdentity = normalize(from) === normalize(policy.target);
  const buckets = new Map<
    string,
    { item: T; period: string; value: number; native: number }
  >();

  for (const item of placed) {
    // The inner placer runs at granularity 'month', so `item.period` IS the
    // calendar month key the rate is quoted for (see bucketKey) — and its
    // value is the pre-conversion amount, which re-buckets alongside the
    // converted one as the placement's `native`.
    const value = isIdentity
      ? item.value
      : toCents(item.value * policy.rates.monthRate(from, item.period));
    const period = bucketKey(
      monthStart(item.period),
      requestedGranularity,
      fiscalConfig,
    );
    const key = `${seriesKeyOf(item)}|${period}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.value = toCents(existing.value + value);
      existing.native = toCents(existing.native + item.value);
    } else {
      buckets.set(key, { item, period, value, native: item.value });
    }
  }

  return [...buckets.values()].map(({ item, period, value, native }) => ({
    ...item,
    period,
    value,
    native,
  }));
}

/**
 * Converts by CALENDAR MONTH — the flow bases (amortized, actual), where each
 * month of service or each bill is recognised on its own date and so carries
 * its own rate.
 *
 * PRECONDITION: `innerMonthPlacer` must have been built at granularity 'month'.
 * Monthly rates cannot be applied to a value already collapsed into a fiscal
 * year, so the caller slices monthly and this decorator re-buckets afterwards.
 */
export function withMonthlyConversion(
  innerMonthPlacer: Placer,
  policy: BaseCurrencyPolicy,
  requestedGranularity: SpendGranularity,
  fiscalConfig: FiscalConfig,
): Placer {
  return {
    total: (segments, contract, window) =>
      convertMonthly(
        innerMonthPlacer.total(segments, contract, window),
        contract,
        policy,
        requestedGranularity,
        fiscalConfig,
        () => 'total',
      ),
    byProduct: (segments, contract, window) =>
      convertMonthly(
        innerMonthPlacer.byProduct(segments, contract, window),
        contract,
        policy,
        requestedGranularity,
        fiscalConfig,
        (item) => String(item.productId),
      ),
  };
}
