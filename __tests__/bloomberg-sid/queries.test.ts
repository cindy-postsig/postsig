jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

interface RecordedQuery {
  table: string;
  filters: Array<{ op: string; column: string; value: unknown }>;
}

let queries: RecordedQuery[] = [];
let rowsByTable: Record<string, Array<Record<string, unknown>>> = {};

/**
 * Chainable PostgREST stub. The builder is thenable, so awaiting the chain
 * resolves with the table's canned rows however many filters were applied.
 */
function makeBuilder(table: string) {
  const query: RecordedQuery = { table, filters: [] };
  queries.push(query);
  const record = (op: string, column: string, value: unknown) => {
    query.filters.push({ op, column, value });
    return builder;
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => record('eq', column, value),
    in: (column: string, value: unknown) => record('in', column, value),
    order: () => builder,
    range: () => builder,
    limit: () => builder,
    then: (fn: (v: unknown) => unknown) =>
      fn({ data: rowsByTable[table] ?? [], error: null }),
  };
  return builder;
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

// In-memory stand-in for Redis, so tests can prove what the seat-sources
// cache is keyed on and when it is read.
const redisStore = new Map<string, unknown>();
let redisGet = async (key: string) => redisStore.get(key) ?? null;
jest.mock('@/app/lib/redis/cache-service', () => ({
  getCacheService: async () => ({
    redisService: {
      get: (key: string) => redisGet(key),
      set: async (key: string, value: unknown) => {
        redisStore.set(key, value);
        return true;
      },
    },
  }),
}));

import { fetchSidSeatSources } from '@/lib/v2/bloomberg-sid/queries';

const ORG = 'org-1';
const FIRMWIDE_ID = 4242;

const FEBRUARY = { id: 1, report_month: '2026-02-01' };
const MARCH = { id: 2, report_month: '2026-03-01' };
const APRIL = { id: 3, report_month: '2026-04-01' };

const filtersOn = (table: string) =>
  queries.filter((query) => query.table === table).flatMap((q) => q.filters);

const reportIdsRead = (table: string): number[] =>
  (filtersOn(table).find((filter) => filter.column === 'report_id')?.value ??
    []) as number[];

beforeEach(() => {
  queries = [];
  redisStore.clear();
  redisGet = async (key: string) => redisStore.get(key) ?? null;
  rowsByTable = {
    bloomberg_sid_reports: [FEBRUARY, MARCH, APRIL].map((month) => ({
      ...month,
      billing_date: '2026-05-01',
    })),
    bloomberg_sid_accounts: [],
    bloomberg_sid_subscriptions: [],
    bloomberg_sid_exchange_fees: [],
    bloomberg_sid_exchange_fee_lines: [],
  };
});

describe('fetchSidSeatSources', () => {
  it('reads every report inside the window', async () => {
    await fetchSidSeatSources(ORG, FIRMWIDE_ID, {
      start: '2026-01-01',
      end: '2027-01-01',
    });

    expect(reportIdsRead('bloomberg_sid_subscriptions')).toEqual([1, 2, 3]);
  });

  it('adds the nearest report on each side of the window', async () => {
    await fetchSidSeatSources(ORG, FIRMWIDE_ID, {
      start: '2026-03-01',
      end: '2026-04-01',
    });

    expect(reportIdsRead('bloomberg_sid_subscriptions')).toEqual([1, 2, 3]);
  });

  it('reads only the earliest report after a window that ends before the imports', async () => {
    await fetchSidSeatSources(ORG, FIRMWIDE_ID, {
      start: '2025-01-01',
      end: '2025-06-01',
    });

    expect(reportIdsRead('bloomberg_sid_subscriptions')).toEqual([1]);
  });

  it('reads only the latest report before a window that starts after the imports', async () => {
    await fetchSidSeatSources(ORG, FIRMWIDE_ID, {
      start: '2027-01-01',
      end: '2028-01-01',
    });

    expect(reportIdsRead('bloomberg_sid_subscriptions')).toEqual([3]);
  });

  it('returns one source per selected month, ascending, with that report rows', async () => {
    rowsByTable.bloomberg_sid_subscriptions = [
      { ...subscriptionRow(1, 10), report_id: 1 },
      { ...subscriptionRow(2, 11), report_id: 3 },
    ];
    rowsByTable.bloomberg_sid_exchange_fees = [feeRow(7, 1), feeRow(8, 3)];
    rowsByTable.bloomberg_sid_exchange_fee_lines = [
      feeLineRow(7, 1, 52),
      feeLineRow(8, 3, 51.1),
    ];

    const sources = await fetchSidSeatSources(ORG, FIRMWIDE_ID, {
      start: '2026-01-01',
      end: '2027-01-01',
    });

    expect(sources.map((source) => source.reportMonth)).toEqual([
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ]);
    expect(sources.map((source) => source.subscriptions.length)).toEqual([
      1, 0, 1,
    ]);
    expect(
      sources.map((source) => source.feeLines.map((l) => l.proRate)),
    ).toEqual([[52], [], [51.1]]);
  });

  it("selects fee lines through their fee's report, never by fee id", async () => {
    rowsByTable.bloomberg_sid_exchange_fees = [feeRow(7, 1)];

    await fetchSidSeatSources(ORG, FIRMWIDE_ID, {
      start: '2026-01-01',
      end: '2027-01-01',
    });

    const feeLineFilters = filtersOn('bloomberg_sid_exchange_fee_lines');
    expect(feeLineFilters).toContainEqual({
      op: 'in',
      column: 'bloomberg_sid_exchange_fees.report_id',
      value: [1, 2, 3],
    });
    expect(feeLineFilters.some((f) => f.column === 'fee_id')).toBe(false);
  });

  it('serves the same reports from Redis, under the org prefix, on the next read', async () => {
    rowsByTable.bloomberg_sid_exchange_fee_lines = [feeLineRow(7, 1, 52)];
    const window = { start: '2026-01-01', end: '2027-01-01' };

    const first = await fetchSidSeatSources(ORG, FIRMWIDE_ID, window);
    queries = [];
    const second = await fetchSidSeatSources(ORG, FIRMWIDE_ID, window);

    expect(second).toEqual(first);
    expect(queries.map((query) => query.table)).toEqual([
      'bloomberg_sid_reports',
    ]);
    expect([...redisStore.keys()]).toEqual([
      'org:org-1:sid:sources:v1:4242:1,2,3',
    ]);
  });

  it('misses once an import changes the reports a window reads', async () => {
    const window = { start: '2026-01-01', end: '2027-01-01' };
    await fetchSidSeatSources(ORG, FIRMWIDE_ID, window);
    rowsByTable.bloomberg_sid_reports.push({
      id: 4,
      report_month: '2026-05-01',
      billing_date: '2026-06-01',
    });
    queries = [];

    await fetchSidSeatSources(ORG, FIRMWIDE_ID, window);

    expect(reportIdsRead('bloomberg_sid_subscriptions')).toEqual([1, 2, 3, 4]);
  });

  it('reads the database when Redis is unavailable', async () => {
    redisGet = async () => {
      throw new Error('ECONNREFUSED');
    };
    rowsByTable.bloomberg_sid_exchange_fees = [feeRow(7, 1)];

    const sources = await fetchSidSeatSources(ORG, FIRMWIDE_ID, {
      start: '2026-01-01',
      end: '2027-01-01',
    });

    expect(sources.map((source) => source.fees.length)).toEqual([1, 0, 0]);
  });

  it('returns nothing for a firmwide account with no imported report', async () => {
    rowsByTable.bloomberg_sid_reports = [];

    expect(
      await fetchSidSeatSources(ORG, FIRMWIDE_ID, {
        start: '2026-01-01',
        end: '2027-01-01',
      }),
    ).toEqual([]);
    expect(queries.map((query) => query.table)).toEqual([
      'bloomberg_sid_reports',
    ]);
  });

  // The service client bypasses RLS, so the tenant filter is the only thing
  // keeping one org's imports out of another's.
  it('filters every read on the organization', async () => {
    rowsByTable.bloomberg_sid_exchange_fees = [feeRow(7, 1)];

    await fetchSidSeatSources(ORG, FIRMWIDE_ID, {
      start: '2026-01-01',
      end: '2027-01-01',
    });

    expect(queries.length).toBeGreaterThan(1);
    for (const query of queries) {
      expect(query.filters).toContainEqual({
        op: 'eq',
        column: 'organization_id',
        value: ORG,
      });
    }
  });
});

function subscriptionRow(reportId: number, sid: number) {
  return {
    report_id: reportId,
    cust_num: 500,
    sid,
    sid_inst_num: 1,
    contract_date: '2000-04-07',
    renewal_date: '2026-04-07',
    last_user: 'A User',
    sid_type: 1,
    sid_description: 'Terminal',
    gptt: 28,
    gptt_description: 'Bloomberg Anywhere',
    serial_number: 'sn',
    ws: null,
    ninety_day: false,
    special: null,
    price: 2215,
    po_number: null,
  };
}

function feeRow(id: number, reportId: number) {
  return {
    report_id: reportId,
    id,
    cust_num: 500,
    rpt_month: '2026-02-01',
    fee_kind: 'exchange',
    exchange_code: 'CBOE',
    exchange_name: 'Cboe Europe',
    subscriptions: 1,
    currency_code: 'D',
    total_price: 52,
    contributor_bills: false,
  };
}

function feeLineRow(feeId: number, reportId: number, proRate: number) {
  return {
    fee_id: feeId,
    sid: 10,
    sid_inst_num: 1,
    pro_rate: proRate,
    contributor_bills: false,
    eid_number: 1,
    bloomberg_sid_exchange_fees: { report_id: reportId },
  };
}
