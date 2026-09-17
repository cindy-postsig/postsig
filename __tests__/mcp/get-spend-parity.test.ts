import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { SpendQueryResponse } from '@/app/api/v2/handlers/spend/query';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/app/lib/mcp/context', () => ({
  __esModule: true,
  requireMcpContext: () => ({
    userMetadata: {
      organizationId: 'org-1',
      organizationFY: 1,
      baseCurrency: 'EUR',
    },
  }),
}));

// get_spend must ride the SAME engine query as the in-app Spend Overview
// (psk-1937 follow-up): these mocks pin the delegation contract.
const mockRunSpendQuery = jest.fn<() => Promise<SpendQueryResponse>>();
jest.mock('@/app/api/v2/handlers/spend/query', () => ({
  __esModule: true,
  runSpendQuery: (...args: unknown[]) =>
    (mockRunSpendQuery as unknown as (...a: unknown[]) => unknown)(...args),
}));

const mockGetDefaultCostMethod = jest.fn<() => Promise<string>>();
jest.mock('@/lib/settings/default-cost-method', () => ({
  __esModule: true,
  getDefaultCostMethod: () => mockGetDefaultCostMethod(),
}));

jest.mock('@/lib/v2/reports/monthly-report/service', () => ({
  __esModule: true,
  getMonthlyReportData: jest.fn(),
}));

import { spendTools } from '@/app/lib/mcp/tools/cpm/spend';

const getSpend = spendTools.find((t) => t.name === 'get_spend')!;

function engineResponse(
  overrides: Partial<SpendQueryResponse> = {},
): SpendQueryResponse {
  return {
    kind: 'commitments',
    currency: 'base',
    targetCurrency: 'EUR',
    window: { start: '2026-01-01', end: '2027-01-01', fiscalYear: 2026 },
    periods: ['2026-01', '2026-02', '2026-03'],
    // 2026-01 carries two commitment kinds in one period — the buckets must
    // accumulate them, as the Spend Overview cards do, not keep the last.
    items: [
      { period: '2026-01', groupKey: 'total', value: 100.004, kind: 'new' },
      { period: '2026-01', groupKey: 'total', value: 25, kind: 'renewal' },
      { period: '2026-03', groupKey: 'total', value: 50.004 },
    ],
    refs: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockRunSpendQuery.mockReset();
  mockGetDefaultCostMethod.mockReset();
  mockRunSpendQuery.mockResolvedValue(engineResponse());
  mockGetDefaultCostMethod.mockResolvedValue('committed');
});

describe('get_spend rides the Spend Overview engine query (psk-1937)', () => {
  it('defaults to the org cost method and the literal currentFY window', async () => {
    const result = (await getSpend.handler({ period: 'current_fy' }, {})) as {
      view: string;
      viewLabel: string;
      baseCurrency: string;
      total: number;
      months: Array<{ key: string; value: number }>;
    };

    expect(mockGetDefaultCostMethod).toHaveBeenCalled();
    // Contract Term maps to start-dated annual commitments — the exact input
    // the Spend Overview cards send for the org default method.
    expect(mockRunSpendQuery).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      {
        kind: 'commitments',
        valuation: 'annual',
        recognition: 'term-start',
        window: 'currentFY',
        granularity: 'month',
        groupBy: 'total',
      },
    );

    expect(result.view).toBe('committed');
    expect(result.viewLabel).toBe('Contract Term');
    expect(result.baseCurrency).toBe('EUR');
    // Total sums the RAW engine values (as the Spend Overview cards do),
    // not the per-month rounded figures — 100.004 + 25 + 50.004 rounds to
    // 175.01, while rounding each month first would give 175.
    expect(result.total).toBe(175.01);
    expect(result.months).toEqual([
      // Both same-period commitment items accumulated, not last-write-wins.
      expect.objectContaining({ key: '2026-01', value: 125 }),
      expect.objectContaining({ key: '2026-02', value: 0 }),
      expect.objectContaining({ key: '2026-03', value: 50 }),
    ]);
  });

  it('an explicit view sends a basis query over the exact month range', async () => {
    mockRunSpendQuery.mockResolvedValue(
      engineResponse({
        kind: 'spend',
        basis: 'amortized',
        periods: ['2026-03', '2026-04', '2026-05'],
        items: [{ period: '2026-04', groupKey: 'total', value: 10 }],
      }),
    );

    const result = (await getSpend.handler(
      {
        view: 'amortized',
        period: 'custom',
        start_month: '2026-03',
        end_month: '2026-05',
      },
      {},
    )) as { total: number };

    expect(mockGetDefaultCostMethod).not.toHaveBeenCalled();
    expect(mockRunSpendQuery).toHaveBeenCalledWith(expect.anything(), {
      kind: 'spend',
      basis: 'amortized',
      // Half-open on the right: an inclusive 2026-05 end month queries
      // through the last day of May.
      window: { from: '2026-03-01', to: '2026-06-01' },
      granularity: 'month',
      groupBy: 'total',
    });
    expect(result.total).toBe(10);
  });
});
