import type { Context } from 'hono';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const mockGetEnrichedContracts = jest.fn();
jest.mock('@/lib/v2/contracts/service', () => ({
  getEnrichedContracts: (...args: unknown[]) =>
    mockGetEnrichedContracts(...args),
}));

// In-memory stand-in for the Redis derivation store, so tests can prove
// which cache keys a query reads and writes.
const mockSegmentStore = new Map<string, unknown>();
const mockMget = async (keys: string[]) =>
  keys.map((key) => mockSegmentStore.get(key) ?? null);
const mockMset = async (pairs: Array<{ key: string; value: unknown }>) => {
  for (const pair of pairs) mockSegmentStore.set(pair.key, pair.value);
  return true;
};
jest.mock('@/app/lib/redis/cache-service', () => ({
  getCacheService: async () => ({
    redisService: { mget: mockMget, mset: mockMset },
  }),
}));

const mockLoadSidSpendPopulation = jest.fn();
const emptySidPopulation = {
  contracts: [],
  seats: [],
  resolveSegments: () => [],
  employeesById: new Map(),
  vendorIds: new Set(),
  refs: {},
};
jest.mock('@/lib/v2/bloomberg-sid/population', () => ({
  EMPTY_SID_SPEND_POPULATION: emptySidPopulation,
  loadSidSpendPopulation: (...args: unknown[]) =>
    mockLoadSidSpendPopulation(...args),
}));
// The route loads the org's seats for every flow-basis query; the handler
// describes below are about contracts, so they see an org without SID data.
const noSeats = () =>
  mockLoadSidSpendPopulation.mockResolvedValue(emptySidPopulation);

const mockLoadAllocationContext = jest.fn();
jest.mock('@/lib/v2/cost-allocation/context', () => {
  const actual = jest.requireActual('@/lib/v2/cost-allocation/context');
  return {
    ...actual,
    loadAllocationContext: (...args: unknown[]) =>
      mockLoadAllocationContext(...args),
  };
});

const mockGetDailyUsdRates = jest.fn<
  Promise<Map<string, Map<string, number>>>,
  [string[], string, string]
>();
const mockGetLatestUsdRates = jest.fn<
  Promise<Record<string, number>>,
  [string[]]
>();
jest.mock('@/lib/v2/core/fxRates', () => {
  const actual = jest.requireActual('@/lib/v2/core/fxRates');
  return {
    ...actual,
    getDailyUsdRates: (quotes: string[], from: string, to: string) =>
      mockGetDailyUsdRates(quotes, from, to),
    getLatestUsdRates: (quotes: string[]) => mockGetLatestUsdRates(quotes),
  };
});

import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';

import {
  querySpendHandler,
  runSpendQuery,
} from '@/app/api/v2/handlers/spend/query';
import type {
  SpendQueryInput,
  SpendQueryResponse,
} from '@/app/api/v2/handlers/spend/query';
import type { SidSpendPopulation } from '@/lib/v2/bloomberg-sid/population';
import type {
  SidAccount,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import {
  buildSidSeats,
  sidAllocations,
  sidSegmentResolver,
  sidSpendContracts,
  sidSpendRefs,
  type SidSeat,
} from '@/lib/v2/bloomberg-sid/spend';
import type { UserMetadata } from '@/constants/types';
import type { AllocationEmployee } from '@/lib/v2/cost-allocation/types';

// What the handler can hand back: the success payload, with the rejection
// fields present on 4xx/5xx responses. One shape keeps the assertions below
// free of per-test narrowing.
type HandlerResult = SpendQueryResponse & { error?: string; details?: unknown };

/**
 * The spend query handler feeds the budget overview's chart and method cards.
 * Confirmed lineage-event cancellation cutoffs (PSK-1830) resolved by
 * getEnrichedContracts must reach the engine's lineage graph — the regression
 * here was the handler dropping them, so cancelled products kept accruing in
 * the Spend Overview while the contracts table struck them.
 */

function makeEnrichedContract() {
  const contract = {
    id: 1,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: null,
    renewal_period: 12,
    renewal_type: 'Auto-Renew',
    billing_frequency: null,
    will_not_renew: false,
    updated_at: '2026-01-01T00:00:00Z',
    term_start_date: [{ date: '2026-01-01' }],
    term_end_date: [{ date: '2026-12-31' }],
    cancel_date: [],
    vendor_products_details: [
      {
        product_id: 1,
        year: 1,
        fees: 1200,
        vendor_products: { id: 1, name: 'Cancelled Product' },
      },
      {
        product_id: 2,
        year: 1,
        fees: 600,
        vendor_products: { id: 2, name: 'Surviving Product' },
      },
    ],
    vendors: { name: 'Test Vendor', domain: 'test.example' },
    users: { organizations: { fiscal_year_start_month: 1 } },
  };
  return {
    id: 1,
    contract,
    products: [
      { product_id: 1, name: 'Cancelled Product', isCancelled: true },
      { product_id: 2, name: 'Surviving Product' },
    ],
  };
}

function makeContext(
  body: unknown,
  userMetadata: unknown = { organizationId: 'org-1', organizationFY: 1 },
): {
  context: Context;
  result: () => HandlerResult;
  status: () => number;
} {
  let captured: unknown;
  let status = 200;
  const context = {
    get: (key: string) => (key === 'userMetadata' ? userMetadata : undefined),
    req: { json: async () => body },
    json: (payload: unknown, code?: number) => {
      captured = payload;
      status = code ?? 200;
      return payload;
    },
  } as unknown as Context;
  return {
    context,
    result: () => captured as HandlerResult,
    status: () => status,
  };
}

const query = {
  kind: 'spend',
  basis: 'amortized',
  window: { from: '2026-01-01', to: '2027-01-01' },
  granularity: 'year',
  groupBy: 'product',
};

function productTotals(items: Array<{ groupKey: string; value: number }>) {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.groupKey, (totals.get(item.groupKey) ?? 0) + item.value);
  }
  return totals;
}

