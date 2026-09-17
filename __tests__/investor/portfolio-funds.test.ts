import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('react', () => ({
  ...(jest.requireActual('react') as object),
  cache: (fn: unknown) => fn,
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: () => Promise.resolve({ organizationId: 'org-1' }),
}));

jest.mock('@/app/lib/mcp/context', () => ({
  getMcpContext: () => null,
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({}),
}));

type Row = Record<string, unknown>;

const tableRows: Record<string, Row[]> = {
  inv_company: [],
  module_documents: [],
  v_inv_company_valuation: [],
  inv_fund: [],
};

jest.mock('@/utils/supabase/server', () => {
  const createClient = () => ({
    from: (table: string) => {
      const result = Promise.resolve({
        data: tableRows[table] ?? [],
        error: null,
      });
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        not: () => builder,
        is: () => builder,
        order: () => builder,
        range: () => result,
        then: (
          resolve: (v: { data: unknown; error: null }) => void,
          reject: (e: unknown) => void,
        ) => result.then(resolve, reject),
      });
      return builder;
    },
  });
  return { createClient };
});

import { getInvPortfolioFunds } from '@/lib/v2/inv/service';

const fundRow = (id: number, name: string) => ({
  id,
  public_id: `fund-${id}`,
  organization_id: 'org-1',
  name,
  short_name: name,
  code: null,
  description: null,
  currency: 'USD',
  status: 'active',
  vintage_year: null,
  target_size: null,
  committed_capital: null,
  metadata: null,
});

describe('getInvPortfolioFunds', () => {
  beforeEach(() => {
    tableRows.inv_company = [{ id: 1, organization_id: 'org-1' }];
    tableRows.module_documents = [];
    tableRows.v_inv_company_valuation = [{ fund_ids: [10] }];
    tableRows.inv_fund = [fundRow(10, 'Fund I'), fundRow(20, 'Fund II')];
  });

  it('drops funds with no portfolio company tagged to them', async () => {
    const { funds, count } = await getInvPortfolioFunds();

    expect(funds.map((f) => f.id)).toEqual([10]);
    expect(count).toBe(1);
  });

  it('keeps every fund tagged across the portfolio, deduped', async () => {
    tableRows.inv_company = [
      { id: 1, organization_id: 'org-1' },
      { id: 2, organization_id: 'org-1' },
    ];
    tableRows.v_inv_company_valuation = [
      { fund_ids: [10, 20] },
      { fund_ids: [20] },
    ];

    const { funds } = await getInvPortfolioFunds();

    expect(funds.map((f) => f.id)).toEqual([10, 20]);
  });

  it('returns no funds when a company carries no fund tags', async () => {
    tableRows.v_inv_company_valuation = [{ fund_ids: null }];

    const { funds, count } = await getInvPortfolioFunds();

    expect(funds).toEqual([]);
    expect(count).toBe(0);
  });

  it('returns no funds when the portfolio is empty', async () => {
    tableRows.inv_company = [];

    const { funds } = await getInvPortfolioFunds();

    expect(funds).toEqual([]);
  });
});
