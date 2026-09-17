import type { SeatInactiveReason } from './status';

/** Where a seat came from. */
export type SeatSource = 'contract_user' | 'bloomberg_sid';

/** The roster facts the underused rule and the holder label need. */
export interface SeatHolder {
  id: number;
  name: string;
  status: string;
  deleted_at: string | null;
}

/** Canonical vendor identity, keyed by contract id. */
export interface SeatVendor {
  id: number | null;
  name: string;
}

/**
 * One live seat, whatever supplied it: a person (or an unlinked name) holding
 * one product on one contract.
 *
 * `contractId` and `productId` are the SPEND ENGINE's ids — negative for a
 * Bloomberg terminal, whose account plays the contract and whose seat plays
 * the product — so a seat's spend is the sum of the engine buckets
 * `seatBucketKeys` names, with no translation step in between.
 */
export interface Seat {
  /**
   * Unique across both sources, and disjoint by sign: `contract_users.id` for
   * a contract seat, the terminal's own (negative) engine product id for a
   * Bloomberg one.
   */
  id: number;
  source: SeatSource;
  contractId: number;
  /** null for a contract seat recorded against no particular product. */
  productId: number | null;
  /**
   * The product a surface GROUPS the seat under, which is not always the one
   * the engine prices it by: a Bloomberg product is held as many terminals,
   * each its own engine product, so they group under the product code (the
   * gptt) `sidSpendRefs` already folds them by. The same id as `productId`
   * for a contract seat, and null exactly when that is.
   */
  catalogProductId: number | null;
  vendorId: number | null;
  vendorName: string;
  productName: string;
  deliveryMethods: string[];
  holder: {
    /** null for a seat no roster row answers for; it can hold no allocated cost. */
    orgEmployeeId: number | null;
    displayName: string;
  };
  startDate: string | null;
  /** null where the source records no end — contract seats never do. */
  endDate: string | null;
  /** Why the seat is wasted, in the order `seatInactiveReasons` lists them. */
  inactiveReasons: SeatInactiveReason[];
  /**
   * A paid seat nobody is getting value from — always the same answer as
   * `inactiveReasons.length > 0`, kept for the surfaces that only ask whether.
   */
  underused: boolean;
  /**
   * A Bloomberg terminal's exchange entitlements: the exchanges it is
   * permissioned on, each with the latest report's monthly charge in the
   * account's own currency, priced by the engine as a second product of the
   * same seat (`productId` is that product's engine id). Absent on a contract
   * seat and on a terminal with no entitlements.
   */
  entitlements?: { exchanges: SeatExchange[]; productId: number };
}

export interface SeatExchange {
  code: string;
  name: string;
  monthlyCost: number;
}

/**
 * The HR roster as the one question every seat surface asks of it: is the
 * holder someone active? A contract seat names its holder by employee id, a
 * Bloomberg seat by the name on the report. An org with no roster has nobody
 * to check against, so every seat counts as held.
 */
export interface SeatRoster {
  /** An unlinked seat (null) is nobody's. */
  isActiveEmployee(orgEmployeeId: number | null): boolean;
  /**
   * Resolves a set of `last_user` names in one pass, with the matcher the SID
   * view runs, and answers per name.
   */
  matchActiveNames(lastUsers: Iterable<string>): (lastUser: string) => boolean;
}
