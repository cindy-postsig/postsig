jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const runSpendQuery = jest.fn();
jest.mock('@/app/api/v2/handlers/spend/query', () => ({
  runSpendQuery: (...args: unknown[]) => runSpendQuery(...args),
}));

const getDefaultCostMethod = jest.fn();
jest.mock('@/lib/settings/default-cost-method', () => ({
  getDefaultCostMethod: (...args: unknown[]) => getDefaultCostMethod(...args),
}));

const loadAllocationContextForRequest = jest.fn();
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  ...jest.requireActual('@/lib/v2/cost-allocation/context'),
  loadAllocationContextForRequest: (...args: unknown[]) =>
    loadAllocationContextForRequest(...args),
}));

const loadSeatPopulation = jest.fn();
jest.mock('@/lib/v2/seats/service', () => ({
  ...jest.requireActual('@/lib/v2/seats/service'),
  loadSeatPopulation: (...args: unknown[]) => loadSeatPopulation(...args),
}));

const getEnrichedContracts = jest.fn();
jest.mock('@/lib/v2/contracts/service', () => ({
  getEnrichedContracts: (...args: unknown[]) => getEnrichedContracts(...args),
}));

let mockDb: FakeDb;
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockDb.client(),
}));

import type { UserMetadata } from '@/constants/types';
import { readAssignmentEmployees } from '@/data/superuser/assignments';
import type { SidSpendPopulation } from '@/lib/v2/bloomberg-sid/population';
import {
  sidContractId,
  sidExchangeProductIdFor,
} from '@/lib/v2/bloomberg-sid/spend';
import { computeScopeMetrics } from '@/lib/v2/assignments/metrics';
import { buildProductRows } from '@/lib/v2/assignments/rows';
import { loadAssignmentsPage } from '@/lib/v2/assignments/service';
import { FIRMWIDE } from '@/lib/v2/assignments/types';
import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import type { Seat } from '@/lib/v2/seats/types';
import { FakeDb, FAKE_ORG_ID } from '../cost-allocation/fake-db';

type ServiceClient = Parameters<typeof readAssignmentEmployees>[1];

const TODAY = new Date('2026-09-08T12:00:00Z');
const USER = {
  organizationId: FAKE_ORG_ID,
  organizationFY: 1,
  baseCurrency: 'EUR',
} as unknown as UserMetadata;

const CONTRACT = 100;
const SEATLESS_CONTRACT = 101;
const SECOND_TERMINAL = -266891006;
const PRODUCT = 200;
const OTHER_PRODUCT = 201;
const ACCOUNT = sidContractId(500);
const TERMINAL = -266891005;
const EXCHANGE = sidExchangeProductIdFor(TERMINAL);
/** Both terminals below are the same Bloomberg product. */
const GPTT = 7;

const EMPTY_ENGINE: SidSpendPopulation = {
  contracts: [],
  seats: [],
  resolveSegments: () => [],
  employeesById: new Map(),
  vendorIds: new Set(),
  refs: {},
};

const contractRecord = {
  id: CONTRACT,
  vendor_id: 5,
  vendor_name: 'Refinitiv',
  contract: { term_start_date: [{ date: '2026-01-01' }] },
};

const contractSeat = (
  id: number,
  orgEmployeeId: number,
  productId: number | null = PRODUCT,
): Seat => ({
  id,
  source: 'contract_user',
  contractId: CONTRACT,
  productId,
  catalogProductId: productId,
  vendorId: 5,
  vendorName: 'Refinitiv',
  productName: 'Workspace',
  deliveryMethods: ['Desktop'],
  holder: { orgEmployeeId, displayName: 'Holder' },
  startDate: '2026-01-15',
  endDate: null,
  inactiveReasons: [],
  underused: false,
});

const terminalSeat = (
  orgEmployeeId: number | null,
  over: Partial<Seat> = {},
): Seat => ({
  id: TERMINAL,
  source: 'bloomberg_sid',
  contractId: ACCOUNT,
  productId: TERMINAL,
  catalogProductId: GPTT,
  vendorId: 9,
  vendorName: 'Bloomberg',
  productName: 'Bloomberg Anywhere',
  deliveryMethods: ['Terminal'],
  holder: {
    orgEmployeeId,
    displayName: orgEmployeeId === null ? 'user 492 ffm' : 'Ada Lovelace',
  },
  startDate: '2000-04-07',
  endDate: '2028-04-07',
  inactiveReasons: orgEmployeeId === null ? ['not_in_hr'] : [],
  underused: orgEmployeeId === null,
  ...over,
});

