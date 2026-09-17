const mockLoadSidSpendPopulation = jest.fn();
jest.mock('@/lib/v2/bloomberg-sid/population', () => ({
  loadSidSpendPopulation: (...args: unknown[]) =>
    mockLoadSidSpendPopulation(...args),
}));

const mockReadContractSeats = jest.fn();
jest.mock('@/lib/v2/seats/queries', () => ({
  readContractSeats: (...args: unknown[]) => mockReadContractSeats(...args),
}));

import type { SidSpendPopulation } from '@/lib/v2/bloomberg-sid/population';
import {
  sidContractId,
  sidSeatExchangeProductId,
  sidSeatProductId,
  type SidSeat,
} from '@/lib/v2/bloomberg-sid/spend';
import type { AllocationEmployee } from '@/lib/v2/cost-allocation/types';
import { loadSeatPopulation, withSeatEmployees } from '@/lib/v2/seats/service';
import type { ContractSeatRow } from '@/lib/v2/seats/queries';
import type { SeatHolder, SeatVendor } from '@/lib/v2/seats/types';

const ORG = 'org-1';
const WINDOW = {
  start: new Date('2026-01-01T00:00:00.000Z'),
  end: new Date('2027-01-01T00:00:00.000Z'),
};

const seatRow: ContractSeatRow = {
  id: 10,
  contract_id: 100,
  product_id: 200,
  org_employee_id: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  start_date: '2026-01-15',
  created_at: '2025-11-02T09:00:00.000Z',
  product_name: 'Terminal',
  delivery_methods: ['Desktop'],
};

const sidSeat: SidSeat = {
  vendorId: 5,
  custNum: 500,
  accountName: 'Trading Desk',
  currency: 'USD',
  sid: 266891,
  sidInstNum: 5,
  gptt: 7,
  gpttDescription: 'Bloomberg Anywhere',
  lastUser: 'user 492 ffm',
  ninetyDay: false,
  contractDate: '2000-04-07',
  terms: [{ renewalDate: '2028-04-07', monthlyPrice: 2360 }],
  exchange: [{ reportMonth: '2026-04-01', monthlyExchangeCost: 51.1 }],
  entitlements: [],
  lastReportMonth: null,
};

const employee: AllocationEmployee = {
  id: 31,
  name: 'Bo Zhang',
  org_unit_id: 2,
  cost_center_unit_id: null,
  active: true,
};

const seatHolder: SeatHolder = {
  id: 31,
  name: 'Bo Zhang',
  status: 'active',
  deleted_at: null,
};

const population = (
  over: Partial<SidSpendPopulation> = {},
): SidSpendPopulation => ({
  contracts: [],
  seats: [],
  resolveSegments: () => [],
  employeesById: new Map(),
  vendorIds: new Set(),
  refs: {},
  ...over,
});

const holdersById = new Map<number, SeatHolder>([
  [1, { id: 1, name: 'Ada Lovelace', status: 'active', deleted_at: null }],
]);
const vendorByContractId = new Map<number, SeatVendor>([
  [100, { id: 5, name: 'Acme' }],
]);

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadSidSpendPopulation.mockResolvedValue(population());
  mockReadContractSeats.mockResolvedValue([seatRow]);
});

describe('loadSeatPopulation', () => {
  it('prices the Bloomberg half for the window it is given', async () => {
    await loadSeatPopulation(ORG, WINDOW, { matchEmployees: true });

    expect(mockLoadSidSpendPopulation).toHaveBeenCalledWith(ORG, {
      window: WINDOW,
      matchEmployees: true,
    });
  });

  it('reads no contract seats for a caller that only wants the engine half', async () => {
    mockLoadSidSpendPopulation.mockResolvedValue(
      population({ seats: [{ seat: sidSeat, vendorName: 'Bloomberg' }] }),
    );

    const { seats, engine } = await loadSeatPopulation(ORG, WINDOW, {
      matchEmployees: false,
    });

    expect(mockReadContractSeats).not.toHaveBeenCalled();
    expect(seats.map((seat) => seat.id)).toEqual([sidSeatProductId(sidSeat)]);
    expect(seats[0].entitlements).toEqual({
      exchanges: [],
      productId: sidSeatExchangeProductId(sidSeat),
    });
    expect(engine.seats).toHaveLength(1);
  });

  it('carries both sources, each with the ids its engine buckets use', async () => {
    mockLoadSidSpendPopulation.mockResolvedValue(
      population({
        seats: [
          {
            seat: sidSeat,
            vendorName: 'Bloomberg',
            employee,
            holder: seatHolder,
          },
        ],
      }),
    );

    const { seats } = await loadSeatPopulation(ORG, WINDOW, {
      matchEmployees: true,
      contractSeats: { holdersById, vendorByContractId },
    });

    expect(
      seats.map((seat) => [
        seat.source,
        seat.contractId,
        seat.holder.displayName,
      ]),
    ).toEqual([
      ['contract_user', 100, 'Ada Lovelace'],
      ['bloomberg_sid', sidContractId(500), 'Bo Zhang'],
    ]);
    expect(seats.map((seat) => seat.productName)).toEqual([
      'Terminal',
      'Bloomberg Anywhere',
    ]);
  });

  it('reads a Bloomberg seat’s status off the record’s holder, not its allocation employee', async () => {
    mockLoadSidSpendPopulation.mockResolvedValue(
      population({
        seats: [
          {
            seat: sidSeat,
            vendorName: 'Bloomberg',
            employee,
            holder: { ...seatHolder, status: 'on_leave' },
          },
        ],
      }),
    );

    const { seats } = await loadSeatPopulation(ORG, WINDOW, {
      matchEmployees: true,
    });

    expect(seats[0].inactiveReasons).toEqual(['on_leave']);
  });

  it('takes the inputs as a promise, so a caller still assembling them is not held back', async () => {
    const plain = await loadSeatPopulation(ORG, WINDOW, {
      matchEmployees: false,
      contractSeats: { holdersById, vendorByContractId },
    });
    const deferred = await loadSeatPopulation(ORG, WINDOW, {
      matchEmployees: false,
      contractSeats: Promise.resolve({ holdersById, vendorByContractId }),
    });

    expect(deferred.seats).toEqual(plain.seats);
  });

  it('drops a contract seat whose contract is off the caller’s register', async () => {
    mockReadContractSeats.mockResolvedValue([
      seatRow,
      { ...seatRow, id: 11, contract_id: 999 },
    ]);

    const { seats } = await loadSeatPopulation(ORG, WINDOW, {
      matchEmployees: false,
      contractSeats: { holdersById, vendorByContractId },
    });

    expect(seats.map((seat) => seat.id)).toEqual([10]);
  });
});

describe('withSeatEmployees', () => {
  it('folds the seat holders the caller’s own map never saw into one lookup', async () => {
    mockLoadSidSpendPopulation.mockResolvedValue(
      population({ employeesById: new Map([[employee.id, employee]]) }),
    );
    const seatPopulation = await loadSeatPopulation(ORG, WINDOW, {
      matchEmployees: true,
    });

    const merged = withSeatEmployees(
      new Map([[9, { ...employee, id: 9, name: 'Ada' }]]),
      seatPopulation,
    );

    expect([...merged.keys()]).toEqual([9, 31]);
  });
});
