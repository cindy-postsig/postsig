import { isActiveEmployee } from '@/lib/v2/org-units/tree';

// Why a seat counts as underutilized, in one place for every surface that
// shows it: the Assignments page, the Bloomberg inventory view and the
// assistant's tools. A seat can carry several reasons at once.

export type SeatInactiveReason =
  | 'leaver'
  | 'on_leave'
  | 'not_in_hr'
  | 'dormant';

export const SEAT_INACTIVE_REASON_LABEL: Record<SeatInactiveReason, string> = {
  leaver: 'Leaver',
  on_leave: 'On leave',
  not_in_hr: 'Employee not found',
  dormant: 'No use in 90 days',
};

export const ACTIVE_SEAT_STATUS_LABEL = 'Active';

/** The roster facts the rule reads; a seat linked to nobody has none. */
export interface SeatHolderStatus {
  status: string;
  deleted_at: string | null;
}

/**
 * Nothing releases a seat when someone leaves, so a departed or absent
 * holder is a licence paid for but not used; a seat the roster cannot place
 * has nobody accountable for it; and a vendor feed can flag a seat nobody
 * has touched (Bloomberg's 90-day flag) even when its holder is active.
 */
export function seatInactiveReasons(
  holder: SeatHolderStatus | undefined,
  dormant: boolean,
): SeatInactiveReason[] {
  const reasons: SeatInactiveReason[] = [];
  if (!holder) {
    reasons.push('not_in_hr');
  } else if (!isActiveEmployee(holder)) {
    reasons.push(
      holder.deleted_at === null && holder.status === 'on_leave'
        ? 'on_leave'
        : 'leaver',
    );
  }
  if (dormant) reasons.push('dormant');
  return reasons;
}

export const seatInactiveReasonLabels = (
  reasons: readonly SeatInactiveReason[],
): string[] => reasons.map((reason) => SEAT_INACTIVE_REASON_LABEL[reason]);

/** `Active`, or `Inactive (Leaver, No use in 90 days)`. */
export function seatStatusLabel(
  reasons: readonly SeatInactiveReason[],
): string {
  if (reasons.length === 0) return ACTIVE_SEAT_STATUS_LABEL;
  return `Inactive (${seatInactiveReasonLabels(reasons).join(', ')})`;
}
