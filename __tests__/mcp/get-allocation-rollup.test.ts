jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const userMetadata = {
  organizationId: 'org-1',
  organizationFY: 1,
  baseCurrency: 'EUR',
};
jest.mock('@/app/lib/mcp/context', () => ({
  requireMcpContext: () => ({ userMetadata, cache: {} }),
}));
jest.mock('@/app/lib/mcp/guards', () => ({
  assertSameOrg: () => undefined,
}));
jest.mock('@/lib/v2/cost-allocation/tab-data', () => ({
  loadContractHeader: jest.fn(),
}));
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  ...jest.requireActual('@/lib/v2/cost-allocation/context'),
  loadAllocationContext: jest.fn(),
}));
jest.mock('@/lib/v2/contracts/service', () => ({
  getContractsList: jest.fn(),
}));

const isCostAllocationEnabled = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/v2/cost-allocation/flag', () => ({
  isCostAllocationEnabled: (...args: unknown[]) =>
    isCostAllocationEnabled(...args),
}));

const loadAllocationRollupReport = jest.fn();
jest.mock('@/lib/v2/cost-allocation/rollup-report', () => ({
  loadAllocationRollupReport: (...args: unknown[]) =>
    loadAllocationRollupReport(...args),
}));

import {
  FeatureDisabledToolError,
  ValidationToolError,
} from '@/app/lib/mcp/errors';
import { costAllocationTools } from '@/app/lib/mcp/tools/cpm/cost-allocation';
import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import {
  buildAllocationRollup,
  type AllocationRollupData,
} from '@/lib/v2/cost-allocation/rollup-report-rows';

const tool = costAllocationTools.find(
  (t) => t.name === 'get_allocation_rollup',
);
if (!tool) throw new Error('get_allocation_rollup not registered');
type RollupResult = {
  level: string;
  rows: Array<Record<string, unknown>>;
  outsideHierarchy: { name: string; total: number };
  unassigned: { name: string; total: number };
  totals: { budget: number; spend: number; difference: number };
};
const handler = tool.handler as (
  payload: Record<string, unknown>,
) => Promise<RollupResult>;

const ctx = buildAllocationContext({
  allocations: [],
  lines: [],
  units: [
    { id: 1, level: 'entity', name: 'Bank', parent_id: null },
    { id: 2, level: 'department', name: 'Research', parent_id: 1 },
    { id: 3, level: 'cost_center', name: 'CC-1', parent_id: null },
  ],
  employees: [
    {
      id: 9,
      name: 'Ada',
      status: 'active',
      deleted_at: null,
      org_unit_id: 2,
      cost_center: 'CC-1',
    },
  ],
  seats: [],
  relationships: [],
});

const report: AllocationRollupData = {
  period: 'ytd',
  window: { start: '2026-01-01', end: '2026-08-26' },
  custom: null,
  costMethod: 'actual',
  fiscalYears: [2026],
  budgetFiscalYear: 2026,
  projected: null,
  bloombergSeatRenewalIncreasePercent: null,
  unallocatedContracts: [],
  ...buildAllocationRollup({
    targetTotals: new Map([
      ['unit:2', 100],
      ['user:9', 20],
      ['unit:3', 5],
      ['unassigned', 7],
    ]),
    unitsById: ctx.unitsById,
    employeesById: ctx.employeesById,
    levelOrder: ['entity', 'department'],
    employees: [
      {
        id: 9,
        name: 'Ada',
        status: 'active',
        deleted_at: null,
        org_unit_id: 2,
        cost_center: 'CC-1',
      },
    ],
    budgetByKey: new Map([['unit:2', 1000]]),
  }),
};

beforeEach(() => {
  jest.clearAllMocks();
  loadAllocationRollupReport.mockResolvedValue(report);
});

