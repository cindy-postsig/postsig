jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
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

const getOrgHierarchyLevelOrder = jest.fn();
jest.mock('@/lib/v2/org-units/sync', () => ({
  getOrgHierarchyLevelOrder: (...args: unknown[]) =>
    getOrgHierarchyLevelOrder(...args),
}));

const loadPickerEmployees = jest.fn();
jest.mock('@/lib/v2/cost-allocation/tab-data', () => ({
  loadPickerEmployees: (...args: unknown[]) => loadPickerEmployees(...args),
}));

const loadSeatPopulation = jest.fn();
jest.mock('@/lib/v2/seats/service', () => ({
  ...jest.requireActual('@/lib/v2/seats/service'),
  loadSeatPopulation: (...args: unknown[]) => loadSeatPopulation(...args),
}));

const getContractsList = jest.fn();
jest.mock('@/lib/v2/contracts/service', () => ({
  getContractsList: (...args: unknown[]) => getContractsList(...args),
}));

const loadBudgets = jest.fn();
jest.mock('@/lib/v2/cost-allocation/budgets', () => ({
  ...jest.requireActual('@/lib/v2/cost-allocation/budgets'),
  loadBudgets: (...args: unknown[]) => loadBudgets(...args),
}));

// All Time reads the org's recorded contract dates to size its window.
const mockContractRows: Array<{
  term_start_date: unknown;
  term_end_date: unknown;
}> = [];
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: () =>
              Promise.resolve({ data: mockContractRows, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import type { SidSpendPopulation } from '@/lib/v2/bloomberg-sid/population';
import type { UserMetadata } from '@/constants/types';
import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import { loadAllocationRollupReport } from '@/lib/v2/cost-allocation/rollup-report';
import type { AllocationEmployee } from '@/lib/v2/cost-allocation/types';

const TODAY = new Date('2026-08-25T12:00:00Z');

const noSeats: SidSpendPopulation = {
  contracts: [],
  seats: [],
  resolveSegments: () => [],
  employeesById: new Map(),
  vendorIds: new Set(),
  refs: {},
};

const seatPopulationOf = (engine: SidSpendPopulation) => ({
  seats: [],
  engine,
});

const user = {
  organizationId: 'org-1',
  organizationFY: 4,
  baseCurrency: 'EUR',
} as unknown as UserMetadata;

const ctx = buildAllocationContext({
  allocations: [],
  lines: [],
  units: [
    { id: 1, level: 'entity', name: 'Bank', parent_id: null },
    { id: 2, level: 'department', name: 'Research', parent_id: 1 },
  ],
  employees: [
    { id: 9, name: 'Ada', status: 'active', deleted_at: null, org_unit_id: 2 },
  ],
  seats: [],
  relationships: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  loadSeatPopulation.mockResolvedValue(seatPopulationOf(noSeats));
  getContractsList.mockResolvedValue({ contracts: [] });
  getDefaultCostMethod.mockResolvedValue('amortized');
  loadAllocationContextForRequest.mockResolvedValue(ctx);
  getOrgHierarchyLevelOrder.mockResolvedValue(['entity', 'department']);
  loadPickerEmployees.mockResolvedValue([
    {
      id: 9,
      name: 'Ada',
      status: 'active',
      deleted_at: null,
      org_unit_id: 2,
      cost_center: null,
    },
  ]);
  loadBudgets.mockResolvedValue([
    { org_unit_id: 2, org_employee_id: null, fiscal_year: 2025, amount: 100 },
    { org_unit_id: 2, org_employee_id: null, fiscal_year: 2026, amount: 300 },
  ]);
  runSpendQuery.mockResolvedValue({
    items: [
      { period: '2026-01', groupKey: 'unit:2', value: 10.5 },
      { period: '2026-02', groupKey: 'unit:2', value: 4.5 },
      { period: '2026-02', groupKey: 'user:9', value: 3 },
      { period: '2026-03', groupKey: 'unassigned', value: 7 },
    ],
  });
});

describe('loadAllocationRollupReport', () => {
  it("asks the canonical spend runner for the allocation dimension at level 'user' under the org's default method", async () => {
    const data = await loadAllocationRollupReport(
      user,
      { period: 'this-month' },
      TODAY,
    );

    expect(getDefaultCostMethod).toHaveBeenCalledWith('org-1');
    expect(runSpendQuery).toHaveBeenCalledWith(
      user,
      {
        kind: 'spend',
        basis: 'amortized',
        window: { from: '2026-08-01', to: '2026-09-01' },
        granularity: 'month',
        groupBy: { kind: 'allocation', level: 'user' },
      },
      { bloombergSid: noSeats },
    );
    expect(data.costMethod).toBe('amortized');
    expect(data.period).toBe('this-month');
    expect(data.window).toEqual({ start: '2026-08-01', end: '2026-09-01' });
    expect(data.bloombergSeatRenewalIncreasePercent).toBeNull();
  });

  it('reports the seat renewal estimate only when seats are in the population', async () => {
    loadSeatPopulation.mockResolvedValue(
      seatPopulationOf({
        ...noSeats,
        contracts: [{ id: -500, vendor_products_details: [] }],
      }),
    );

    const data = await loadAllocationRollupReport(
      user,
      { period: 'this-month' },
      TODAY,
    );

    expect(data.bloombergSeatRenewalIncreasePercent).toBe(6.5);
  });

  it('sums the engine items per target key across the window', async () => {
    const data = await loadAllocationRollupReport(
      user,
      { period: 'this-month' },
      TODAY,
    );

    expect(data.rows['unit:2']).toEqual(
      expect.objectContaining({ direct: 15, rollup: 3, total: 18 }),
    );
    expect(data.rows['unit:1']).toEqual(
      expect.objectContaining({ direct: 0, rollup: 18, total: 18 }),
    );
    expect(data.views.map((v) => [v.key, v.unassigned, v.spendTotal])).toEqual([
      ['entity', 7, 25],
      ['department', 7, 25],
      ['user', 7, 25],
    ]);
    expect(data.projected).toBeNull();
  });

  it("pairs the Current FY preset with the dashboard's nextFY total, and only that preset", async () => {
    runSpendQuery.mockImplementation((_user, input: { groupBy: unknown }) =>
      Promise.resolve(
        input.groupBy === 'total'
          ? { items: [{ period: 'FY2027', groupKey: 'total', value: 40.125 }] }
          : { items: [{ period: '2026-05', groupKey: 'unit:2', value: 30 }] },
      ),
    );

    const data = await loadAllocationRollupReport(
      user,
      { period: 'current-fy' },
      TODAY,
    );

    expect(data.window).toEqual({ start: '2026-04-01', end: '2027-04-01' });
    // Allocation targets, the unallocated list's per-contract totals, and the
    // dashboard's nextFY pair.
    expect(runSpendQuery).toHaveBeenCalledTimes(3);
    expect(runSpendQuery).toHaveBeenCalledWith(
      user,
      {
        kind: 'spend',
        basis: 'amortized',
        window: 'nextFY',
        granularity: 'year',
        groupBy: 'total',
      },
      { bloombergSid: noSeats },
    );
    expect(data.projected).toBe(40.13);
    expect(data.views[0].spendTotal).toBe(30);

    runSpendQuery.mockClear();
    const projectedOnly = await loadAllocationRollupReport(
      user,
      { period: 'projected-fy' },
      TODAY,
    );
    expect(projectedOnly.window).toEqual({
      start: '2027-04-01',
      end: '2028-04-01',
    });
    expect(runSpendQuery).toHaveBeenCalledTimes(2);
    expect(projectedOnly.projected).toBeNull();
  });

  it('keys budgets on the fiscal years the window touches — a single FY is editable', async () => {
    // August 2026 under an April FY start = FY2026 only.
    const data = await loadAllocationRollupReport(
      user,
      { period: 'this-month' },
      TODAY,
    );

    expect(data.fiscalYears).toEqual([2026]);
    expect(data.budgetFiscalYear).toBe(2026);
    expect(data.rows['unit:2'].budget).toBe(300);
  });

  it('sums the budgets of a window spanning fiscal years and makes them read-only', async () => {
    // Calendar YTD from Jan 1 straddles FY2025 and FY2026 under an April start.
    const data = await loadAllocationRollupReport(
      user,
      { period: 'ytd' },
      TODAY,
    );

    expect(data.fiscalYears).toEqual([2025, 2026]);
    expect(data.budgetFiscalYear).toBeNull();
    expect(data.rows['unit:2'].budget).toBe(400);
    expect(data.rows['unit:1'].rolledUpBudget).toBe(400);
  });

  it('runs Contract Term as start-dated annual commitments, the same input the budget cards use', async () => {
    getDefaultCostMethod.mockResolvedValue('committed');
    // FY starts in April: 2021-06 is FY2021, 2027-05 is FY2027.
    mockContractRows.push({
      term_start_date: [{ date: '2021-06-01' }],
      term_end_date: [{ date: '2027-05-31' }],
    });

    await loadAllocationRollupReport(user, { period: 'all' }, TODAY);

    expect(runSpendQuery).toHaveBeenCalledWith(
      user,
      {
        kind: 'commitments',
        valuation: 'annual',
        recognition: 'term-start',
        // All Time is the org's own fiscal-year span. It used to be the
        // engine's full 2000-2100 bounds, which made the renewal resolver
        // project — and compound — seventy years of cycles.
        window: { from: '2021-04-01', to: '2028-04-01' },
        granularity: 'month',
        groupBy: { kind: 'allocation', level: 'user' },
      },
      { bloombergSid: noSeats },
    );
  });

  it('starts All Time at a seat contracted before any recorded contract', async () => {
    mockContractRows.push({
      term_start_date: [{ date: '2021-06-01' }],
      term_end_date: [{ date: '2027-05-31' }],
    });
    loadSeatPopulation.mockResolvedValue(
      seatPopulationOf({
        ...noSeats,
        contracts: [
          {
            id: -500,
            term_start_date: [{ date: '2015-06-01' }],
            vendor_products_details: [],
          },
        ],
      }),
    );

    await loadAllocationRollupReport(user, { period: 'all' }, TODAY);

    // FY starts in April: the seat's 2015-06 start opens FY2015; the end is
    // still the contracts' latest term end.
    expect(runSpendQuery).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        window: { from: '2015-04-01', to: '2028-04-01' },
        groupBy: { kind: 'allocation', level: 'user' },
      }),
      expect.anything(),
    );
  });

  it('defaults a missing fiscal year start month to January', async () => {
    const data = await loadAllocationRollupReport(
      { ...user, organizationFY: undefined } as UserMetadata,
      { period: 'ytd' },
      TODAY,
    );

    expect(data.fiscalYears).toEqual([2026]);
  });

  it('loads the seat population once and runs every query over it', async () => {
    await loadAllocationRollupReport(user, { period: 'current-fy' }, TODAY);

    expect(loadSeatPopulation).toHaveBeenCalledTimes(1);
    // The org's FY starts in April. Current FY also runs the nextFY companion
    // query, so the population has to be priced out to the end of FY2027.
    expect(loadSeatPopulation).toHaveBeenCalledWith(
      'org-1',
      {
        start: new Date('2026-04-01T00:00:00.000Z'),
        end: new Date('2028-04-01T00:00:00.000Z'),
      },
      { matchEmployees: true },
    );
    const scopes = runSpendQuery.mock.calls.map((call) => call[2]);
    expect(scopes).toHaveLength(3);
    for (const scope of scopes) {
      expect(scope.bloombergSid).toBe(noSeats);
    }
  });

  it('loads a preset with no companion query for its own window alone', async () => {
    await loadAllocationRollupReport(user, { period: 'this-month' }, TODAY);

    expect(loadSeatPopulation).toHaveBeenCalledWith(
      'org-1',
      {
        start: new Date('2026-08-01T00:00:00.000Z'),
        end: new Date('2026-09-01T00:00:00.000Z'),
      },
      { matchEmployees: true },
    );
  });

  it('places a seat holder the allocation context never saw under their org unit', async () => {
    const seatHolder: AllocationEmployee = {
      id: 42,
      name: 'Bo Zhang',
      org_unit_id: 2,
      cost_center_unit_id: null,
      active: true,
    };
    loadSeatPopulation.mockResolvedValue(
      seatPopulationOf({
        ...noSeats,
        employeesById: new Map([[seatHolder.id, seatHolder]]),
      }),
    );
    runSpendQuery.mockResolvedValue({
      items: [{ period: '2026-08', groupKey: 'user:42', value: 25 }],
    });

    const data = await loadAllocationRollupReport(
      user,
      { period: 'this-month' },
      TODAY,
    );

    expect(data.rows['user:42']).toEqual(
      expect.objectContaining({
        name: 'Bo Zhang',
        direct: 25,
        total: 25,
        path: ['Bank', 'Research', 'Bo Zhang'],
      }),
    );
    expect(data.rows['unit:2'].childKeys).toContain('user:42');
    expect(data.rows['unit:2'].rollup).toBe(25);
    expect(data.rows['unit:1'].rollup).toBe(25);
    for (const view of data.views) {
      expect(view.outsideHierarchy).toBe(0);
      expect(view.outsideHierarchyRows).toEqual([]);
      expect(view.spendTotal).toBe(25);
    }
  });
});