describe('querySpendHandler — lineage-event cutoffs (PSK-1830)', () => {
  beforeEach(() => {
    mockGetEnrichedContracts.mockReset();
    mockSegmentStore.clear();
    noSeats();
  });

  it('strikes a cancelled product from the queried spend', async () => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      // Product 1 cancelled at term start: it must accrue nothing.
      cutoffsByContract: new Map([[1, new Map([[1, new Date('2026-01-01')]])]]),
    });

    const { context, result } = makeContext(query);
    await querySpendHandler(context);
    const totals = productTotals(result().items);

    expect(totals.get('1:1') ?? 0).toBe(0);
    expect(totals.get('1:2')).toBe(600);
  });

  it('leaves spend uncut when no cutoffs are resolved', async () => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });

    const { context, result } = makeContext(query);
    await querySpendHandler(context);
    const totals = productTotals(result().items);

    expect(totals.get('1:1')).toBe(1200);
    expect(totals.get('1:2')).toBe(600);
  });

  // Confirming a cancellation changes neither updated_at nor the fees, so
  // the derivation cache key must rotate on the cutoffs themselves — a
  // segment derivation cached before the cancellation may not be served.
  it('does not reuse segment derivations cached before a cancellation', async () => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
    const first = makeContext(query);
    await querySpendHandler(first.context);
    expect(productTotals(first.result().items).get('1:1')).toBe(1200);
    // The un-cut derivation is now cached.
    expect(mockSegmentStore.size).toBeGreaterThan(0);

    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map([[1, new Map([[1, new Date('2026-01-01')]])]]),
    });
    const second = makeContext(query);
    await querySpendHandler(second.context);
    const totals = productTotals(second.result().items);

    expect(totals.get('1:1') ?? 0).toBe(0);
    expect(totals.get('1:2')).toBe(600);
  });

  // Derived segments are org data: the component signature already encodes
  // each user's ACL-visible lineage membership, so a per-user key only bought
  // N copies of the same value per org.
  it('scopes derivation cache keys by org, not by user', async () => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });

    const { context } = makeContext(query);
    await querySpendHandler(context);

    const keys = [...mockSegmentStore.keys()];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^org:org-1:spend:seg:/);
    }
  });

  // The chart bar popover labels each contract row with refs.productName —
  // it must name a LIVE product, not one struck by a cancellation.
  it('labels contract rows with the first live product, not a cancelled one', async () => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map([[1, new Map([[1, new Date('2026-01-01')]])]]),
    });

    const { context, result } = makeContext({ ...query, groupBy: 'contract' });
    await querySpendHandler(context);

    expect(result().refs['1']?.productName).toBe('Surviving Product');
  });

  // The vendors list rolls product buckets up under their vendor by product,
  // so a product key's ref has to say which vendor and product it is for.
  it('places each product key under its vendor and product', async () => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });

    const { context, result } = makeContext(query);
    await querySpendHandler(context);

    expect(result().refs['1:2']).toEqual({
      label: 'Surviving Product',
      vendorDomain: 'test.example',
      productName: 'Surviving Product',
      vendorId: 1,
      productId: 2,
    });
  });
});

