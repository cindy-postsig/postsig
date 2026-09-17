import type {
  ResolvedContractAllocation,
  ResolvedScope,
} from '@/lib/v2/cost-allocation/types';
import type { SpendLineItem } from '@/lib/v2/spend';
import { seatBucketKeys, seatEntitlementsKey } from '@/lib/v2/seats/transforms';
import type { Seat } from '@/lib/v2/seats/types';

/** The scope covering a seat: its own product's, else the whole-contract one. */
export function scopeForSeat(
  allocation: ResolvedContractAllocation | undefined,
  productId: number | null,
): ResolvedScope | undefined {
  if (!allocation) return undefined;
  return (
    allocation.scopes.find((scope) => scope.productId === productId) ??
    allocation.scopes.find((scope) => scope.productId === null)
  );
}

function percentForEmployee(
  scope: ResolvedScope | undefined,
  orgEmployeeId: number,
): number {
  if (!scope) return 0;
  for (const line of scope.lines) {
    if (line.target.kind === 'employee' && line.target.id === orgEmployeeId) {
      return line.percent;
    }
  }
  return 0;
}

/**
 * One month of engine buckets from a groupBy 'product' query. `byKey` holds
 * the engine's own `contractId:productId` keys — the ones `seatBucketKeys`
 * names — and `byContract` their sum per contract, which is what a
 * whole-contract scope funds: the engine has no product-less product key.
 */
export interface MonthBuckets {
  byKey: ReadonlyMap<string, number>;
  byContract: ReadonlyMap<number, number>;
}

export function monthBuckets(items: readonly SpendLineItem[]): MonthBuckets {
  const byKey = new Map<string, number>();
  const byContract = new Map<number, number>();
  for (const item of items) {
    const contractId = Number(item.groupKey.split(':')[0]);
    if (!Number.isFinite(contractId)) continue;
    byKey.set(item.groupKey, (byKey.get(item.groupKey) ?? 0) + item.value);
    byContract.set(contractId, (byContract.get(contractId) ?? 0) + item.value);
  }
  return { byKey, byContract };
}

/**
 * The contract a scope is priced from: its own, unless the month holds
 * nothing for it at all — an inherited allocation on a record with no value
 * of its own is priced from the record it inherits from, as the Cost
 * Allocation tab prices it. A contract with its own allocation is its own
 * source, so the fallback cannot fire for it.
 */
function pricedContractId(
  scope: ResolvedScope,
  contractId: number,
  buckets: MonthBuckets,
): number {
  return buckets.byContract.has(contractId)
    ? contractId
    : scope.sourceContractId;
}

/** A scope's month: its product's bucket, else every product bucket on the contract. */
function valueForScope(
  scope: ResolvedScope,
  contractId: number,
  buckets: MonthBuckets,
): number {
  if (scope.productId === null) return buckets.byContract.get(contractId) ?? 0;
  return buckets.byKey.get(`${contractId}:${scope.productId}`) ?? 0;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

export function seatMonthlyCost(
  scope: ResolvedScope | undefined,
  contractId: number,
  buckets: MonthBuckets,
  orgEmployeeId: number,
): number {
  if (!scope) return 0;
  const percent = percentForEmployee(scope, orgEmployeeId);
  if (percent === 0) return 0;
  const priced = pricedContractId(scope, contractId, buckets);
  return cents((percent / 100) * valueForScope(scope, priced, buckets));
}

/**
 * The month a seat's own buckets hold. A Bloomberg terminal is one person's
 * whole seat — 100% of its price and of its exchange entitlements — so it is
 * priced from its two buckets rather than apportioned out of a scope.
 */
export function seatBucketTotal(seat: Seat, buckets: MonthBuckets): number {
  return cents(
    seatBucketKeys(seat).reduce(
      (total, key) => total + (buckets.byKey.get(key) ?? 0),
      0,
    ),
  );
}

/** The entitlements share of `seatBucketTotal`; zero for any other seat. */
export function seatEntitlementsCost(
  seat: Seat,
  buckets: MonthBuckets,
): number {
  const key = seatEntitlementsKey(seat);
  return key === null ? 0 : cents(buckets.byKey.get(key) ?? 0);
}

/**
 * The engine's one entitlements figure split over the seat's exchanges in
 * proportion to the report's own charges, in cents that sum back exactly:
 * the last exchange takes the rounding remainder. Exchanges the report never
 * priced share nothing; a seat with only those puts the whole figure on the
 * first one rather than losing it.
 */
export function splitEntitlementsCost(
  exchanges: readonly { monthlyCost: number }[],
  total: number,
): number[] {
  if (exchanges.length === 0) return [];
  const reported = exchanges.reduce((sum, e) => sum + e.monthlyCost, 0);
  if (reported === 0) {
    return exchanges.map((_, index) => (index === 0 ? total : 0));
  }
  const shares = exchanges.map((e) =>
    cents((total * e.monthlyCost) / reported),
  );
  const placed = shares.slice(0, -1).reduce((sum, share) => sum + share, 0);
  shares[shares.length - 1] = cents(total - placed);
  return shares;
}
