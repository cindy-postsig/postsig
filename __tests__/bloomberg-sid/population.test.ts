jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockFetchFirmwideAccounts = jest.fn();
const mockFetchSidSeatSources = jest.fn();
const mockFetchHrEmployees = jest.fn();
jest.mock('@/lib/v2/bloomberg-sid/queries', () => ({
  fetchFirmwideAccounts: (...args: unknown[]) =>
    mockFetchFirmwideAccounts(...args),
  fetchSidSeatSources: (...args: unknown[]) => mockFetchSidSeatSources(...args),
  fetchHrEmployees: (...args: unknown[]) => mockFetchHrEmployees(...args),
}));

const mockReadUnits = jest.fn();
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  ...jest.requireActual('@/lib/v2/cost-allocation/context'),
  readUnits: (...args: unknown[]) => mockReadUnits(...args),
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({}),
}));

import {
  EMPTY_SID_SPEND_POPULATION,
  loadSidSpendPopulation,
} from '@/lib/v2/bloomberg-sid/population';
import type {
  SidAccount,
  SidHrEmployee,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import {
  sidContractId,
  sidSeatExchangeProductId,
  sidSeatProductId,
} from '@/lib/v2/bloomberg-sid/spend';

const ORG = 'org-1';
const VENDOR_ID = 9;
const CUST_NUM = 500;

const account = {
  id: 1,
  firmwideId: 4242,
  vendorId: VENDOR_ID,
  vendor: { name: 'Bloomberg', domain: 'bloomberg.com' },
};

// 'D' is Bloomberg's currency code for USD.
const sidAccount: SidAccount = {
  custNum: CUST_NUM,
  name: 'Trading Desk',
  city: 'New York',
  state: null,
  country: 'US',
  currencyCode: 'D',
  taxRate: 0,
  auto: 0,
  term: 12,
};

const subscription = (
  sid: number,
  lastUser: string,
  price: number,
): SidSubscription => ({
  custNum: CUST_NUM,
  sid,
  sidInstNum: 1,
  contractDate: '2026-01-01',
  renewalDate: '2028-01-01',
  lastUser,
  sidType: 1,
  sidDescription: 'Terminal',
  gptt: 7,
  gpttDescription: 'Bloomberg Anywhere',
  serialNumber: `S-${sid}`,
  ws: null,
  ninetyDay: false,
  special: null,
  price,
  poNumber: null,
});

const seatSource = (...subscriptions: SidSubscription[]) => ({
  reportMonth: '2026-07-01',
  accounts: [sidAccount],
  subscriptions,
  fees: [],
  feeLines: [],
});

const WINDOW = {
  start: new Date('2026-01-01T00:00:00.000Z'),
  end: new Date('2027-01-01T00:00:00.000Z'),
};

const employee: SidHrEmployee = {
  id: 31,
  firstName: 'Bo',
  lastName: 'Zhang',
  department: 'Research',
  costCenter: 'CC-1',
  orgUnitId: 2,
  status: 'active',
};

const units = [
  { id: 1, level: 'entity', name: 'Bank', parent_id: null },
  { id: 2, level: 'department', name: 'Research', parent_id: 1 },
  { id: 3, level: 'cost_center', name: 'CC-1', parent_id: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchFirmwideAccounts.mockResolvedValue([account]);
  mockFetchSidSeatSources.mockResolvedValue([
    seatSource(subscription(11, 'Bo Zhang', 100)),
  ]);
  mockFetchHrEmployees.mockResolvedValue([employee]);
  mockReadUnits.mockResolvedValue(units);
});

describe('loadSidSpendPopulation', () => {
  it('is empty for an org with no firmwide account', async () => {
    mockFetchFirmwideAccounts.mockResolvedValue([]);

    const population = await loadSidSpendPopulation(ORG, { window: WINDOW });

    expect(population).toBe(EMPTY_SID_SPEND_POPULATION);
    expect(mockFetchSidSeatSources).not.toHaveBeenCalled();
  });

  it("builds one engine input per billing account, with the vendor's display ref", async () => {
    const population = await loadSidSpendPopulation(ORG, {
      window: WINDOW,
      vendorId: 9,
    });

    expect(mockFetchFirmwideAccounts).toHaveBeenCalledWith(ORG, {
      vendorId: 9,
    });
    // The loader hands the window down as ISO dates, the shape report months
    // compare in.
    expect(mockFetchSidSeatSources).toHaveBeenCalledWith(
      ORG,
      account.firmwideId,
      { start: '2026-01-01', end: '2027-01-01' },
    );
    expect(population.contracts).toEqual([
      expect.objectContaining({
        id: sidContractId(CUST_NUM),
        vendor_id: VENDOR_ID,
        currency: 'USD',
      }),
    ]);
    expect(population.refs[String(VENDOR_ID)]).toEqual({
      label: 'Bloomberg',
      vendorDomain: 'bloomberg.com',
    });
    expect(population.seats).toEqual([
      { seat: expect.objectContaining({ sid: 11 }), vendorName: 'Bloomberg' },
    ]);
  });

  it('attributes a seat to the employee its last_user matched', async () => {
    const population = await loadSidSpendPopulation(ORG, {
      window: WINDOW,
      matchEmployees: true,
    });

    expect(population.seats[0].employee?.name).toBe('Bo Zhang');
    expect(population.seats[0].holder).toEqual({
      id: employee.id,
      name: 'Bo Zhang',
      status: 'active',
      deleted_at: null,
    });
    expect(population.employeesById.get(employee.id)).toEqual({
      id: employee.id,
      name: 'Bo Zhang',
      org_unit_id: 2,
      cost_center_unit_id: 3,
      active: true,
    });
    const allocation = population.allocations?.get(sidContractId(CUST_NUM));
    const lines = [
      {
        target: {
          kind: 'employee',
          id: employee.id,
          name: 'Bo Zhang',
          orgUnitId: 2,
          costCenterUnitId: 3,
        },
        percent: 100,
      },
    ];
    // The terminal and its exchange charges are two engine products, both on
    // the same holder.
    expect(allocation?.scopes).toEqual([
      expect.objectContaining({
        productId: sidSeatProductId({ sid: 11, sidInstNum: 1 }),
        mode: 'manual',
        sourceContractId: sidContractId(CUST_NUM),
        lines,
      }),
      expect.objectContaining({
        productId: sidSeatExchangeProductId({ sid: 11, sidInstNum: 1 }),
        lines,
      }),
    ]);
  });

  it('carries the matched holder’s HR status, active or not', async () => {
    mockFetchHrEmployees.mockResolvedValue([
      { ...employee, status: 'on_leave' },
    ]);

    const population = await loadSidSpendPopulation(ORG, {
      window: WINDOW,
      matchEmployees: true,
    });

    expect(population.seats[0].holder?.status).toBe('on_leave');
  });

  it('leaves a seat nobody in the roster answers for unallocated', async () => {
    mockFetchSidSeatSources.mockResolvedValue([
      seatSource(subscription(12, 'Shared Desk', 50)),
    ]);

    const population = await loadSidSpendPopulation(ORG, {
      window: WINDOW,
      matchEmployees: true,
    });

    expect(population.employeesById.size).toBe(0);
    expect(population.seats[0].employee).toBeUndefined();
    expect(population.seats[0].holder).toBeUndefined();
    expect(
      population.allocations?.get(sidContractId(CUST_NUM))?.scopes[0].lines,
    ).toEqual([]);
  });

  it('skips the roster reads unless employee matching is asked for', async () => {
    const population = await loadSidSpendPopulation(ORG, { window: WINDOW });

    expect(population.allocations).toBeUndefined();
    expect(population.employeesById.size).toBe(0);
    expect(mockFetchHrEmployees).not.toHaveBeenCalled();
    expect(mockReadUnits).not.toHaveBeenCalled();
  });

  it('contributes nothing for an account with no imported report', async () => {
    mockFetchSidSeatSources.mockResolvedValue([]);

    const population = await loadSidSpendPopulation(ORG, {
      window: WINDOW,
      matchEmployees: true,
    });

    expect(population.contracts).toEqual([]);
    expect(population.refs).toEqual({});
    expect(population.allocations).toBeUndefined();
    expect(mockFetchHrEmployees).not.toHaveBeenCalled();
  });
});

describe('loadSidSpendPopulation — seats gone before the window', () => {
  it('leaves out a seat only the report before the window knows, and keeps the rest', async () => {
    const march = {
      ...seatSource(
        subscription(11, 'Bo Zhang', 100),
        subscription(12, 'Gone Person', 100),
      ),
      reportMonth: '2026-03-01',
    };
    const april = {
      ...seatSource(subscription(11, 'Bo Zhang', 100)),
      reportMonth: '2026-04-01',
    };
    mockFetchSidSeatSources.mockResolvedValue([march, april]);

    const population = await loadSidSpendPopulation(ORG, {
      window: {
        start: new Date('2026-04-01T00:00:00.000Z'),
        end: new Date('2026-05-01T00:00:00.000Z'),
      },
    });

    expect(population.seats.map((record) => record.seat.sid)).toEqual([11]);
    expect(Object.keys(population.refs)).not.toContain(
      `${sidContractId(CUST_NUM)}:${sidSeatProductId({ sid: 12, sidInstNum: 1 })}`,
    );
  });

  it('keeps a seat that dropped out inside the window, since it booked months there', async () => {
    const march = {
      ...seatSource(subscription(12, 'Gone Person', 100)),
      reportMonth: '2026-03-01',
    };
    const april = {
      ...seatSource(subscription(11, 'Bo Zhang', 100)),
      reportMonth: '2026-04-01',
    };
    mockFetchSidSeatSources.mockResolvedValue([march, april]);

    const population = await loadSidSpendPopulation(ORG, { window: WINDOW });

    expect(population.seats.map((record) => record.seat.sid).sort()).toEqual([
      11, 12,
    ]);
  });
});