describe('querySpendHandler — allocation dimension (psk-1846)', () => {
  beforeEach(() => {
    mockGetEnrichedContracts.mockReset();
    mockLoadAllocationContext.mockReset();
    mockSegmentStore.clear();
    noSeats();
  });

  it("rejects the retired 'group' string with a 400", async () => {
    const { context, result, status } = makeContext({
      ...query,
      groupBy: 'group',
    });
    await querySpendHandler(context);
    expect(status()).toBe(400);
    expect(result().error).toBe('Invalid spend query');
  });

  it('rejects an unknown allocation level', async () => {
    const { context, status } = makeContext({
      ...query,
      groupBy: { kind: 'allocation', level: 'floor' },
    });
    await querySpendHandler(context);
    expect(status()).toBe(400);
  });

  it('resolves allocations outside the engine and labels node keys in refs', async () => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
    mockLoadAllocationContext.mockResolvedValue(
      buildAllocationContext({
        allocations: [
          { id: 1, contract_id: 1, product_id: null, mode: 'manual' },
        ],
        lines: [
          {
            id: 1,
            allocation_id: 1,
            org_unit_id: 7,
            org_employee_id: null,
            percent: 60,
          },
          {
            id: 2,
            allocation_id: 1,
            org_unit_id: 8,
            org_employee_id: null,
            percent: 40,
          },
        ],
        units: [
          { id: 7, level: 'business_group', name: 'Trading', parent_id: null },
          { id: 8, level: 'business_group', name: 'Ops', parent_id: null },
        ],
        employees: [],
        seats: [],
        relationships: [],
      }),
    );

    const { context, result, status } = makeContext({
      ...query,
      groupBy: { kind: 'allocation', level: 'business_group' },
    });
    await querySpendHandler(context);

    expect(status()).toBe(200);
    expect(mockLoadAllocationContext).toHaveBeenCalledWith(
      'org-1',
      undefined,
      [],
    );
    const totals = new Map<string, number>();
    for (const item of result().items) {
      totals.set(item.groupKey, (totals.get(item.groupKey) ?? 0) + item.value);
    }
    expect(totals.get('unit:7')).toBe(1080);
    expect(totals.get('unit:8')).toBe(720);
    expect(result().refs['unit:7']).toEqual({ label: 'Trading' });
    expect(result().refs['unit:8']).toEqual({ label: 'Ops' });
  });

  it('does not load allocation context for string dimensions', async () => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
    const { context, status } = makeContext(query);
    await querySpendHandler(context);
    expect(status()).toBe(200);
    expect(mockLoadAllocationContext).not.toHaveBeenCalled();
  });
});

// The window sizes the request's work: at month granularity a 1970..9999
// range builds ~120k bucket keys, and a wild fiscalYear overflows Date.UTC
// into an Invalid Date that empties the result by accident. Bad windows must
// be refused at the schema, not absorbed.
describe('querySpendHandler — window bounds', () => {
  beforeEach(() => {
    mockGetEnrichedContracts.mockReset();
    mockSegmentStore.clear();
    noSeats();
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
  });

  it.each([
    ['a fiscal year in range', { fiscalYear: 2026 }],
    ['the fiscal year floor', { fiscalYear: 1900 }],
    ['the fiscal year ceiling', { fiscalYear: 2200 }],
    ['a 100-year span', { from: '1970-01-01', to: '2070-01-01' }],
  ])('accepts %s', async (_label, window) => {
    const { context, status } = makeContext({ ...query, window });
    await querySpendHandler(context);
    expect(status()).toBe(200);
  });

  it.each([
    ['a fiscal year below the floor', { fiscalYear: 1899 }],
    ['a fiscal year above the ceiling', { fiscalYear: 2201 }],
    ['an inverted range', { from: '2027-01-01', to: '2026-01-01' }],
    ['an empty range', { from: '2026-01-01', to: '2026-01-01' }],
    ['a span over 100 years', { from: '0001-01-01', to: '9999-12-31' }],
    // One day past the limit: the year-prefix arithmetic this replaced read
    // Jan 1970..Jan 2070 and Jan 1970..Dec 2070 as the same 100-year span.
    ['a span one day over 100 years', { from: '1970-01-01', to: '2070-01-02' }],
  ])('rejects %s with a 400', async (_label, window) => {
    const { context, result, status } = makeContext({ ...query, window });
    await querySpendHandler(context);
    expect(status()).toBe(400);
    expect(result().error).toBe('Invalid spend query');
  });
});

