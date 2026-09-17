import type { Seat } from '@/lib/v2/seats/types';
import type { AssignmentSeat } from './types';

/**
 * A seat in the shape the page renders, whichever source supplied it. Costs
 * land later — the loader needs every seat of a holder before it can
 * apportion any of them — so they start at zero.
 */
export function assignmentSeatFrom(seat: Seat): AssignmentSeat {
  return {
    id: seat.id,
    contractId: seat.contractId,
    productId: seat.catalogProductId,
    productName: seat.productName,
    vendorId: seat.vendorId,
    vendorName: seat.vendorName,
    deliveryMethods: seat.deliveryMethods,
    orgEmployeeId: seat.holder.orgEmployeeId,
    holderName: seat.holder.displayName,
    assignedDate: seat.startDate,
    inactiveReasons: seat.inactiveReasons,
    underused: seat.underused,
    monthlyCost: 0,
    ...(seat.entitlements
      ? {
          entitlements: {
            exchanges: seat.entitlements.exchanges.map((exchange) => ({
              ...exchange,
              monthlyCost: 0,
            })),
            monthlyCost: 0,
          },
        }
      : {}),
  };
}