describe('get_allocation_rollup', () => {
  it('is read-only and registered with annotations', () => {
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.destructiveHint).toBeUndefined();
    expect(tool.requiredScope).toBeUndefined();
  });

  it('parses its input with the report presets and a level enum', () => {
    expect(tool.inputSchema.parse({ level: 'department' })).toEqual({
      level: 'department',
      period: 'current-fy',
    });
    expect(() => tool.inputSchema.parse({ level: 'floor' })).toThrow();
    // The enum tracks REPORT_PERIODS, so the tool gained 'last-quarter'
    // with the report; the rejected example has to be a period neither offers.
    expect(
      tool.inputSchema.parse({ level: 'entity', period: 'last-quarter' }),
    ).toEqual({ level: 'entity', period: 'last-quarter' });
    expect(() =>
      tool.inputSchema.parse({ level: 'entity', period: 'this-week' }),
    ).toThrow();
  });

  it('enforces the custom contract at parse time: both real dates, in order', () => {
    const custom = (from?: string, to?: string) =>
      tool.inputSchema.safeParse({
        level: 'entity',
        period: 'custom',
        from,
        to,
      }).success;
    expect(custom('2026-01-01', '2026-03-31')).toBe(true);
    expect(custom('2026-01-01', undefined)).toBe(false);
    expect(custom(undefined, '2026-03-31')).toBe(false);
    expect(custom('2026-02-30', '2026-03-31')).toBe(false);
    expect(custom('2026-03-31', '2026-01-01')).toBe(false);
    // Outside custom the dates are optional.
    expect(
      tool.inputSchema.safeParse({ level: 'entity', period: 'ytd' }).success,
    ).toBe(true);
  });

  it("returns the view's rows with paths and depth, both catch-alls, and reconciling totals", async () => {
    const result = await handler({ level: 'entity', period: 'ytd' });

    expect(loadAllocationRollupReport).toHaveBeenCalledWith(userMetadata, {
      period: 'ytd',
      from: undefined,
      to: undefined,
    });
    expect(result).toEqual({
      level: 'entity',
      levelLabel: 'Entities',
      levelsInUse: [
        { key: 'entity', label: 'Entities' },
        { key: 'department', label: 'Departments' },
        { key: 'cost_center', label: 'Cost Centers' },
        { key: 'user', label: 'Users' },
      ],
      period: 'ytd',
      periodLabel: 'Year to Date',
      window: { start: '2026-01-01', end: '2026-08-26' },
      fiscalYears: [2026],
      costMethod: 'actual',
      costMethodLabel: 'Actual Cost',
      baseCurrency: 'EUR',
      rows: [
        {
          key: 'unit:1',
          name: 'Bank',
          level: 'entity',
          path: ['Bank'],
          depth: 0,
          budget: null,
          rolledUpBudget: 1000,
          direct: 0,
          rollup: 120,
          total: 120,
          difference: null,
          stale: false,
        },
        {
          key: 'unit:2',
          name: 'Research',
          level: 'department',
          path: ['Bank', 'Research'],
          depth: 1,
          budget: 1000,
          rolledUpBudget: 0,
          direct: 100,
          rollup: 20,
          total: 120,
          difference: 880,
          stale: false,
        },
      ],
      outsideHierarchy: { name: 'Outside hierarchy', total: 5 },
      unassigned: { name: 'Unassigned', total: 7 },
      totals: { budget: 1000, spend: 132, difference: -132 + 1000 },
    });
  });

  it('serves the cost-center view with the same grand total', async () => {
    const result = await handler({ level: 'cost_center' });

    expect(result.rows).toEqual([
      expect.objectContaining({
        name: 'CC-1',
        direct: 5,
        rollup: 20,
        total: 25,
      }),
    ]);
    expect(result.outsideHierarchy.total).toBe(100);
    expect(result.totals.spend).toBe(132);
  });

  it('serves the user level flat, and keeps people out of the tree levels', async () => {
    const result = await handler({ level: 'user' });

    expect(result.rows).toEqual([
      expect.objectContaining({
        key: 'user:9',
        name: 'Ada',
        level: 'user',
        path: ['Bank', 'Research', 'Ada'],
        depth: 0,
        direct: 20,
        rollup: 0,
        total: 20,
      }),
    ]);
    expect(result.outsideHierarchy.total).toBe(105);
    expect(result.totals.spend).toBe(132);

    // Ada nests under Research in the report; a level roll-up stays per node.
    const department = await handler({ level: 'department' });
    expect(department.rows.map((row) => row.name)).toEqual(['Research']);
  });

  it('rejects a level the org does not use, naming the levels in use', async () => {
    await expect(handler({ level: 'team', period: 'ytd' })).rejects.toThrow(
      new ValidationToolError(
        'Level "team" is not in use for this organization. Levels in use: entity, department, cost_center, user.',
      ),
    );
  });

  it('passes a custom range through', async () => {
    await handler({
      level: 'entity',
      period: 'custom',
      from: '2026-01-01',
      to: '2026-03-31',
    });

    expect(loadAllocationRollupReport).toHaveBeenCalledWith(userMetadata, {
      period: 'custom',
      from: '2026-01-01',
      to: '2026-03-31',
    });
  });

  it('refuses, before running the engine, for an org without the feature', async () => {
    isCostAllocationEnabled.mockResolvedValueOnce(false);

    await expect(
      handler({ level: 'entity', period: 'ytd' }),
    ).rejects.toBeInstanceOf(FeatureDisabledToolError);
    expect(isCostAllocationEnabled).toHaveBeenCalledWith(userMetadata);
    expect(loadAllocationRollupReport).not.toHaveBeenCalled();
  });
});
