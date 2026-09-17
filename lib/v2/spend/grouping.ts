import { contractOwners, ownerSponsorNames } from '@/lib/v2/owners/embed';
import type { RawContractOwnerRow } from '@/lib/v2/owners/types';
import type { SpendLineItem } from './types';

export function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * groupBy 'sponsor' keys: the contract's owner sponsors by display name. A
 * contract with no sponsor routes to 'unassigned' so it still contributes to
 * the per-period total (additivity).
 */
export function sponsorKeys(contract: {
  contract_owners?: readonly RawContractOwnerRow[] | null;
}): string[] {
  const names = ownerSponsorNames(contractOwners(contract))
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return names.length === 0 ? ['unassigned'] : names;
}

// Cents-preserving even split: the per-key pieces sum back to `value` exactly,
// so splitting a line across sponsors keeps sum-over-sponsors == total (no lost
// cent from naive division). The first `remainder` keys absorb the odd cent.
export function splitEvenly(
  value: number,
  keys: string[],
): Array<[string, number]> {
  const n = keys.length;
  const totalCents = Math.round(value * 100);
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return keys.map((key, index) => [
    key,
    (base + (index < remainder ? 1 : 0)) / 100,
  ]);
}

// (period, groupKey)-keyed accumulator shared by querySpend and the sibling
// queries. The governing invariant is additivity — for any groupBy, summing
// all buckets for a period equals the 'total' value for that period. Period
// keys never contain a space, so the first space is an unambiguous separator
// even when a sponsor groupKey has spaces.
//
// Sums stay RAW until `items()` rounds them once. Daily-proration slices are
// not cent-quantized (slicers/amortized accumulateDaily adds fee*days/spanDays
// straight), and rounding a running total per add makes the final cent depend
// on the order contracts arrive in — i.e. on DB fetch order, which the engine's
// determinism invariant forbids. Rounding once at the end drops that
// half-cent-per-add wobble; what is left is float non-associativity, which
// moves the sum by ulps rather than by a rounding step.
export interface LineItemAccumulator {
  /**
   * `native`/`currency` ride along when the caller can state them — the same
   * amount before conversion, and the ISO code it is denominated in. A bucket
   * emits them only if EVERY add supplied them and they all named one
   * currency; a single add without them, or a second currency, and the bucket
   * is a genuine cross-currency aggregate with no native denomination.
   */
  add: (
    period: string,
    groupKey: string,
    value: number,
    native?: number,
    currency?: string,
  ) => void;
  items: () => SpendLineItem[];
}

interface Bucket {
  period: string;
  groupKey: string;
  value: number;
  native: number;
  // null = poisoned (an add carried no denomination, or a second one showed
  // up); undefined = no adds yet.
  currency: string | null | undefined;
}

export function createLineItemAccumulator(): LineItemAccumulator {
  const buckets = new Map<string, Bucket>();
  return {
    add(period, groupKey, value, native, currency) {
      const key = `${period} ${groupKey}`;
      const existing = buckets.get(key);
      const incoming = currency && native !== undefined ? currency : null;
      buckets.set(key, {
        period,
        groupKey,
        value: (existing?.value ?? 0) + value,
        native: (existing?.native ?? 0) + (native ?? 0),
        currency:
          existing === undefined
            ? incoming
            : existing.currency === incoming
              ? existing.currency
              : null,
      });
    },
    items() {
      return [...buckets.values()]
        .map(({ period, groupKey, value, native, currency }) => ({
          period,
          groupKey,
          value: toCents(value),
          ...(currency
            ? { nativeValue: toCents(native), nativeCurrency: currency }
            : {}),
        }))
        .sort(
          (a, b) =>
            a.period.localeCompare(b.period) ||
            a.groupKey.localeCompare(b.groupKey),
        );
    },
  };
}

/**
 * Re-accumulates line items from several engine runs over ONE query — the
 * contract population and the Bloomberg SID population are resolved
 * separately (different resolvers, different id spaces) and meet here. Buckets
 * merge by kind, period and group key with the accumulator's own rules, so
 * additivity and the native-denomination coherence test survive the merge
 * exactly as they would had every input reached one pipeline.
 */
export function mergeLineItems<K extends string>(
  lists: ReadonlyArray<ReadonlyArray<SpendLineItem & { kind?: K }>>,
): Array<SpendLineItem & { kind?: K }> {
  const byKind = new Map<K | undefined, LineItemAccumulator>();
  for (const list of lists) {
    for (const item of list) {
      let accumulator = byKind.get(item.kind);
      if (!accumulator) {
        accumulator = createLineItemAccumulator();
        byKind.set(item.kind, accumulator);
      }
      accumulator.add(
        item.period,
        item.groupKey,
        item.value,
        item.nativeValue,
        item.nativeCurrency,
      );
    }
  }
  return [...byKind.entries()].flatMap(([kind, accumulator]) =>
    accumulator
      .items()
      .map((item) => (kind === undefined ? item : { ...item, kind })),
  );
}