// The derivation cache is org-namespaced; a request with no organization id
// must be refused, or every such request would share one `org:undefined:`
// cache namespace across tenants.
describe('querySpendHandler — organization context', () => {
  it('refuses a request whose metadata carries no organization id', async () => {
    const { context, result, status } = makeContext(query, {
      organizationFY: 1,
    });
    await querySpendHandler(context);
    expect(status()).toBe(400);
    expect(result().error).toBe('Missing organization context');
  });
});

// runSpendQuery's scope: the vendor surfaces narrow the population to one
// vendor, and Bloomberg terminal seats ride in as a second population the
// engine resolves separately and merges bucket by bucket.
describe('runSpendQuery — scope (psk-1941)', () => {
  const userMetadata = {
    organizationId: 'org-1',
    organizationFY: 1,
    baseCurrency: 'USD',
  } as unknown as UserMetadata;

  const sidVendor = { id: 9, name: 'Bloomberg', domain: 'bloomberg.com' };

  const spendQuery = {
    kind: 'spend',
    basis: 'amortized',
    window: { from: '2026-01-01', to: '2027-01-01' },
    granularity: 'year',
  } as const;

  function vendorContract(id: number, vendorId: number, fees: number) {
    const base = makeEnrichedContract();
    return {
      id,
      vendor_id: vendorId,
      contract: {
        ...base.contract,
        id,
        vendor_id: vendorId,
        vendor_products_details: [
          {
            product_id: id,
            year: 1,
            fees,
            vendor_products: { id, name: `Product ${id}` },
          },
        ],
        vendors: { name: `Vendor ${vendorId}`, domain: `v${vendorId}.example` },
      },
      products: [{ product_id: id, name: `Product ${id}` }],
    };
  }

  const onlyContract = (id: number, vendorId: number, fees: number) => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [vendorContract(id, vendorId, fees)],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
  };

  const noContracts = () => {
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
  };

  const emptyAllocationContext = () =>
    buildAllocationContext({
      allocations: [],
      lines: [],
      units: [],
      employees: [],
      seats: [],
      relationships: [],
    });

  // 'D' is Bloomberg's currency code for USD, so no rate ever applies.
  const account: SidAccount = {
    custNum: 500,
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
    custNum: account.custNum,
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

  const seatsOf = (...subscriptions: SidSubscription[]): SidSeat[] =>
    buildSidSeats(sidVendor.id, [
      {
        reportMonth: '2026-01-01',
        accounts: [account],
        subscriptions,
        fees: [],
        feeLines: [],
      },
    ]);

  const populationOf = (
    seats: SidSeat[],
    extra: Partial<SidSpendPopulation> = {},
  ): SidSpendPopulation => ({
    contracts: sidSpendContracts(seats),
    seats: seats.map((seat) => ({ seat, vendorName: sidVendor.name })),
    resolveSegments: sidSegmentResolver(seats),
    employeesById: new Map(),
    vendorIds: new Set(seats.map((seat) => seat.vendorId)),
    refs: sidSpendRefs(seats, sidVendor),
    ...extra,
  });

  beforeEach(() => {
    mockGetEnrichedContracts.mockReset();
    mockLoadAllocationContext.mockReset();
    mockLoadSidSpendPopulation.mockReset();
    mockSegmentStore.clear();
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [vendorContract(1, 1, 1200), vendorContract(2, 2, 900)],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
  });

  it("keeps only the scoped vendor's contracts", async () => {
    const response = await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: 'vendor' },
      { vendorId: 2 },
    );

    const totals = productTotals(response.items);
    expect([...totals.keys()]).toEqual(['2']);
    expect(totals.get('2')).toBe(900);
  });

  it('adds seat spend to the contract total', async () => {
    onlyContract(1, 1, 1200);

    const response = await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: 'total' },
      {
        bloombergSid: populationOf(seatsOf(subscription(11, 'Bo Zhang', 100))),
      },
    );

    // The seat runs 100 a month from its contract date, so the window's
    // twelve months are 1200 beside the contract's own 1200.
    expect(productTotals(response.items).get('total')).toBe(2400);
  });

  it("books seat spend under the seats' vendor, labelled from the population's refs", async () => {
    onlyContract(1, 1, 1200);

    const response = await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: 'vendor' },
      {
        bloombergSid: populationOf(seatsOf(subscription(11, 'Bo Zhang', 100))),
      },
    );

    const totals = productTotals(response.items);
    expect(totals.get('1')).toBe(1200);
    expect(totals.get(String(sidVendor.id))).toBe(1200);
    expect(response.refs[String(sidVendor.id)]).toEqual({
      label: 'Bloomberg',
      vendorDomain: 'bloomberg.com',
    });
    expect(response.refs['1']).toEqual({
      label: 'Vendor 1',
      vendorDomain: 'v1.example',
    });
  });

  it("leaves out a SID-covered vendor's invoices, and only theirs", async () => {
    const invoice = (id: number, vendorId: number, fees: number) => {
      const record = vendorContract(id, vendorId, fees);
      return { ...record, contract: { ...record.contract, type_id: 6 } };
    };
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [invoice(1, sidVendor.id, 600), invoice(2, 2, 900)],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
    const query = { ...spendQuery, groupBy: 'vendor' } as const;

    const withoutSeats = await runSpendQuery(userMetadata, query);
    expect(productTotals(withoutSeats.items).get(String(sidVendor.id))).toBe(
      600,
    );

    const withSeats = await runSpendQuery(userMetadata, query, {
      bloombergSid: populationOf(seatsOf(subscription(11, 'Bo Zhang', 100))),
    });
    const totals = productTotals(withSeats.items);
    expect(totals.get(String(sidVendor.id))).toBe(1200);
    expect(totals.get('2')).toBe(900);
  });

  it('projects seat renewals in the current window as well as a future one', async () => {
    noContracts();
    const renewingNow = {
      ...subscription(11, 'Bo Zhang', 100),
      contractDate: '2026-01-01',
      renewalDate: '2026-07-01',
    };
    const renewingLater = {
      ...subscription(12, 'Ada Lovelace', 100),
      contractDate: '2028-06-01',
      renewalDate: '2030-06-01',
    };
    const population = populationOf(seatsOf(renewingNow, renewingLater));

    // The seat renewing in July books six contracted months, then six at
    // the estimated renewed rate of 106.5 — current spend assumes it renews.
    const current = await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: 'total' },
      { bloombergSid: population },
    );
    expect(productTotals(current.items).get('total')).toBe(1239);

    // Likewise in a future year: five contracted months, then seven renewed.
    const projected = await runSpendQuery(
      userMetadata,
      {
        ...spendQuery,
        window: { from: '2030-01-01', to: '2031-01-01' },
        groupBy: 'total',
      },
      { bloombergSid: population },
    );
    expect(productTotals(projected.items).get('total')).toBe(1245.5);
  });

  it('splits seats to the employee each one matched, and leaves the rest unassigned', async () => {
    noContracts();
    mockLoadAllocationContext.mockResolvedValue(emptyAllocationContext());
    const employee: AllocationEmployee = {
      id: 7,
      name: 'Bo Zhang',
      org_unit_id: null,
      cost_center_unit_id: null,
      active: true,
    };
    const seats = seatsOf(
      subscription(11, employee.name, 100),
      subscription(12, 'Shared Desk', 50),
    );

    const response = await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: { kind: 'allocation', level: 'user' } },
      {
        bloombergSid: populationOf(seats, {
          allocations: sidAllocations(seats, (lastUser) =>
            lastUser === employee.name ? employee : undefined,
          ),
          employeesById: new Map([[employee.id, employee]]),
        }),
      },
    );

    const totals = productTotals(response.items);
    expect(totals.get('user:7')).toBe(1200);
    expect(totals.get('unassigned')).toBe(600);
    // The allocation context knows no employees: the label can only come
    // from the population.
    expect(response.refs['user:7']).toEqual({ label: 'Bo Zhang' });
  });

  it('rolls every seat account into one Bloomberg key for contract grouping', async () => {
    onlyContract(1, 1, 1200);
    const secondAccount = {
      ...subscription(12, 'Ada Lovelace', 100),
      custNum: 501,
    };
    const population = populationOf(
      seatsOf(subscription(11, 'Bo Zhang', 100), secondAccount),
    );

    const response = await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: 'contract' },
      { bloombergSid: population },
    );

    const totals = productTotals(response.items);
    expect([...totals.keys()].sort()).toEqual(['1', 'bloomberg:9']);
    expect(totals.get('1')).toBe(1200);
    expect(totals.get('bloomberg:9')).toBe(2400);
    expect(response.refs['bloomberg:9']).toEqual({
      label: 'Bloomberg',
      vendorDomain: 'bloomberg.com',
      productName: 'Terminals and exchange entitlements',
      vendorId: sidVendor.id,
    });
    expect(response.refs['-500']).toBeUndefined();
  });

  it('keeps per-account keys for the product grouping the vendors list reads', async () => {
    noContracts();
    const response = await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: 'product' },
      {
        bloombergSid: populationOf(seatsOf(subscription(11, 'Bo Zhang', 100))),
      },
    );

    expect(
      response.items.every((item) => item.groupKey.startsWith('-500:')),
    ).toBe(true);
  });

  it("runs seats only, without enriching the org's contracts", async () => {
    const response = await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: 'contract' },
      {
        bloombergSid: populationOf(seatsOf(subscription(11, 'Bo Zhang', 100))),
        population: 'seats',
      },
    );

    expect(mockGetEnrichedContracts).not.toHaveBeenCalled();
    const totals = productTotals(response.items);
    expect([...totals.keys()]).toEqual(['bloomberg:9']);
    expect(totals.get('bloomberg:9')).toBe(1200);
  });

  it('refuses a seats-only query that brings no seats population', async () => {
    await expect(
      runSpendQuery(
        userMetadata,
        { ...spendQuery, groupBy: 'contract' },
        { population: 'seats' },
      ),
    ).rejects.toThrow(
      'A seats-only spend query needs the Bloomberg population',
    );
    expect(mockGetEnrichedContracts).not.toHaveBeenCalled();
  });

  it('serves the HTTP route with seats on the flow bases and contracts only on Contract Term', async () => {
    onlyContract(1, 1, 1200);
    mockLoadSidSpendPopulation.mockResolvedValue(
      populationOf(seatsOf(subscription(11, 'Bo Zhang', 100))),
    );

    const flow = makeContext({ ...spendQuery, groupBy: 'total' }, userMetadata);
    await querySpendHandler(flow.context);
    expect(mockLoadSidSpendPopulation).toHaveBeenCalledTimes(1);
    expect(productTotals(flow.result().items).get('total')).toBe(2400);

    const commitments = makeContext(
      {
        kind: 'commitments',
        valuation: 'annual',
        recognition: 'term-start',
        window: spendQuery.window,
        granularity: 'year',
        groupBy: 'total',
      },
      userMetadata,
    );
    await querySpendHandler(commitments.context);
    expect(mockLoadSidSpendPopulation).toHaveBeenCalledTimes(1);
    expect(productTotals(commitments.result().items).get('total')).toBe(1200);
  });

  it('never reloads a population the caller preloaded', async () => {
    onlyContract(1, 1, 1200);

    await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: 'total' },
      {
        bloombergSid: populationOf(seatsOf(subscription(11, 'Bo Zhang', 100))),
      },
    );

    expect(mockLoadSidSpendPopulation).not.toHaveBeenCalled();
  });

  it('loads the population itself for bloombergSid: true, matching employees only for the allocation dimension', async () => {
    onlyContract(1, 1, 1200);
    mockLoadSidSpendPopulation.mockResolvedValue(populationOf([]));
    mockLoadAllocationContext.mockResolvedValue(emptyAllocationContext());

    await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: 'total' },
      { bloombergSid: true },
    );
    // The window decides which imported reports the population reads, so the
    // resolved window travels with the request.
    expect(mockLoadSidSpendPopulation).toHaveBeenCalledWith('org-1', {
      window: expect.objectContaining({
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2027-01-01T00:00:00.000Z'),
      }),
      vendorId: undefined,
      matchEmployees: false,
    });

    await runSpendQuery(
      userMetadata,
      { ...spendQuery, groupBy: { kind: 'allocation', level: 'user' } },
      { vendorId: 2, bloombergSid: true },
    );
    expect(mockLoadSidSpendPopulation).toHaveBeenLastCalledWith('org-1', {
      window: expect.objectContaining({
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: new Date('2027-01-01T00:00:00.000Z'),
      }),
      vendorId: 2,
      matchEmployees: true,
    });
  });
});

