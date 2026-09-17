import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// A real per-request cache: the tools must share one report load across a turn.
const cacheStore = new Map<string, unknown>();
const getOrFetch = jest.fn(
  async (key: string, fetcher: () => Promise<unknown>) => {
    if (cacheStore.has(key)) return cacheStore.get(key);
    const value = await fetcher();
    cacheStore.set(key, value);
    return value;
  },
);
jest.mock('@/app/lib/mcp/context', () => ({
  __esModule: true,
  requireMcpContext: () => ({
    userMetadata: { organizationId: 'org-1', baseCurrency: 'EUR' },
    tokenId: 'token-1',
    cache: { getOrFetch },
  }),
}));

const fetchFirmwideAccounts =
  jest.fn<
    (
      organizationId: string,
      options?: { vendorId?: number },
    ) => Promise<FirmwideAccount[]>
  >();
const fetchSidReport =
  jest.fn<
    (
      organizationId: string,
      account: FirmwideAccount,
      month: string | null,
    ) => Promise<SidReport | null>
  >();
jest.mock('@/lib/v2/bloomberg-sid/queries', () => ({
  __esModule: true,
  fetchFirmwideAccounts: (
    organizationId: string,
    options?: { vendorId?: number },
  ) => fetchFirmwideAccounts(organizationId, options),
  fetchSidReport: (
    organizationId: string,
    account: FirmwideAccount,
    month: string | null,
  ) => fetchSidReport(organizationId, account, month),
}));

