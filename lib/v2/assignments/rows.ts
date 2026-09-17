import { ORG_UNIT_TREE_LEVELS } from '@/lib/v2/org-units/levels';
import type { OrgUnitLevel, OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';
import type { SeatInactiveReason } from '@/lib/v2/seats/status';
import { seatsInScope } from './metrics';
import { employeeIdsInScope, unitPathOf, unitPaths } from './scope';
import type {
  AssignmentSeat,
  AssignmentUser,
  AssignmentsPayload,
  ProductContractDetail,
  ScopeKey,
} from './types';
import { productDetailKey } from './types';

// Rows for the two sub-tabs. Pure over the payload, so the client re-derives
// them on every scope or filter change without another round trip.

const round = (value: number): number => Math.round(value * 100) / 100;

export interface ProductRow {
  key: string;
  productId: number | null;
  productName: string;
  vendorId: number | null;
  vendorName: string;
  deliveryMethods: string[];
  contractIds: number[];
  userCount: number;
  inactiveCount: number;
  monthlyCost: number;
  /** Sum over the inactive seats only — the panel's Inactive tab headline. */
  inactiveMonthlyCost: number;
  /**
   * The exchange-entitlement share of `monthlyCost` and the seats carrying
   * one: a Bloomberg product's row folds its terminals' pass-through charges
   * in, and the table's expander shows the split.
   */
  entitlementsMonthlyCost: number;
  entitledSeatCount: number;
  seatIds: number[];
  /**
   * The contract's own terms, when the seats in scope all sit on one contract.
   * Null when they span several: a start date or an order number would then be
   * one of many, which is worse than saying nothing.
   */
  detail: ProductContractDetail | null;
}

export interface VendorGroup {
  vendorId: number | null;
  vendorName: string;
  products: ProductRow[];
  monthlyCost: number;
  userCount: number;
  inactiveCount: number;
}

/** A product is identified by its vendor_products.id; a seat without one groups under its contract. */
const productKey = (seat: AssignmentSeat): string =>
  seat.productId === null
    ? `contract:${seat.contractId}`
    : `product:${seat.productId}`;

export function buildProductRows(
  payload: AssignmentsPayload,
  scope: ScopeKey,
): VendorGroup[] {
  const byProduct = new Map<string, ProductRow>();
  for (const seat of seatsInScope(payload, scope)) {
    const key = productKey(seat);
    let row = byProduct.get(key);
    if (!row) {
      row = {
        key,
        productId: seat.productId,
        productName: seat.productName,
        vendorId: seat.vendorId,
        vendorName: seat.vendorName,
        deliveryMethods: [],
        contractIds: [],
        userCount: 0,
        inactiveCount: 0,
        monthlyCost: 0,
        inactiveMonthlyCost: 0,
        entitlementsMonthlyCost: 0,
        entitledSeatCount: 0,
        seatIds: [],
        detail: null,
      };
      byProduct.set(key, row);
    }
    row.seatIds.push(seat.id);
    row.userCount += 1;
    if (seat.underused) {
      row.inactiveCount += 1;
      row.inactiveMonthlyCost += seat.monthlyCost;
    }
    row.monthlyCost += seat.monthlyCost;
    if (seat.entitlements) {
      row.entitledSeatCount += 1;
      row.entitlementsMonthlyCost += seat.entitlements.monthlyCost;
    }
    if (!row.contractIds.includes(seat.contractId)) {
      row.contractIds.push(seat.contractId);
    }
    for (const method of seat.deliveryMethods) {
      if (!row.deliveryMethods.includes(method))
        row.deliveryMethods.push(method);
    }
  }

  const rawMonthlyCost = new Map<string, number>();
  const byVendor = new Map<string, VendorGroup>();
  for (const row of byProduct.values()) {
    rawMonthlyCost.set(row.key, row.monthlyCost);
    row.monthlyCost = round(row.monthlyCost);
    row.inactiveMonthlyCost = round(row.inactiveMonthlyCost);
    row.entitlementsMonthlyCost = round(row.entitlementsMonthlyCost);
    row.detail =
      row.contractIds.length === 1
        ? (payload.productDetails[
            productDetailKey(row.contractIds[0], row.productId)
          ] ?? null)
        : null;
    const key = String(row.vendorId ?? row.vendorName);
    let group = byVendor.get(key);
    if (!group) {
      group = {
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        products: [],
        monthlyCost: 0,
        userCount: 0,
        inactiveCount: 0,
      };
      byVendor.set(key, group);
    }
    group.products.push(row);
    group.monthlyCost += rawMonthlyCost.get(row.key) ?? 0;
    group.userCount += row.userCount;
    group.inactiveCount += row.inactiveCount;
  }

  const groups = [...byVendor.values()];
  for (const group of groups) {
    group.monthlyCost = round(group.monthlyCost);
    group.products.sort((a, b) => a.productName.localeCompare(b.productName));
  }
  return groups.sort(
    (a, b) =>
      b.monthlyCost - a.monthlyCost || a.vendorName.localeCompare(b.vendorName),
  );
}

export interface UserProductChip {
  name: string;
  count: number;
  underused: boolean;
}

export interface UserRow {
  id: number;
  name: string;
  email: string | null;
  employeeId: string | null;
  path: string[];
  /** Ragged-safe: a column reads its level by name, never by position. */
  pathByLevel: Partial<Record<OrgUnitLevel, string>>;
  status: string;
  assignmentCount: number;
  monthlyCost: number;
  vendorNames: string[];
  productNames: string[];
  products: UserProductChip[];
}

function chipsForSeats(seats: readonly AssignmentSeat[]): UserProductChip[] {
  const byName = new Map<string, UserProductChip>();
  for (const seat of seats) {
    const chip = byName.get(seat.productName);
    if (chip) {
      chip.count += 1;
      chip.underused = chip.underused || seat.underused;
      continue;
    }
    byName.set(seat.productName, {
      name: seat.productName,
      count: 1,
      underused: seat.underused,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildUserRows(
  payload: AssignmentsPayload,
  scope: ScopeKey,
): UserRow[] {
  const allEmployeeIds = Object.keys(payload.users).map(Number);
  const paths = unitPaths(payload.nodes);
  const rows: UserRow[] = [];
  for (const id of employeeIdsInScope(payload.nodes, scope, allEmployeeIds)) {
    const user = payload.users[id];
    if (!user) continue;
    const seats = user.seatIds
      .map((seatId) => payload.seats[seatId])
      .filter((seat): seat is AssignmentSeat => seat !== undefined);
    const { path, pathByLevel } = unitPathOf(paths, user.orgUnitId);
    rows.push({
      id: user.id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      path,
      pathByLevel,
      status: user.status,
      assignmentCount: seats.length,
      monthlyCost: round(user.monthlyCost),
      vendorNames: [...new Set(seats.map((seat) => seat.vendorName))],
      productNames: [...new Set(seats.map((seat) => seat.productName))],
      products: chipsForSeats(seats),
    });
  }
  if (rows.every((row) => row.assignmentCount === 0)) return [];
  // Busiest first, with name breaking the long run of equal counts so the
  // table's unsorted order is stable across renders.
  return rows.sort(
    (a, b) =>
      b.assignmentCount - a.assignmentCount || a.name.localeCompare(b.name),
  );
}

export const ALL_TREE_LEVELS: readonly OrgUnitTreeLevel[] =
  ORG_UNIT_TREE_LEVELS;

export interface UnderusedRow {
  seatId: number;
  /** null for an unlinked seat: there is no profile to open. */
  employeeId: number | null;
  userName: string;
  email: string | null;
  department: string | null;
  vendorName: string;
  productName: string;
  inactiveReasons: SeatInactiveReason[];
  lastUsed: string | null;
  monthlyCost: number;
}

/**
 * The reclaim list: every underused seat in scope, dearest first, because the
 * tab's headline is how much a month is at risk.
 */
export function buildUnderusedRows(
  payload: AssignmentsPayload,
  scope: ScopeKey,
): UnderusedRow[] {
  const paths = unitPaths(payload.nodes);
  const rows: UnderusedRow[] = [];
  for (const seat of seatsInScope(payload, scope)) {
    if (!seat.underused) continue;
    const user =
      seat.orgEmployeeId === null
        ? undefined
        : payload.users[seat.orgEmployeeId];
    rows.push({
      seatId: seat.id,
      employeeId: user?.id ?? null,
      userName: user?.name ?? seat.holderName,
      email: user?.email ?? null,
      department:
        unitPathOf(paths, user?.orgUnitId ?? null).pathByLevel.department ??
        null,
      vendorName: seat.vendorName,
      productName: seat.productName,
      inactiveReasons: seat.inactiveReasons,
      // TODO: vendor usage feed supplies this; no column yet.
      lastUsed: null,
      monthlyCost: seat.monthlyCost,
    });
  }
  return rows.sort(
    (a, b) =>
      b.monthlyCost - a.monthlyCost || a.userName.localeCompare(b.userName),
  );
}

export function underusedMonthlyAtRisk(rows: readonly UnderusedRow[]): number {
  return round(rows.reduce((sum, row) => sum + row.monthlyCost, 0));
}
