import { cache } from 'react';
import { getUserMetadata } from '@/data/users';
import { fetchHrEmployees } from '@/lib/v2/bloomberg-sid/queries';
import type { SidHrEmployee } from '@/lib/v2/bloomberg-sid/report';
import { matchHr } from '@/lib/v2/bloomberg-sid/transforms';
import { isUnderusedSeat } from './transforms';
import type { SeatHolder, SeatRoster } from './types';

// The roster read leaves deleted rows out, so a row here is never deleted.
const holderOf = (employee: SidHrEmployee): SeatHolder => ({
  id: employee.id,
  name: `${employee.firstName} ${employee.lastName}`.trim(),
  status: employee.status,
  deleted_at: null,
});

/**
 * Both lookups read the one predicate the Assignments page counts underused
 * seats by, so a seat that page calls underused is one Inventory leaves out
 * of Active Users.
 */
export function seatRoster(employees: SidHrEmployee[]): SeatRoster {
  if (employees.length === 0) {
    return {
      isActiveEmployee: () => true,
      matchActiveNames: () => () => true,
    };
  }
  const holdersById = new Map(
    employees.map((employee) => [employee.id, holderOf(employee)]),
  );
  const isActiveEmployee = (orgEmployeeId: number | null): boolean =>
    !isUnderusedSeat(
      orgEmployeeId === null ? undefined : holdersById.get(orgEmployeeId),
    );
  return {
    isActiveEmployee,
    matchActiveNames: (lastUsers) => {
      // Unit paths only decorate a match for the SID view; this reads status.
      const matches = matchHr(lastUsers, employees, new Map());
      return (lastUser) =>
        isActiveEmployee(matches[lastUser]?.employee?.id ?? null);
    },
  };
}

/**
 * Once per request: the vendor page reads the roster for its own SID rows
 * while the inventory list it loads alongside reads it for the contract rows.
 */
export const loadSeatRoster = cache(
  async (organizationId: string): Promise<SeatRoster> =>
    seatRoster(await fetchHrEmployees(organizationId)),
);

/** For a page that batches its reads before it knows the org. */
export async function getSeatRoster(): Promise<SeatRoster> {
  const userMetadata = await getUserMetadata();
  return userMetadata
    ? loadSeatRoster(userMetadata.organizationId)
    : seatRoster([]);
}