describe('loadAllocationRollupReport unallocated contracts', () => {
  const ALLOCATED = 10;
  const CHILD = 11;
  const ORDERED = 12;
  const UNNUMBERED = 13;
  const INVOICE = 14;

  const contract = (
    id: number,
    typeId: number,
    orderNumber: string | null = null,
  ) => ({
    id,
    vendor_name: 'Acme',
    contract: {
      type_id: typeId,
      contract_types: { name: 'MSA' },
      metadata: { lineage: { order_number: orderNumber } },
    },
  });

  beforeEach(() => {
    loadAllocationContextForRequest.mockResolvedValue(
      buildAllocationContext({
        allocations: [
          { id: 1, contract_id: ALLOCATED, product_id: null, mode: 'manual' },
        ],
        lines: [
          {
            id: 1,
            allocation_id: 1,
            org_unit_id: 2,
            org_employee_id: null,
            percent: 100,
          },
        ],
        units: [
          { id: 1, level: 'entity', name: 'Bank', parent_id: null },
          { id: 2, level: 'department', name: 'Research', parent_id: 1 },
        ],
        employees: [],
        seats: [],
        relationships: [
          {
            parent_contract_id: ALLOCATED,
            child_contract_id: CHILD,
            relationship_type: null,
          },
        ],
      }),
    );
    getContractsList.mockResolvedValue({
      contracts: [
        contract(ALLOCATED, 1),
        contract(CHILD, 3),
        contract(ORDERED, 1, 'ORD-12'),
        contract(UNNUMBERED, 1),
        contract(INVOICE, 6, 'INV-14'),
      ],
    });
    runSpendQuery.mockImplementation((_user, input: { groupBy: unknown }) =>
      Promise.resolve(
        input.groupBy === 'contract'
          ? {
              items: [
                { period: '2026-08', groupKey: String(ORDERED), value: 5 },
                { period: '2026-08', groupKey: String(ORDERED), value: 2.505 },
                { period: '2026-08', groupKey: String(INVOICE), value: 99 },
              ],
            }
          : { items: [] },
      ),
    );
  });

  it('reads the same engine-stamped contract set the invoice report does', async () => {
    await loadAllocationRollupReport(user, { period: 'this-month' }, TODAY);

    expect(getContractsList).toHaveBeenCalledWith({
      status: 'active',
      productValues: true,
    });
    expect(runSpendQuery).toHaveBeenCalledWith(
      user,
      {
        kind: 'spend',
        basis: 'amortized',
        window: { from: '2026-08-01', to: '2026-09-01' },
        granularity: 'month',
        groupBy: 'contract',
      },
      { bloombergSid: noSeats },
    );
  });

  it('lists only contracts with nothing allocated, invoice records aside', async () => {
    const data = await loadAllocationRollupReport(
      user,
      { period: 'this-month' },
      TODAY,
    );

    // ALLOCATED has its own lines; CHILD inherits them through the hierarchy;
    // INVOICE is an invoice record, whose allocation is its parent's story.
    expect(data.unallocatedContracts.map((row) => row.id)).toEqual([
      UNNUMBERED,
      ORDERED,
    ]);
  });

  it('names a contract by its order number, or by its type and id when it has none, and joins the window spend on by id', async () => {
    const data = await loadAllocationRollupReport(
      user,
      { period: 'this-month' },
      TODAY,
    );

    // Rows sort by vendor, then name. A contract the window's spend never
    // mentions has no amount to state rather than a zero.
    expect(data.unallocatedContracts).toEqual([
      {
        id: UNNUMBERED,
        vendor: 'Acme',
        vendorDomain: '',
        name: 'MSA · ID 13',
        product: '',
        products: [],
        termStart: null,
        termEnd: null,
        amount: null,
      },
      {
        id: ORDERED,
        vendor: 'Acme',
        vendorDomain: '',
        name: 'ORD-12',
        product: '',
        products: [],
        termStart: null,
        termEnd: null,
        amount: 7.51,
      },
    ]);
  });
});