/**
 * The daily FX prefetch is the one unbounded read in a spend query: reaching
 * back to the earliest term start costs a row per currency per day since then,
 * and a Bloomberg seat's contract date is dated 2000.
 */
describe('runSpendQuery — daily FX prefetch range', () => {
  const userMetadata = {
    organizationId: 'org-1',
    organizationFY: 1,
    baseCurrency: 'EUR',
  } as unknown as UserMetadata;

  const shared = {
    window: { from: '2026-01-01', to: '2027-01-01' },
    granularity: 'year',
    groupBy: 'total',
  } as const;

  beforeEach(() => {
    mockSegmentStore.clear();
    mockGetDailyUsdRates.mockResolvedValue(new Map());
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1, EUR: 0.9 });
    const base = makeEnrichedContract();
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [
        {
          ...base,
          contract: {
            ...base.contract,
            term_start_date: [{ date: '2000-01-01' }],
          },
        },
      ],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
  });

  const dailyFetchFrom = async (input: SpendQueryInput) => {
    mockGetDailyUsdRates.mockClear();
    await runSpendQuery(userMetadata, input);
    return mockGetDailyUsdRates.mock.calls[0][1];
  };

  it('fetches the window only for the flow bases', async () => {
    expect(
      await dailyFetchFrom({ ...shared, kind: 'spend', basis: 'amortized' }),
    ).toBe('2026-01-01');
    expect(
      await dailyFetchFrom({ ...shared, kind: 'spend', basis: 'actual' }),
    ).toBe('2026-01-01');
  });

  it('reaches back to the earliest term start wherever values convert at it', async () => {
    expect(
      await dailyFetchFrom({ ...shared, kind: 'spend', basis: 'committed' }),
    ).toBe('2000-01-01');
    expect(await dailyFetchFrom({ ...shared, kind: 'renewals' })).toBe(
      '2000-01-01',
    );
    expect(await dailyFetchFrom({ ...shared, kind: 'tcv' })).toBe('2000-01-01');
    expect(await dailyFetchFrom({ ...shared, kind: 'commitments' })).toBe(
      '2000-01-01',
    );
  });
});

