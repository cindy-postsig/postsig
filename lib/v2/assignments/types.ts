import type { OrgUnitLevel } from '@/lib/v2/org-units/levels';
import type { SeatInactiveReason } from '@/lib/v2/seats/status';

// Shapes behind the Assignments tab. Kept free of data-layer imports so the
// page's client component can bundle them; the loader lives in service.ts.

/** The whole org, or one org_units.id. */
export type ScopeKey = 'firmwide' | number;

export const FIRMWIDE = 'firmwide' as const;

/** One live seat: a person (or an unlinked name) holding one product on one contract. */
export interface AssignmentSeat {
  /**
   * `contract_users.id` for a contract seat, and a Bloomberg terminal's own
   * (negative) engine product id — disjoint by sign, so one `seats` record
   * and one `seatIds` list hold both sources.
   */
  id: number;
  contractId: number;
  /**
   * What the page groups the seat under: the catalog product for a contract
   * seat, and a Bloomberg product code (the gptt) for a terminal — so one
   * Bloomberg product is one row however many terminals hold it.
   */
  productId: number | null;
  productName: string;
  vendorId: number | null;
  vendorName: string;
  deliveryMethods: string[];
  /** null for a legacy seat never linked to a roster row; it can hold no allocated cost. */
  orgEmployeeId: number | null;
  holderName: string;
  assignedDate: string | null;
  /** Why the seat is wasted; empty for one in use. */
  inactiveReasons: SeatInactiveReason[];
  /** A paid seat nobody is using — the same answer as having any reason. */
  underused: boolean;
  /** Apportioned from the holder's exact allocated total — see cost.ts. */
  monthlyCost: number;
  /**
   * A Bloomberg terminal's exchange entitlements: the share of `monthlyCost`
   * that is their pass-through charge, and the exchanges behind it. The
   * engine prices the entitlements as one figure; each exchange's line is
   * that figure split by the report's own charges, so the lines sum to it.
   */
  entitlements?: { exchanges: AssignmentExchange[]; monthlyCost: number };
}

export interface AssignmentExchange {
  code: string;
  name: string;
  monthlyCost: number;
}

export interface AssignmentUser {
  /** org_employees.id — the key allocation targets and seats both use. */
  id: number;
  name: string;
  email: string | null;
  employeeId: string | null;
  orgUnitId: number | null;
  status: string;
  costCenter: string | null;
  region: string | null;
  country: string | null;
  seatIds: number[];
  monthlyCost: number;
}

export interface AssignmentNode {
  id: number;
  name: string;
  level: OrgUnitLevel;
  levelLabel: string;
  parentId: number | null;
  /** Parent path, nearest first; only when another node at this level shares the name. */
  breadcrumb?: string;
  childIds: number[];
  /** Employees whose leaf is this node — the tree's bottom level, below childIds. */
  memberIds: number[];
  /** Active employees in this node's whole subtree: the count the tree rail shows. */
  headcount: number;
}

/** Contract-side facts about one product, for the product panel's Details tab. */
export interface ProductContractDetail {
  contractId: number;
  /** The document's order number, when one was extracted. */
  orderNumber: string | null;
  /** The contract type's name, e.g. `Trial Agreement`, when recorded. */
  contractType: string | null;
  /** Earliest recorded term start on the contract. */
  startDate: string | null;
  /** Latest recorded term end. */
  endDate: string | null;
  /** Percent, e.g. 2 for a 2% uplift. */
  annualIncrease: number | null;
  /** The recorded per-licence annual rate, in the contract's own terms. */
  ratePerLicence: number | null;
  /** Licences the contract pays for, which is not the same as seats held. */
  licences: number | null;
}

/** Keyed the way the product rows group: one entry per contract × product. */
export function productDetailKey(
  contractId: number,
  productId: number | null,
): string {
  return `${contractId}:${productId ?? 'contract'}`;
}

/** The seven cards, for one scope. */
export interface ScopeMetrics {
  peopleInScope: number;
  assignedUsers: number;
  unassigned: number;
  assignments: number;
  /**
   * What the people in scope cost: the sum of their allocated totals, per
   * month. Deliberately NOT the scope's whole allocated spend — money
   * allocated to an org unit, to a cost centre, or sitting in a contract with
   * no allocation at all funds nobody's seat and has no place on this page.
   * It follows that this does not tie to the Cost Allocation Summary's total.
   */
  monthlyCost: number;
  underusedLicences: number;
  vendorsInScope: number;
  /** Seats with no roster link; placeable nowhere in the tree, so counted at Firmwide only. */
  unlinkedSeats: number;
}

/** The calendar month every figure on the page is priced for. */
export interface AssignmentsWindow {
  /** `YYYY-MM` — what the `month` search param carries. */
  month: string;
  /** The month spelled out, e.g. `April 2026`. */
  label: string;
}

export interface AssignmentsPayload {
  /** The month the engine priced every seat for. */
  window: AssignmentsWindow;
  /** Every tree node, indexed by id. */
  nodes: Record<number, AssignmentNode>;
  /** Top-level node ids — the children of Firmwide. */
  rootIds: number[];
  users: Record<number, AssignmentUser>;
  seats: Record<number, AssignmentSeat>;
  /** Keyed `contractId:productId`; `productId` is `contract` for a seat with none. */
  productDetails: Record<string, ProductContractDetail>;
  /** True when the org has no employees at all — the page's empty state. */
  empty: boolean;
}