const seatsAre = (seats: Seat[]) =>
  loadSeatPopulation.mockResolvedValue({ seats, engine: EMPTY_ENGINE });

const monthIs = (items: { groupKey: string; value: number }[]) =>
  runSpendQuery.mockResolvedValue({
    items: items.map((item) => ({ period: '2026-04', ...item })),
  });

/** The roster as the loader reads it, and as the allocation targets name it. */
function seedRoster(names: string[]): number[] {
  const unit = mockDb.seedUnit('entity', 'Markets');
  const ids = names.map(
    (name) => mockDb.seedEmployee(name, unit.id as number).id as number,
  );
  loadAllocationContextForRequest.mockResolvedValue(
    buildAllocationContext({
      allocations: [],
      lines: [],
      units: [
        {
          id: unit.id as number,
          level: 'entity',
          name: 'Markets',
          parent_id: null,
        },
      ],
      employees: ids.map((id, index) => ({
        id,
        name: names[index],
        status: 'active',
        deleted_at: null,
        org_unit_id: unit.id as number,
      })),
      seats: [],
      relationships: [],
    }),
  );
  return ids;
}

/** The same roster, with one allocation over `CONTRACT` resolved from its lines. */
function seedAllocation(
  names: string[],
  productId: number | null,
  shares: { employeeId: number; percent: number }[],
): void {
  const unit = mockDb.rowsOf('org_units')[0];
  const employees = mockDb.rowsOf('org_employees');
  loadAllocationContextForRequest.mockResolvedValue(
    buildAllocationContext({
      allocations: [
        { id: 1, contract_id: CONTRACT, product_id: productId, mode: 'manual' },
      ],
      lines: shares.map((share, index) => ({
        id: index + 1,
        allocation_id: 1,
        org_unit_id: null,
        org_employee_id: share.employeeId,
        percent: share.percent,
      })),
      units: [
        {
          id: unit.id as number,
          level: 'entity',
          name: 'Markets',
          parent_id: null,
        },
      ],
      employees: employees.map((employee, index) => ({
        id: employee.id as number,
        name: names[index],
        status: 'active',
        deleted_at: null,
        org_unit_id: unit.id as number,
      })),
      seats: [],
      relationships: [],
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb = new FakeDb();
  getDefaultCostMethod.mockResolvedValue('amortized');
  getEnrichedContracts.mockResolvedValue({ contracts: [contractRecord] });
  seedRoster([]);
  seatsAre([]);
  monthIs([]);
});

describe('readAssignmentEmployees', () => {
  it('scopes to the organization and skips soft-deleted rows', async () => {
    const db = new FakeDb();
    db.insertRow('org_employees', {
      organization_id: FAKE_ORG_ID,
      first_name: 'Ada',
      last_name: 'Lovelace',
      status: 'active',
      deleted_at: null,
    });
    db.insertRow('org_employees', {
      organization_id: FAKE_ORG_ID,
      first_name: 'Gone',
      last_name: 'Person',
      status: 'active',
      deleted_at: '2026-02-01T00:00:00.000Z',
    });
    db.insertRow('org_employees', {
      organization_id: 'other-org',
      first_name: 'Other',
      last_name: 'Org',
      status: 'active',
      deleted_at: null,
    });

    const rows = await readAssignmentEmployees(
      FAKE_ORG_ID,
      db.client() as ServiceClient,
    );
    expect(rows.map((row) => row.first_name)).toEqual(['Ada']);
  });
});

describe('loadAssignmentsPage: the window', () => {
  it('defaults to the current calendar month and prices that month alone', async () => {
    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    expect(payload.window).toEqual({
      month: '2026-09',
      label: 'September 2026',
    });
    expect(loadSeatPopulation).toHaveBeenCalledWith(
      FAKE_ORG_ID,
      {
        start: new Date('2026-09-01T00:00:00.000Z'),
        end: new Date('2026-10-01T00:00:00.000Z'),
      },
      expect.objectContaining({ matchEmployees: true }),
    );
    expect(runSpendQuery).toHaveBeenCalledTimes(1);
    expect(runSpendQuery).toHaveBeenCalledWith(
      USER,
      {
        kind: 'spend',
        basis: 'amortized',
        window: { from: '2026-09-01', to: '2026-10-01' },
        granularity: 'month',
        groupBy: 'product',
      },
      { bloombergSid: EMPTY_ENGINE },
    );
  });

  it('reads the un-stamped contract set the spend query shares', async () => {
    // Engine-spend stamps are two commitment passes plus an FX prefetch the
    // page never reads: it prices seats through its own engine query.
    await loadAssignmentsPage(USER, {}, TODAY);

    expect(getEnrichedContracts).toHaveBeenCalledTimes(1);
    expect(getEnrichedContracts).toHaveBeenCalledWith(
      'active',
      false,
      false,
      0,
      false,
    );
  });

  it('takes the month off the URL', async () => {
    const payload = await loadAssignmentsPage(
      USER,
      { month: '2026-02' },
      TODAY,
    );

    expect(payload.window).toEqual({
      month: '2026-02',
      label: 'February 2026',
    });
  });

  it('ignores a month it cannot use', async () => {
    const payload = await loadAssignmentsPage(
      USER,
      { month: '2026-13' },
      TODAY,
    );

    expect(payload.window.month).toBe('2026-09');
  });
});

describe('loadAssignmentsPage: what the payload carries', () => {
  it('leaves unit ancestry to the tree rather than copying it per person', async () => {
    const [ada] = seedRoster(['Ada Lovelace']);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    expect(payload.users[ada]).not.toHaveProperty('path');
    expect(payload.users[ada]).not.toHaveProperty('pathByLevel');
    expect(payload.nodes[payload.rootIds[0]]).not.toHaveProperty('path');
  });

  it('details only the contracts a seat sits on', async () => {
    const [ada] = seedRoster(['Ada Lovelace']);
    getEnrichedContracts.mockResolvedValue({
      contracts: [contractRecord, { ...contractRecord, id: SEATLESS_CONTRACT }],
    });
    seatsAre([contractSeat(10, ada)]);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    expect(payload.productDetails).toHaveProperty(`${CONTRACT}:contract`);
    expect(payload.productDetails).not.toHaveProperty(
      `${SEATLESS_CONTRACT}:contract`,
    );
  });

  it('hands the population the roster and vendors it derives from the batch', async () => {
    const [ada] = seedRoster(['Ada Lovelace']);

    await loadAssignmentsPage(USER, {}, TODAY);

    const options = loadSeatPopulation.mock.calls[0][2];
    expect(options.matchEmployees).toBe(true);
    const inputs = await options.contractSeats;
    expect(inputs.holdersById.get(ada)).toMatchObject({
      id: ada,
      name: 'Ada Lovelace',
    });
    expect(inputs.vendorByContractId.get(CONTRACT)).toEqual({
      id: 5,
      name: 'Refinitiv',
    });
  });
});

describe('loadAssignmentsPage: what a seat costs', () => {
  it('prices a Bloomberg terminal with its entitlements folded in, and names their share', async () => {
    const [ada] = seedRoster(['Ada Lovelace']);
    seatsAre([
      terminalSeat(ada, {
        entitlements: {
          exchanges: [
            { code: 'CBOE', name: 'Cboe Europe L1', monthlyCost: 30 },
            { code: 'LSE', name: 'LSE L2', monthlyCost: 20 },
          ],
          productId: EXCHANGE,
        },
      }),
    ]);
    monthIs([
      { groupKey: `${ACCOUNT}:${TERMINAL}`, value: 2018.9 },
      { groupKey: `${ACCOUNT}:${EXCHANGE}`, value: 43.7 },
    ]);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    expect(payload.seats[TERMINAL]).toMatchObject({
      monthlyCost: 2062.6,
      entitlements: {
        monthlyCost: 43.7,
        exchanges: [
          { code: 'CBOE', name: 'Cboe Europe L1', monthlyCost: 26.22 },
          { code: 'LSE', name: 'LSE L2', monthlyCost: 17.48 },
        ],
      },
    });
    expect(payload.users[ada].monthlyCost).toBe(2062.6);
    expect(payload.users[ada].seatIds).toEqual([TERMINAL]);
  });

  it('leaves a terminal the roster could not place unlinked and unfunded', async () => {
    seedRoster(['Ada Lovelace']);
    seatsAre([terminalSeat(null)]);
    monthIs([
      { groupKey: `${ACCOUNT}:${TERMINAL}`, value: 2018.9 },
      { groupKey: `${ACCOUNT}:${EXCHANGE}`, value: 43.7 },
    ]);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    expect(payload.seats[TERMINAL]).toMatchObject({
      orgEmployeeId: null,
      holderName: 'user 492 ffm',
      monthlyCost: 0,
    });
    expect(computeScopeMetrics(payload, FIRMWIDE).unlinkedSeats).toBe(1);
  });

  it('counts the terminals of one product as its licences, over their whole span', async () => {
    const names = ['Ada Lovelace', 'Alan Turing'];
    const [ada, alan] = seedRoster(names);
    seatsAre([
      terminalSeat(ada),
      terminalSeat(alan, {
        id: SECOND_TERMINAL,
        productId: SECOND_TERMINAL,
        startDate: '2019-06-01',
        endDate: '2027-06-01',
      }),
    ]);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    // Keyed by billing account and product code, not by terminal: no rate,
    // because the two sit on their own terms at their own prices.
    expect(payload.productDetails[`${ACCOUNT}:${GPTT}`]).toEqual({
      contractId: ACCOUNT,
      orderNumber: null,
      contractType: null,
      startDate: '2000-04-07',
      endDate: '2028-04-07',
      annualIncrease: null,
      ratePerLicence: null,
      licences: 2,
    });
  });

  it('collapses the terminals of one product into a single row', async () => {
    const names = ['Ada Lovelace', 'Alan Turing'];
    const [ada, alan] = seedRoster(names);
    seatsAre([
      terminalSeat(ada),
      terminalSeat(alan, {
        id: SECOND_TERMINAL,
        productId: SECOND_TERMINAL,
      }),
    ]);
    monthIs([
      { groupKey: `${ACCOUNT}:${TERMINAL}`, value: 2018.9 },
      { groupKey: `${ACCOUNT}:${EXCHANGE}`, value: 43.7 },
      { groupKey: `${ACCOUNT}:${SECOND_TERMINAL}`, value: 1000 },
    ]);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);
    const [group] = buildProductRows(payload, FIRMWIDE);

    // Rows group on the product code across billing accounts; with one
    // account in play the row still finds that account's Details entry.
    expect(group.products).toHaveLength(1);
    expect(group.products[0]).toMatchObject({
      key: `product:${GPTT}`,
      productId: GPTT,
      productName: 'Bloomberg Anywhere',
      userCount: 2,
      monthlyCost: 3018.9,
    });
    expect(group.products[0].detail?.licences).toBe(2);
  });

  it('splits a product scope’s month between the holders it names', async () => {
    const names = ['Ada Lovelace', 'Alan Turing'];
    const [ada, alan] = seedRoster(names);
    seedAllocation(names, PRODUCT, [
      { employeeId: ada, percent: 60 },
      { employeeId: alan, percent: 40 },
    ]);
    seatsAre([contractSeat(10, ada), contractSeat(11, alan)]);
    monthIs([{ groupKey: `${CONTRACT}:${PRODUCT}`, value: 1000 }]);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    expect(payload.users[ada].monthlyCost).toBe(600);
    expect(payload.users[alan].monthlyCost).toBe(400);
    expect(payload.seats[10].monthlyCost).toBe(600);
  });

  it('splits one scope evenly across the seats one person holds under it', async () => {
    const names = ['Ada Lovelace'];
    const [ada] = seedRoster(names);
    seedAllocation(names, PRODUCT, [{ employeeId: ada, percent: 100 }]);
    seatsAre([contractSeat(10, ada), contractSeat(11, ada)]);
    monthIs([{ groupKey: `${CONTRACT}:${PRODUCT}`, value: 1000 }]);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    expect(payload.seats[10].monthlyCost).toBe(500);
    expect(payload.seats[11].monthlyCost).toBe(500);
    expect(payload.users[ada].monthlyCost).toBe(1000);
  });

  it('prices a whole-contract scope from every product bucket on the contract', async () => {
    const names = ['Ada Lovelace'];
    const [ada] = seedRoster(names);
    seedAllocation(names, null, [{ employeeId: ada, percent: 100 }]);
    seatsAre([contractSeat(10, ada)]);
    monthIs([
      { groupKey: `${CONTRACT}:${PRODUCT}`, value: 100 },
      { groupKey: `${CONTRACT}:${OTHER_PRODUCT}`, value: 50 },
    ]);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    expect(payload.users[ada].monthlyCost).toBe(150);
  });

  it('leaves a seat on an unallocated contract at nothing', async () => {
    const [ada] = seedRoster(['Ada Lovelace']);
    seatsAre([contractSeat(10, ada)]);
    monthIs([{ groupKey: `${CONTRACT}:${PRODUCT}`, value: 1000 }]);

    const payload = await loadAssignmentsPage(USER, {}, TODAY);

    expect(payload.seats[10].monthlyCost).toBe(0);
    expect(payload.users[ada].monthlyCost).toBe(0);
  });
});