describe('runSpendQuery — enrichment cache key', () => {
  const userMetadata = {
    organizationId: 'org-1',
    organizationFY: 1,
    baseCurrency: 'USD',
  } as unknown as UserMetadata;

  beforeEach(() => {
    mockSegmentStore.clear();
    noSeats();
    mockGetDailyUsdRates.mockResolvedValue(new Map());
    mockGetLatestUsdRates.mockResolvedValue({ USD: 1 });
    mockGetEnrichedContracts.mockReset();
    mockGetEnrichedContracts.mockResolvedValue({
      contracts: [makeEnrichedContract()],
      relationships: [],
      fiscalYearStartMonth: 1,
      cutoffsByContract: new Map(),
    });
  });

  // React's cache() keys on the argument count as well as the values, so the
  // engine has to ask for the enriched set with exactly the arguments
  // getContractsList passes — anything shorter is a second enrichment in the
  // same render.
  it('asks for the enriched set with the five arguments the list passes', async () => {
    await runSpendQuery(userMetadata, {
      kind: 'spend',
      basis: 'amortized',
      window: 'currentFY',
      granularity: 'year',
      groupBy: 'total',
    });

    expect(mockGetEnrichedContracts).toHaveBeenCalledTimes(1);
    expect(mockGetEnrichedContracts).toHaveBeenCalledWith(
      'active',
      false,
      false,
      0,
      false,
    );
  });

  it('pulls archived rows in, still with five arguments, for a past fiscal year', async () => {
    await runSpendQuery(userMetadata, {
      kind: 'spend',
      basis: 'amortized',
      window: { fiscalYear: 2020 },
      granularity: 'year',
      groupBy: 'total',
    });

    expect(mockGetEnrichedContracts).toHaveBeenCalledWith(
      'active',
      false,
      true,
      0,
      false,
    );
  });
});