import { bloombergTools } from '@/app/lib/mcp/tools/cpm/bloomberg';
import type { FirmwideAccount } from '@/lib/v2/bloomberg-sid/queries';
import type {
  SidAccount,
  SidExchangeFee,
  SidExchangeFeeLine,
  SidHrMatch,
  SidReport,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';

const TODAY = new Date('2026-09-15T12:00:00.000Z');

const ACCOUNTS: SidAccount[] = [
  {
    custNum: 100,
    name: 'Alpha Ltd',
    city: 'London',
    state: 'ENG',
    country: 'GB',
    currencyCode: 'D',
    taxRate: 20,
    auto: 2,
    term: 2,
  },
  {
    custNum: 200,
    name: 'Beta AG',
    city: 'Zurich',
    state: null,
    country: 'CH',
    currencyCode: 'D',
    taxRate: 8.1,
    auto: 2,
    term: 2,
  },
];

const ANYWHERE = { gptt: 28, description: 'Bloomberg Anywhere' };
const PROFESSIONAL = { gptt: 30, description: 'Bloomberg Professional' };

function subscription(fields: {
  custNum: number;
  sid: number;
  lastUser: string;
  price: number;
  product: { gptt: number; description: string };
  renewalDate: string;
  ninetyDay?: boolean;
}): SidSubscription {
  return {
    custNum: fields.custNum,
    sid: fields.sid,
    sidInstNum: 1,
    contractDate: '2020-03-02',
    renewalDate: fields.renewalDate,
    lastUser: fields.lastUser,
    sidType: 1,
    sidDescription: 'Subscription',
    gptt: fields.product.gptt,
    gpttDescription: fields.product.description,
    serialNumber: `SN-${fields.sid}`,
    ws: null,
    ninetyDay: fields.ninetyDay ?? false,
    special: null,
    price: fields.price,
    poNumber: null,
  };
}

const SUBSCRIPTIONS: SidSubscription[] = [
  subscription({
    custNum: 100,
    sid: 1001,
    lastUser: 'Ada Lovelace',
    price: 2000,
    product: ANYWHERE,
    renewalDate: '2026-10-20',
  }),
  subscription({
    custNum: 100,
    sid: 1002,
    lastUser: 'Bob Gone',
    price: 2500,
    product: ANYWHERE,
    renewalDate: '2026-11-30',
  }),
  subscription({
    custNum: 100,
    sid: 1003,
    lastUser: 'Cara Away',
    price: 1500,
    product: PROFESSIONAL,
    renewalDate: '2027-06-01',
  }),
  subscription({
    custNum: 200,
    sid: 1004,
    lastUser: 'Nobody Known',
    price: 1000,
    product: ANYWHERE,
    // Already past: the two-year term steps it to 2026-10-05.
    renewalDate: '2024-10-05',
  }),
  subscription({
    custNum: 200,
    sid: 1005,
    lastUser: 'Dan Dormant',
    price: 3000,
    product: PROFESSIONAL,
    renewalDate: '2028-01-15',
    ninetyDay: true,
  }),
];

const FEES: SidExchangeFee[] = [
  {
    id: 1,
    custNum: 100,
    rptMonth: '2026-08-01',
    feeKind: 'exchange',
    exchangeCode: 'NYSE',
    exchangeName: 'New York Stock Exchange',
    subscriptions: 2,
    currencyCode: 'D',
    totalPrice: 100,
    contributorBills: false,
  },
  {
    id: 2,
    custNum: 100,
    rptMonth: '2026-08-01',
    feeKind: 'exchange',
    exchangeCode: 'LSE',
    exchangeName: 'London Stock Exchange',
    subscriptions: 1,
    currencyCode: 'D',
    totalPrice: null,
    contributorBills: true,
  },
];

const FEE_LINES: SidExchangeFeeLine[] = [
  {
    feeId: 1,
    sid: 1001,
    sidInstNum: 1,
    proRate: 60,
    contributorBills: false,
    eidNumber: 900,
  },
  {
    feeId: 1,
    sid: 1002,
    sidInstNum: 1,
    proRate: 40,
    contributorBills: false,
    eidNumber: 900,
  },
  {
    feeId: 2,
    sid: 1003,
    sidInstNum: 1,
    proRate: null,
    contributorBills: true,
    eidNumber: 901,
  },
];

const match = (
  confidence: SidHrMatch['confidence'],
  employee: SidHrMatch['employee'],
): SidHrMatch => ({ confidence, employee });

const HR_MATCHES: Record<string, SidHrMatch> = {
  'Ada Lovelace': match('Exact name', {
    id: 1,
    fullName: 'Ada Lovelace',
    department: 'Research',
    costCenter: 'CC-1',
    status: 'active',
    unitPath: { entity: 'Alpha', department: 'Research' },
  }),
  'Bob Gone': match('Exact name', {
    id: 2,
    fullName: 'Bob Gone',
    department: 'Trading',
    costCenter: 'CC-2',
    status: 'departed',
    unitPath: { entity: 'Alpha', department: 'Trading' },
  }),
  'Cara Away': match('Exact name', {
    id: 3,
    fullName: 'Cara Away',
    department: 'Trading',
    costCenter: 'CC-2',
    status: 'on_leave',
    unitPath: { entity: 'Alpha', department: 'Trading' },
  }),
  'Nobody Known': match('Missing HR match', null),
  'Dan Dormant': match('Exact name', {
    id: 5,
    fullName: 'Dan Dormant',
    department: 'Research',
    costCenter: 'CC-1',
    status: 'active',
    unitPath: { entity: 'Beta', department: 'Research' },
  }),
};

const MONTHS = [
  { reportId: 9, reportMonth: '2026-07-01', billingDate: '2026-08-01' },
  { reportId: 10, reportMonth: '2026-08-01', billingDate: '2026-09-01' },
];

const REPORT: SidReport = {
  firmwideId: 4242,
  vendorId: 469,
  months: MONTHS,
  selected: MONTHS[1],
  accounts: ACCOUNTS,
  subscriptions: SUBSCRIPTIONS,
  fees: FEES,
  feeLines: FEE_LINES,
  previousSidKeys: null,
  hrMatches: HR_MATCHES,
  files: [],
};

const ACCOUNT = {
  id: 1,
  firmwideId: 4242,
  vendorId: 469,
  vendor: { name: 'Bloomberg', domain: 'bloomberg.com' },
};

interface TerminalRow {
  sid: number;
  sidInstNum: number;
  uuid: string;
  account: { custNum: number; name: string; country: string | null };
  product: { code: number; name: string };
  lastUser: string;
  hr: {
    matched: boolean;
    confidence: string;
    employeeId: number | null;
    fullName: string | null;
    status: string | null;
    department: string | null;
    costCenter: string | null;
    unitPath: Record<string, string> | null;
  } | null;
  status: string;
  inactiveReasons: Array<{ code: string; label: string }>;
  inactiveLast90Days: boolean;
  contractDate: string;
  renewalDate: string;
  nextRenewalDate: string;
  cancelByDate: string;
  daysUntilCancelBy: number;
  monthlyPriceUSD: number;
  exchanges: Array<{
    code: string;
    name: string;
    monthlyCostUSD: number | null;
  }>;
  exchangeMonthlyCostUSD: number;
}

interface ListResult {
  found: boolean;
  reason?: string;
  vendor?: { id: number; name: string };
  firmwideId?: number;
  reportMonth?: string;
  availableMonths?: string[];
  dateGuidance?: string;
  totals?: {
    terminals: number;
    active: number;
    inactive: number;
    inactiveByReason: Record<string, number>;
    terminalMonthlyCostUSD: number;
    exchangeMonthlyCostUSD: number;
    maskedExchangeLines: number;
  };
  count?: number;
  totalMatched?: number;
  nextCursor?: string | null;
  terminals?: TerminalRow[];
}

interface SpendResult {
  found: boolean;
  totals?: {
    terminals: number;
    terminalProducts: number;
    entitledTerminals: number;
    terminalMonthlyCostUSD: number;
    exchangeMonthlyCostUSD: number;
    totalMonthlyCostUSD: number;
    maskedExchangeLines: number;
    maskedExchangeAggregates: number;
    inactive: { terminals: number; byReason: Record<string, number> };
    renewing: {
      withinDays: number;
      terminals: number;
      monthlyPriceUSD: number;
    };
  };
  groupBy?: string;
  groupByLabel?: string;
  rows?: Array<{
    key: string;
    terminals: number;
    users: number;
    terminalCostUSD: number;
    exchangeCostUSD: number;
    totalUSD: number;
  }>;
}

function toolNamed(name: string) {
  const tool = bloombergTools.find((t) => t.name === name);
  if (!tool) throw new Error(`${name} not registered`);
  return tool;
}

const listTool = toolNamed('list_bloomberg_terminals');
const spendTool = toolNamed('get_bloomberg_spend');

const listTerminals = (input: Record<string, unknown> = {}) =>
  listTool.handler(
    listTool.inputSchema.parse(input),
    {},
  ) as Promise<ListResult>;

const bloombergSpend = (input: Record<string, unknown> = {}) =>
  spendTool.handler(
    spendTool.inputSchema.parse(input),
    {},
  ) as Promise<SpendResult>;

const bySid = (result: ListResult, sid: number): TerminalRow => {
  const row = result.terminals?.find((t) => t.sid === sid);
  if (!row) throw new Error(`terminal ${sid} missing from result`);
  return row;
};

describe('Bloomberg MCP tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheStore.clear();
    jest.useFakeTimers().setSystemTime(TODAY);
    fetchFirmwideAccounts.mockResolvedValue([ACCOUNT]);
    fetchSidReport.mockResolvedValue(REPORT);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports no data when the organization has no firmwide account', async () => {
    fetchFirmwideAccounts.mockResolvedValue([]);

    const result = await listTerminals();

    expect(result.found).toBe(false);
    expect(result.reason).toBe(
      'No Bloomberg SID reports are loaded for this organization.',
    );
    expect(fetchSidReport).not.toHaveBeenCalled();
  });

  it('names the requested vendor when it has no firmwide account, rather than the whole organization', async () => {
    fetchFirmwideAccounts.mockResolvedValue([]);

    const result = await listTerminals({ vendor_id: 27 });

    expect(result.found).toBe(false);
    expect(result.reason).toContain('Vendor 27');
    expect(result.reason).not.toContain('No Bloomberg SID reports are loaded');
    expect(fetchFirmwideAccounts).toHaveBeenCalledWith('org-1', {
      vendorId: 27,
    });
  });

  it('names the requested month when that report is not imported', async () => {
    fetchSidReport.mockResolvedValue(null);

    const result = await listTerminals({ month: '2025-01' });

    expect(result.found).toBe(false);
    expect(result.reason).toContain('2025-01');
  });

  it('returns every seat of the latest report with its vendor and month', async () => {
    const result = await listTerminals();

    expect(result.found).toBe(true);
    expect(result.vendor).toEqual({ id: 469, name: 'Bloomberg' });
    expect(result.firmwideId).toBe(4242);
    expect(result.reportMonth).toBe('2026-08-01');
    expect(result.availableMonths).toEqual(['2026-07-01', '2026-08-01']);
    expect(result.dateGuidance).toContain('cancelByDate');
    expect(result.terminals?.map((t) => t.sid)).toEqual([
      1001, 1002, 1003, 1004, 1005,
    ]);
    expect(fetchSidReport).toHaveBeenCalledWith('org-1', ACCOUNT, null);
  });

  it('derives seat status from the roster and the 90-day flag', async () => {
    const result = await listTerminals();

    expect(bySid(result, 1001).status).toBe('active');
    expect(bySid(result, 1002).inactiveReasons).toEqual([
      { code: 'leaver', label: 'Leaver' },
    ]);
    expect(bySid(result, 1003).inactiveReasons).toEqual([
      { code: 'on_leave', label: 'On leave' },
    ]);
    expect(bySid(result, 1004).inactiveReasons).toEqual([
      { code: 'not_in_hr', label: 'Employee not found' },
    ]);
    expect(bySid(result, 1004).hr).toEqual({
      matched: false,
      confidence: 'Missing HR match',
      employeeId: null,
      fullName: null,
      status: null,
      department: null,
      costCenter: null,
      unitPath: null,
    });
    expect(bySid(result, 1005).inactiveReasons).toEqual([
      { code: 'dormant', label: 'No use in 90 days' },
    ]);
  });

  it('counts status over the filtered set', async () => {
    const active = await listTerminals({ status: 'active' });
    expect(active.totals?.terminals).toBe(1);
    expect(active.totals?.active).toBe(1);
    expect(active.terminals?.map((t) => t.sid)).toEqual([1001]);

    const inactive = await listTerminals({ status: 'inactive' });
    expect(inactive.totals?.terminals).toBe(4);
    expect(inactive.totals?.inactiveByReason).toEqual({
      leaver: 1,
      on_leave: 1,
      not_in_hr: 1,
      dormant: 1,
    });
  });

  it('lists seats renewing within a window, soonest first, with cancel-by dates', async () => {
    const result = await listTerminals({ renewing_within_days: 90 });

    expect(result.terminals?.map((t) => t.sid)).toEqual([1004, 1001, 1002]);
    // A renewal date already in the past steps forward by a whole two-year term.
    expect(bySid(result, 1004).nextRenewalDate).toBe('2026-10-05');
    expect(bySid(result, 1004).cancelByDate).toBe('2026-08-06');
    expect(bySid(result, 1004).daysUntilCancelBy).toBe(-40);
    expect(bySid(result, 1002).cancelByDate).toBe('2026-10-01');
    expect(bySid(result, 1002).daysUntilCancelBy).toBe(16);
  });

  it('filters by user, product, exchange and sid', async () => {
    expect((await listTerminals({ user: 'lovelace' })).totalMatched).toBe(1);
    expect((await listTerminals({ user: 'nobody' })).totalMatched).toBe(1);
    expect((await listTerminals({ product: 'anywhere' })).totalMatched).toBe(3);

    const nyse = await listTerminals({ exchange: 'new york' });
    expect(nyse.terminals?.map((t) => t.sid)).toEqual([1001, 1002]);
    expect((await listTerminals({ exchange: 'LSE' })).totalMatched).toBe(1);

    const single = await listTerminals({ sid: 1003 });
    expect(single.totalMatched).toBe(1);
    expect(single.terminals?.[0].exchanges).toEqual([
      { code: 'LSE', name: 'London Stock Exchange', monthlyCostUSD: null },
    ]);
  });

  it('totals monthly USD charges and masked lines over the filtered set', async () => {
    const result = await listTerminals();

    expect(result.totals).toEqual({
      terminals: 5,
      active: 1,
      inactive: 4,
      inactiveByReason: { leaver: 1, on_leave: 1, not_in_hr: 1, dormant: 1 },
      terminalMonthlyCostUSD: 10000,
      exchangeMonthlyCostUSD: 100,
      maskedExchangeLines: 1,
    });
    expect(bySid(result, 1001).exchangeMonthlyCostUSD).toBe(60);
  });

  it('pages the seat list while totals stay over the full match', async () => {
    const first = await listTerminals({ limit: 2 });

    expect(first.count).toBe(2);
    expect(first.totalMatched).toBe(5);
    expect(first.totals?.terminals).toBe(5);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await listTerminals({ limit: 2, cursor: first.nextCursor });
    expect(second.terminals?.map((t) => t.sid)).toEqual([1003, 1004]);
  });

  it('summarises the month and counts renewing seats', async () => {
    const result = await bloombergSpend();

    expect(result.totals).toEqual({
      terminals: 5,
      terminalProducts: 2,
      entitledTerminals: 3,
      terminalMonthlyCostUSD: 10000,
      exchangeMonthlyCostUSD: 100,
      totalMonthlyCostUSD: 10100,
      maskedExchangeLines: 1,
      maskedExchangeAggregates: 1,
      inactive: {
        terminals: 4,
        byReason: { leaver: 1, on_leave: 1, not_in_hr: 1, dormant: 1 },
      },
      renewing: { withinDays: 90, terminals: 3, monthlyPriceUSD: 5500 },
    });
    expect(result.rows).toBeUndefined();
  });

  it('rolls the month up by department', async () => {
    const result = await bloombergSpend({ group_by: 'department' });

    expect(result.groupByLabel).toBe('Department');
    expect(result.rows).toEqual([
      {
        key: 'Research',
        terminals: 2,
        users: 2,
        terminalCostUSD: 5000,
        exchangeCostUSD: 60,
        totalUSD: 5060,
      },
      {
        key: 'Trading',
        terminals: 2,
        users: 2,
        terminalCostUSD: 4000,
        exchangeCostUSD: 40,
        totalUSD: 4040,
      },
      {
        key: '—',
        terminals: 1,
        users: 1,
        terminalCostUSD: 1000,
        exchangeCostUSD: 0,
        totalUSD: 1000,
      },
    ]);
  });

  it('rolls the month up by product', async () => {
    const result = await bloombergSpend({ group_by: 'product' });

    expect(result.groupByLabel).toBe('Product');
    expect(result.rows?.map((row) => [row.key, row.terminals])).toEqual([
      ['Bloomberg Anywhere', 3],
      ['Bloomberg Professional', 2],
    ]);
  });

  it('rolls the month up by country', async () => {
    const result = await bloombergSpend({ group_by: 'country' });

    expect(result.groupByLabel).toBe('Country');
    expect(result.rows).toEqual([
      {
        key: 'GB',
        terminals: 3,
        users: 3,
        terminalCostUSD: 6000,
        exchangeCostUSD: 100,
        totalUSD: 6100,
      },
      {
        key: 'CH',
        terminals: 2,
        users: 2,
        terminalCostUSD: 4000,
        exchangeCostUSD: 0,
        totalUSD: 4000,
      },
    ]);
  });

  it('loads the report once when both tools run in one turn', async () => {
    await listTerminals();
    await bloombergSpend();

    expect(fetchSidReport).toHaveBeenCalledTimes(1);
    expect(fetchFirmwideAccounts).toHaveBeenCalledTimes(1);
  });
});
