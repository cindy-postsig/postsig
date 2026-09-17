import {
  sidContractId,
  sidSeatExchangeProductId,
  sidSeatProductId,
  type SidSeat,
} from '@/lib/v2/bloomberg-sid/spend';
import { seatInactiveReasons } from './status';
import type { ContractSeatRow } from './queries';
import type { Seat, SeatHolder, SeatVendor } from './types';

// What counts as a seat, and what counts as a wasted one.

/**
 * A live seat nobody is getting value from, by the roster alone. The rule
 * itself lives in `lib/v2/seats/status.ts`; its vendor-feed clause
 * ("dormant") is applied where the seat's own flag is known — `sidSeatFrom`
 * and the inventory items — so a caller holding nothing but a roster row gets
 * the half it can actually answer.
 */
export function isUnderusedSeat(holder: SeatHolder | undefined): boolean {
  return seatInactiveReasons(holder, false).length > 0;
}

/**
 * Vendor arrives as an argument rather than off the row: the seat query cannot
 * see a corporate action, so the caller supplies the surviving vendor from the
 * enriched contract set.
 */
export function contractSeatFrom(
  row: ContractSeatRow,
  holder: SeatHolder | undefined,
  vendor: SeatVendor,
): Seat {
  const inactiveReasons = seatInactiveReasons(holder, false);
  return {
    id: row.id,
    source: 'contract_user',
    contractId: row.contract_id,
    productId: row.product_id,
    catalogProductId: row.product_id,
    vendorId: vendor.id,
    vendorName: vendor.name,
    productName: row.product_name ?? 'Unnamed product',
    deliveryMethods: row.delivery_methods,
    holder: {
      orgEmployeeId: row.org_employee_id,
      displayName: holder?.name ?? row.name,
    },
    // start_date is the HR assignment date; created_at is when the seat row
    // was written, which is the best available stand-in for an older import.
    startDate: row.start_date ?? row.created_at.slice(0, 10),
    endDate: null,
    inactiveReasons,
    underused: inactiveReasons.length > 0,
  };
}

/**
 * A Bloomberg terminal as a seat. The holder is the roster match on
 * `last_user`, so an unmatched seat keeps the imported name and counts as
 * underused: nobody the roster knows is accountable for it. This is also the
 * only source that knows its own usage — the report's 90-day flag — so the
 * dormant clause of the rule is applied here. Its exchange entitlements ride
 * on the seat: the engine prices them as a second product per terminal, so
 * the seat names that product and its cost joins the terminal's.
 */
export function sidSeatFrom(
  seat: SidSeat,
  holder: SeatHolder | undefined,
  vendorName: string,
): Seat {
  const productId = sidSeatProductId(seat);
  const inactiveReasons = seatInactiveReasons(holder, seat.ninetyDay);
  const entitled =
    seat.entitlements.length > 0 ||
    seat.exchange.some((entry) => entry.monthlyExchangeCost > 0);
  return {
    id: productId,
    source: 'bloomberg_sid',
    contractId: sidContractId(seat.custNum),
    productId,
    catalogProductId: seat.gptt,
    vendorId: seat.vendorId,
    vendorName,
    productName: seat.gpttDescription,
    deliveryMethods: ['Terminal'],
    holder: {
      orgEmployeeId: holder?.id ?? null,
      displayName: holder?.name ?? seat.lastUser,
    },
    startDate: seat.contractDate,
    endDate: seat.terms[seat.terms.length - 1]?.renewalDate ?? null,
    inactiveReasons,
    underused: inactiveReasons.length > 0,
    ...(entitled
      ? {
          entitlements: {
            exchanges: seat.entitlements.map((e) => ({
              code: e.exchangeCode,
              name: e.exchangeName,
              monthlyCost: e.monthlyCost,
            })),
            productId: sidSeatExchangeProductId(seat),
          },
        }
      : {}),
  };
}

/**
 * The engine buckets a seat's cost comes from under groupBy 'product': its
 * own product's, plus the entitlements product's for a terminal that has
 * one. A contract seat recorded against no product is priced from its whole
 * contract, and the engine has no product-less product key, so it names the
 * groupBy 'contract' key instead.
 */
export function seatBucketKeys(seat: Seat): string[] {
  if (seat.productId === null) return [String(seat.contractId)];
  const entitlements = seatEntitlementsKey(seat);
  return [
    `${seat.contractId}:${seat.productId}`,
    ...(entitlements === null ? [] : [entitlements]),
  ];
}

/** The entitlements bucket alone, for the surfaces that show the split. */
export function seatEntitlementsKey(seat: Seat): string | null {
  return seat.entitlements
    ? `${seat.contractId}:${seat.entitlements.productId}`
    : null;
}
