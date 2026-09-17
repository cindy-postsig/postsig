import { isActiveEmployee } from '@/lib/v2/org-units/tree';
import { employeeIdsInScope } from './scope';
import type {
  AssignmentSeat,
  AssignmentsPayload,
  ScopeKey,
  ScopeMetrics,
} from './types';
import { FIRMWIDE } from './types';

// The seven KPI cards. Everything except cost is counted off the same seat and
// roster lists the tables render, so a parent's figure is its children's by
// construction rather than by a second derivation that could drift.

const round = (value: number): number => Math.round(value * 100) / 100;

/** Seats held by anyone in the scope; at Firmwide, unlinked seats as well. */
export function seatsInScope(
  payload: AssignmentsPayload,
  scope: ScopeKey,
): AssignmentSeat[] {
  const memberIds = new Set(
    employeeIdsInScope(
      payload.nodes,
      scope,
      Object.keys(payload.users).map(Number),
    ),
  );
  const seats: AssignmentSeat[] = [];
  for (const seat of Object.values(payload.seats)) {
    if (seat.orgEmployeeId === null) {
      // Nothing places an unlinked seat in the tree, so it can only be counted
      // once, at the top; a node total that included it would break the rollup.
      if (scope === FIRMWIDE) seats.push(seat);
      continue;
    }
    if (memberIds.has(seat.orgEmployeeId)) seats.push(seat);
  }
  return seats;
}

export function computeScopeMetrics(
  payload: AssignmentsPayload,
  scope: ScopeKey,
): ScopeMetrics {
  const allEmployeeIds = Object.keys(payload.users).map(Number);
  const memberIds = employeeIdsInScope(payload.nodes, scope, allEmployeeIds);
  const members = memberIds
    .map((id) => payload.users[id])
    .filter((user) => user !== undefined);

  // Headcount is live staff: a departed holder still shows up under Underused,
  // which is the point of that card, but they are not people in the scope.
  const active = members.filter((user) =>
    isActiveEmployee({ status: user.status, deleted_at: null }),
  );
  const assignedUsers = active.filter((user) => user.seatIds.length > 0).length;

  const seats = seatsInScope(payload, scope);
  const vendorIds = new Set<number>();
  let underusedLicences = 0;
  let unlinkedSeats = 0;
  for (const seat of seats) {
    if (seat.vendorId !== null) vendorIds.add(seat.vendorId);
    if (seat.underused) underusedLicences += 1;
    if (seat.orgEmployeeId === null) unlinkedSeats += 1;
  }

  // Summed off the same member list every other figure is counted from, so a
  // parent equals its children by construction.
  const monthlyCost = members.reduce((sum, user) => sum + user.monthlyCost, 0);

  return {
    peopleInScope: active.length,
    assignedUsers,
    unassigned: active.length - assignedUsers,
    assignments: seats.length,
    monthlyCost: round(monthlyCost),
    underusedLicences,
    vendorsInScope: vendorIds.size,
    unlinkedSeats,
  };
}
