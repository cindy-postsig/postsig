import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

type ClientKind = 'cookie' | 'service';

interface RecordedQuery {
  client: ClientKind;
  table: string;
  filters: unknown[][];
}

let mockMetadata: { organizationId: string } | null = null;
let mockInMcpRequest = false;
const mockQueries: RecordedQuery[] = [];

// One custom definition, so getCompanyCustomKpis goes on to read its values.
const mockRows: Record<string, unknown[]> = {
  inv_kpi: [
    {
      id: 7,
      public_id: 'kpi-7',
      organization_id: 'org-1',
      code: null,
      label: 'Pipeline Coverage',
      category: 'Sales',
      value_type: 'number',
      unit: null,
      description: null,
      placeholder: null,
      sort_order: 1,
      is_flow: false,
    },
  ],
};

function mockClient(client: ClientKind) {
  return {
    from: (table: string) => {
      const query: RecordedQuery = { client, table, filters: [] };
      mockQueries.push(query);
      const builder: Record<string, unknown> = {};
      const recordFilter =
        (name: string) =>
        (...args: unknown[]) => {
          query.filters.push([name, ...args]);
          return builder;
        };
      Object.assign(builder, {
        select: () => builder,
        order: () => builder,
        eq: recordFilter('eq'),
        in: recordFilter('in'),
        not: recordFilter('not'),
        or: recordFilter('or'),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: mockRows[table] ?? [], error: null }),
      });
      return builder;
    },
  };
}

jest.mock('@/data/users', () => ({
  getUserMetadata: () => Promise.resolve(mockMetadata),
}));
jest.mock('@/app/lib/mcp/context', () => ({
  getMcpContext: () => (mockInMcpRequest ? {} : undefined),
}));
jest.mock('@/utils/supabase/server', () => ({
  createClient: () => mockClient('cookie'),
}));
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockClient('service'),
}));

import {
  getCompanyCustomKpis,
  getCompanyReporting,
  getCompanyStandardKpiOverrides,
  getKpis,
} from '@/lib/v2/kpis/service';

async function readCompanyKpis() {
  await getKpis();
  await getCompanyReporting(3);
  await getCompanyCustomKpis(3);
  await getCompanyStandardKpiOverrides(3);
}

const scopedToOrg = (query: RecordedQuery) =>
  query.filters.some(
    ([name, column, value]) =>
      (name === 'eq' && column === 'organization_id' && value === 'org-1') ||
      (name === 'or' &&
        column === 'organization_id.is.null,organization_id.eq.org-1'),
  );

beforeEach(() => {
  mockQueries.length = 0;
  mockMetadata = { organizationId: 'org-1' };
  mockInMcpRequest = false;
});

describe('company KPI reads', () => {
  it('use the service client in an MCP request and filter every query to the caller org', async () => {
    mockInMcpRequest = true;

    await readCompanyKpis();

    expect(new Set(mockQueries.map((q) => q.table))).toEqual(
      new Set([
        'inv_kpi',
        'org_preferences',
        'inv_reporting_submission',
        'inv_kpi_value',
      ]),
    );
    expect(mockQueries.filter((q) => q.client !== 'service')).toEqual([]);
    expect(mockQueries.filter((q) => !scopedToOrg(q))).toEqual([]);
  });

  it('keep the cookie client on the web, where RLS applies', async () => {
    await readCompanyKpis();

    expect(mockQueries.length).toBeGreaterThan(0);
    expect(mockQueries.filter((q) => q.client !== 'cookie')).toEqual([]);
  });

  it('return nothing, without querying, when there is no signed-in org', async () => {
    mockInMcpRequest = true;
    mockMetadata = null;

    await expect(getKpis()).resolves.toEqual([]);
    await expect(getCompanyReporting(3)).resolves.toEqual([]);
    await expect(getCompanyCustomKpis(3)).resolves.toEqual([]);
    await expect(getCompanyStandardKpiOverrides(3)).resolves.toEqual([]);
    expect(mockQueries).toEqual([]);
  });
});
