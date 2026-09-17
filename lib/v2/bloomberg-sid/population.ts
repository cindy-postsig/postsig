import {
  buildAllocationContext,
  readUnits,
} from '@/lib/v2/cost-allocation/context';
import type {
  AllocationEmployee,
  ResolvedContractAllocation,
} from '@/lib/v2/cost-allocation/types';
import type { SeatHolder } from '@/lib/v2/seats/types';
import type { SegmentResolver, SpendContractInput } from '@/lib/v2/spend';
import { formatUTCDate } from '@/lib/v2/spend';
import { createClient } from '@/utils/supabase/service_server';
import {
  fetchFirmwideAccounts,
  fetchHrEmployees,
  fetchSidSeatSources,
} from './queries';
import {
  buildSidSeats,
  sidAllocations,
  sidSeatGoneBefore,
  sidSegmentResolver,
  sidSpendContracts,
  sidSpendRefs,
  type SidSeat,
  type SidSpendRef,
} from './spend';
import { buildUnitPaths, matchHr } from './transforms';

/** A seat with the vendor it bills to and the employee its `last_user` matched. */
export interface SidSeatRecord {
  seat: SidSeat;
  vendorName: string;
  /** Present only when `matchEmployees` was requested and the roster matched. */
  employee?: AllocationEmployee;
  /**
   * The same match as the roster facts the seat's status is read from — the
   * allocation dimension reads `employee`, every seat surface reads this.
   * Present on the same terms.
   */
  holder?: SeatHolder;
}

/**
 * The org's Bloomberg seats as a second engine population beside its
 * contracts: inputs, the resolver that places them, and — when asked for —
 * the per-seat employee attribution the allocation dimension splits on.
 */
export interface SidSpendPopulation {
  contracts: SpendContractInput[];
  /**
   * The seats `contracts` and `resolveSegments` were derived from. The engine
   * never reads them; the seat population (lib/v2/seats) does, to present a
   * terminal beside a contract's own users.
   */
  seats: SidSeatRecord[];
  resolveSegments: SegmentResolver;
  /** Present only when `matchEmployees` was requested. */
  allocations?: ReadonlyMap<number, ResolvedContractAllocation>;
  /** The employees seats resolved to; empty unless `matchEmployees`. */
  employeesById: ReadonlyMap<number, AllocationEmployee>;
  /**
   * Vendors with seats in the population. Their invoice records are the
   * bills for these same seats, so a query that includes the seats leaves
   * those invoices out rather than counting the money twice.
   */
  vendorIds: ReadonlySet<number>;
  refs: Record<string, SidSpendRef>;
}

export interface SidSpendPopulationOptions {
  /**
   * The query window the seats are priced for, half-open [start, end). It
   * decides which imported reports are read, so a population is only valid
   * for the window it was loaded with — a wider one is safe, a narrower one
   * loses the terms and exchange charges the query needs.
   */
  window: { start: Date; end: Date };
  vendorId?: number;
  /**
   * Match `last_user` names against the HR roster so seats can be allocated
   * per employee. Costs the roster and org-unit reads, so only the allocation
   * dimension asks for it.
   */
  matchEmployees?: boolean;
}

export const EMPTY_SID_SPEND_POPULATION: SidSpendPopulation = {
  contracts: [],
  seats: [],
  resolveSegments: () => [],
  employeesById: new Map(),
  vendorIds: new Set(),
  refs: {},
};

export async function loadSidSpendPopulation(
  organizationId: string,
  options: SidSpendPopulationOptions,
): Promise<SidSpendPopulation> {
  const accounts = await fetchFirmwideAccounts(organizationId, {
    vendorId: options.vendorId,
  });
  if (accounts.length === 0) return EMPTY_SID_SPEND_POPULATION;

  const window = {
    start: formatUTCDate(options.window.start),
    end: formatUTCDate(options.window.end),
  };
  const sources = await Promise.all(
    accounts.map((account) =>
      fetchSidSeatSources(organizationId, account.firmwideId, window),
    ),
  );
  const records: SidSeatRecord[] = [];
  const refs: Record<string, SidSpendRef> = {};
  accounts.forEach((account, index) => {
    const accountSources = sources[index];
    if (accountSources.length === 0) return;
    const accountSeats = buildSidSeats(account.vendorId, accountSources).filter(
      (seat) => !sidSeatGoneBefore(seat, options.window.start),
    );
    for (const seat of accountSeats) {
      records.push({ seat, vendorName: account.vendor.name });
    }
    Object.assign(
      refs,
      sidSpendRefs(accountSeats, { id: account.vendorId, ...account.vendor }),
    );
  });
  const seats = records.map((record) => record.seat);

  const population: SidSpendPopulation = {
    contracts: sidSpendContracts(seats),
    seats: records,
    resolveSegments: sidSegmentResolver(seats),
    employeesById: new Map(),
    vendorIds: new Set(seats.map((seat) => seat.vendorId)),
    refs,
  };
  if (!options.matchEmployees || seats.length === 0) return population;

  const [roster, units] = await Promise.all([
    fetchHrEmployees(organizationId),
    readUnits(organizationId, createClient()),
  ]);
  const matches = matchHr(
    seats.map((seat) => seat.lastUser),
    roster,
    buildUnitPaths(units),
  );
  // The roster as an allocation context with no allocations: the same
  // cost-center resolution and active rule every other employee target gets.
  const rosterContext = buildAllocationContext({
    allocations: [],
    lines: [],
    units,
    employees: roster.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      status: employee.status,
      deleted_at: null,
      org_unit_id: employee.orgUnitId,
      cost_center: employee.costCenter,
    })),
    seats: [],
    relationships: [],
  });
  const employeeOf = (lastUser: string): AllocationEmployee | undefined => {
    const id = matches[lastUser]?.employee?.id;
    return id === undefined ? undefined : rosterContext.employeesById.get(id);
  };
  const holderOf = (lastUser: string): SeatHolder | undefined => {
    const matched = matches[lastUser]?.employee;
    if (!matched) return undefined;
    // The roster read leaves deleted rows out, so a match is never deleted.
    return {
      id: matched.id,
      name: matched.fullName,
      status: matched.status,
      deleted_at: null,
    };
  };

  const employeesById = new Map<number, AllocationEmployee>();
  for (const seat of seats) {
    const employee = employeeOf(seat.lastUser);
    if (employee) employeesById.set(employee.id, employee);
  }

  return {
    ...population,
    seats: records.map((record) => {
      const employee = employeeOf(record.seat.lastUser);
      const holder = holderOf(record.seat.lastUser);
      return {
        ...record,
        ...(employee ? { employee } : {}),
        ...(holder ? { holder } : {}),
      };
    }),
    allocations: sidAllocations(seats, employeeOf),
    employeesById,
  };
}
