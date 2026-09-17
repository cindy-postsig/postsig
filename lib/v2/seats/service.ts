import {
  loadSidSpendPopulation,
  type SidSpendPopulation,
} from '@/lib/v2/bloomberg-sid/population';
import type { AllocationEmployee } from '@/lib/v2/cost-allocation/types';
import { readContractSeats } from './queries';
import { contractSeatFrom, sidSeatFrom } from './transforms';
import type { Seat, SeatHolder, SeatVendor } from './types';

/** The roster and vendor identities the contract half of the population needs. */
export interface ContractSeatInputs {
  holdersById: ReadonlyMap<number, SeatHolder>;
  /**
   * The surviving vendor per contract, from the caller's enriched contract
   * set. A seat whose contract is absent belongs to no register the caller
   * prices from, and is dropped rather than guessed at.
   */
  vendorByContractId: ReadonlyMap<number, SeatVendor>;
}

export interface SeatPopulationOptions {
  /**
   * Match Bloomberg `last_user` names against the HR roster. Costs the roster
   * reads, so only a surface that attributes seats to people asks for it.
   */
  matchEmployees: boolean;
  /**
   * Omit to load the Bloomberg half alone: a caller that only runs the engine
   * (the allocation rollup) needs no contract seats, and reading them would
   * be a query it never looks at. A promise is accepted so a caller still
   * assembling the maps does not hold the seat reads back.
   */
  contractSeats?: ContractSeatInputs | PromiseLike<ContractSeatInputs>;
}

/**
 * Every seat the org pays for, from both sources, plus the engine inputs its
 * Bloomberg half contributes. `seats` is the display population; `engine` is
 * what `runSpendQuery` takes as `scope.bloombergSid`. The two agree by
 * construction: a seat's ids ARE the engine's, so `seatBucketKeys(seat)`
 * indexes a groupBy 'product' result directly.
 */
export interface SeatPopulation {
  seats: Seat[];
  engine: SidSpendPopulation;
}

export async function loadSeatPopulation(
  organizationId: string,
  window: { start: Date; end: Date },
  options: SeatPopulationOptions,
): Promise<SeatPopulation> {
  const { contractSeats } = options;
  const [engine, contractRows, inputs] = await Promise.all([
    loadSidSpendPopulation(organizationId, {
      window,
      matchEmployees: options.matchEmployees,
    }),
    contractSeats ? readContractSeats(organizationId) : null,
    contractSeats ?? null,
  ]);

  const seats: Seat[] = [];
  if (inputs && contractRows) {
    const { holdersById, vendorByContractId } = inputs;
    for (const row of contractRows) {
      const vendor = vendorByContractId.get(row.contract_id);
      if (!vendor) continue;
      const holder =
        row.org_employee_id === null
          ? undefined
          : holdersById.get(row.org_employee_id);
      seats.push(contractSeatFrom(row, holder, vendor));
    }
  }
  for (const record of engine.seats) {
    seats.push(sidSeatFrom(record.seat, record.holder, record.vendorName));
  }

  return { seats, engine };
}

/**
 * The one employee map a report's target lookups read: the caller's own,
 * plus the ones Bloomberg seats matched. A seat holder can be someone no
 * allocation line ever mentioned, so the caller's map alone would leave the
 * seat's money under a target it cannot name.
 */
export function withSeatEmployees(
  employeesById: ReadonlyMap<number, AllocationEmployee>,
  population: SeatPopulation,
): ReadonlyMap<number, AllocationEmployee> {
  return new Map([...employeesById, ...population.engine.employeesById]);
}
