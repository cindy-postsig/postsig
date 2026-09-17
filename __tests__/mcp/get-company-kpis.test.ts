import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { NotFoundError } from '@/lib/errors';
import type {
  CompanyCustomKpi,
  KpiDefinition,
  ReportingQuarter,
  StandardKpiOverride,
} from '@/lib/v2/kpis/types';

const mockGetInvCompany = jest.fn<(publicId: string) => Promise<unknown>>();
const mockGetScopedPortfolioInvCompanies = jest.fn<() => Promise<unknown>>();
const ACME_ID = '3f2c9a4e-5b1d-4c8e-9a7f-2d6b8e1c4a90';
const mockGetKpis = jest.fn<() => Promise<KpiDefinition[]>>();
const mockGetCompanyReporting =
  jest.fn<(companyId: number) => Promise<ReportingQuarter[]>>();
const mockGetCompanyCustomKpis =
  jest.fn<(companyId: number) => Promise<CompanyCustomKpi[]>>();
const mockGetCompanyStandardKpiOverrides =
  jest.fn<(companyId: number) => Promise<StandardKpiOverride[]>>();
const mockUserMetadata = { organizationId: 'org-1', portcoKpisEnabled: true };

jest.mock('@/lib/v2/inv', () => ({
  __esModule: true,
  getInvCompany: (publicId: string) => mockGetInvCompany(publicId),
}));

jest.mock('@/lib/v2/inv/service', () => ({
  __esModule: true,
  getScopedPortfolioInvCompanies: () => mockGetScopedPortfolioInvCompanies(),
}));

jest.mock('@/lib/v2/kpis/service', () => ({
  __esModule: true,
  getKpis: () => mockGetKpis(),
  getCompanyReporting: (companyId: number) =>
    mockGetCompanyReporting(companyId),
  getCompanyCustomKpis: (companyId: number) =>
    mockGetCompanyCustomKpis(companyId),
  getCompanyStandardKpiOverrides: (companyId: number) =>
    mockGetCompanyStandardKpiOverrides(companyId),
}));

jest.mock('@/app/lib/mcp/context', () => ({
  requireMcpContext: () => ({ userMetadata: mockUserMetadata }),
}));

import { NotFoundToolError } from '@/app/lib/mcp/errors';
import { investorKpiTools } from '@/app/lib/mcp/tools/investor/kpis';

function def(
  id: number,
  code: string,
  label: string,
  category: string,
  over: Partial<KpiDefinition> = {},
): KpiDefinition {
  return {
    id,
    publicId: `kpi-${code}`,
    code,
    label,
    category,
    valueType: 'currency',
    unit: null,
    description: null,
    placeholder: null,
    sortOrder: id,
    isFlow: false,
    isCustom: false,
    ...over,
  };
}

const CATALOG: KpiDefinition[] = [
  def(1, 'revenue_q', 'Revenue', 'Growth & Revenue', { isFlow: true }),
  def(6, 'arr', 'ARR', 'Growth & Revenue'),
  def(12, 'gross_margin', 'Gross Margin', 'Profitability', {
    valueType: 'percent',
  }),
  def(22, 'cash', 'Cash', 'Cash & Liquidity'),
  def(54, 'accomplishments', 'Accomplishments', 'Narrative', {
    valueType: 'textarea',
  }),
];

function report(
  periodYear: number,
  periodQuarter: number,
  values: Record<string, number | string>,
  submittedAt: string | null,
): ReportingQuarter {
  return {
    packId: periodYear * 10 + periodQuarter,
    periodYear,
    periodQuarter,
    periodLabel: `Q${periodQuarter} ${periodYear}`,
    submittedAt,
    documents: [],
    kpis: Object.entries(values).map(([code, value]) => {
      const kpi = CATALOG.find((d) => d.code === code);
      if (!kpi) throw new Error(`No catalog KPI with code ${code}`);
      return {
        code,
        label: kpi.label,
        category: kpi.category,
        valueType: kpi.valueType,
        valueNumeric: typeof value === 'number' ? value : null,
        valueText: typeof value === 'string' ? value : null,
        sortOrder: kpi.sortOrder,
        updatedAt: submittedAt,
      };
    }),
  };
}

function investorValue(
  code: string,
  periodYear: number,
  period: { quarter?: number; month?: number },
  value: number,
  updatedAt: string,
): StandardKpiOverride {
  return {
    code,
    periodYear,
    periodQuarter: period.quarter ?? null,
    periodMonth: period.month ?? null,
    value: { numeric: value, text: null },
    updatedAt,
  };
}

const PIPELINE_COVERAGE: CompanyCustomKpi = {
  publicId: 'kpi-pipeline',
  label: 'Pipeline Coverage',
  category: 'Sales',
  valueType: 'number',
  isFlow: false,
  values: [
    {
      periodYear: 2026,
      periodQuarter: 2,
      periodMonth: null,
      portcoValue: { numeric: 3, text: null },
      investorValue: null,
      displayValue: { numeric: 3, text: null },
      edited: false,
      portcoUpdatedAt: '2026-07-10T00:00:00Z',
      investorUpdatedAt: null,
    },
  ],
};

const FY2025_REPORTS = [
  report(2025, 4, { revenue_q: 40, arr: 130 }, '2026-01-10T00:00:00Z'),
  report(2025, 3, { revenue_q: 30, arr: 120 }, '2025-10-10T00:00:00Z'),
  report(2025, 2, { revenue_q: 20, arr: 110 }, '2025-07-10T00:00:00Z'),
  report(2025, 1, { revenue_q: 10, arr: 100 }, '2025-04-10T00:00:00Z'),
];

function getCompanyKpis(input: Record<string, unknown>) {
  const tool = investorKpiTools.find((t) => t.name === 'get_company_kpis');
  if (!tool) throw new Error('get_company_kpis is not registered');
  return tool.handler(tool.inputSchema.parse(input), {});
}

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date('2026-09-11T12:00:00Z'),
    doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
  });
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUserMetadata.portcoKpisEnabled = true;
  mockGetInvCompany.mockResolvedValue({
    company: { id: 7, publicId: ACME_ID, name: 'Acme' },
  });
  mockGetScopedPortfolioInvCompanies.mockResolvedValue([]);
  mockGetKpis.mockResolvedValue(CATALOG);
  mockGetCompanyReporting.mockResolvedValue([]);
  mockGetCompanyCustomKpis.mockResolvedValue([]);
  mockGetCompanyStandardKpiOverrides.mockResolvedValue([]);
});

describe('get_company_kpis', () => {
  it('refuses when the KPIs module is off, before reading any company data', async () => {
    mockUserMetadata.portcoKpisEnabled = false;

    await expect(getCompanyKpis({ public_id: ACME_ID })).rejects.toMatchObject({
      code: 'feature_disabled',
      message: 'The KPIs module is not enabled for this organization',
    });
    expect(mockGetInvCompany).not.toHaveBeenCalled();
    expect(mockGetKpis).not.toHaveBeenCalled();
  });

  it('reports an unknown company as a not-found tool error', async () => {
    mockGetInvCompany.mockRejectedValue(new NotFoundError('Company'));

    await expect(
      getCompanyKpis({ public_id: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toBeInstanceOf(NotFoundToolError);
  });

  it('accepts a company name in place of a public_id', async () => {
    mockGetScopedPortfolioInvCompanies.mockResolvedValue([
      { id: 7, publicId: ACME_ID, name: 'Acme' },
    ]);
    mockGetCompanyReporting.mockResolvedValue([
      report(2026, 2, { arr: 1200 }, '2026-07-10T00:00:00Z'),
    ]);

    await expect(getCompanyKpis({ public_id: 'Acme' })).resolves.toMatchObject({
      publicId: ACME_ID,
      categories: [
        {
          kpis: [{ code: 'arr', values: [{ period: 'Q2 2026', value: 1200 }] }],
        },
      ],
    });
  });

  it('returns the quarterly values the KPIs tab shows, grouped by category', async () => {
    mockGetCompanyReporting.mockResolvedValue([
      report(2026, 3, { revenue_q: 999 }, null),
      report(
        2026,
        2,
        { revenue_q: 150, arr: 1200, accomplishments: 'Shipped v2' },
        '2026-07-10T00:00:00Z',
      ),
      report(2026, 1, { revenue_q: 100, arr: 1000 }, '2026-04-10T00:00:00Z'),
    ]);
    mockGetCompanyStandardKpiOverrides.mockResolvedValue([
      investorValue('arr', 2026, { quarter: 2 }, 1250, '2026-07-20T00:00:00Z'),
    ]);
    mockGetCompanyCustomKpis.mockResolvedValue([PIPELINE_COVERAGE]);

    const result = await getCompanyKpis({ public_id: ACME_ID });

    expect(mockGetCompanyReporting).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      publicId: ACME_ID,
      name: 'Acme',
      period: 'quarterly',
      earliestYear: 2023,
      kpiCount: 3,
      categories: [
        {
          category: 'Growth & Revenue',
          kpis: [
            {
              publicId: 'kpi-revenue_q',
              code: 'revenue_q',
              label: 'Revenue',
              valueType: 'currency',
              isFlow: true,
              isCustom: false,
              values: [
                { period: 'Q2 2026', value: 150, source: 'direct' },
                { period: 'Q1 2026', value: 100, source: 'direct' },
              ],
            },
            {
              publicId: 'kpi-arr',
              code: 'arr',
              label: 'ARR',
              valueType: 'currency',
              isFlow: false,
              isCustom: false,
              values: [
                {
                  period: 'Q2 2026',
                  value: 1250,
                  source: 'direct',
                  portcoValue: 1200,
                },
                { period: 'Q1 2026', value: 1000, source: 'direct' },
              ],
            },
          ],
        },
        {
          category: 'Sales',
          kpis: [
            {
              publicId: 'kpi-pipeline',
              code: null,
              label: 'Pipeline Coverage',
              valueType: 'number',
              isFlow: false,
              isCustom: true,
              values: [{ period: 'Q2 2026', value: 3, source: 'direct' }],
            },
          ],
        },
      ],
    });
  });

  it('rolls quarters up to fiscal years: flow KPIs sum, the rest take the latest quarter', async () => {
    mockGetCompanyReporting.mockResolvedValue([
      report(2026, 1, { revenue_q: 50, arr: 140 }, '2026-04-10T00:00:00Z'),
      ...FY2025_REPORTS,
    ]);

    const result = await getCompanyKpis({
      public_id: ACME_ID,
      period: 'annual',
    });

    expect(result).toMatchObject({
      period: 'annual',
      categories: [
        {
          category: 'Growth & Revenue',
          kpis: [
            {
              code: 'revenue_q',
              values: [
                { period: 'FY 2026 YTD', value: 50, source: 'computed' },
                { period: 'FY 2025', value: 100, source: 'computed' },
              ],
            },
            {
              code: 'arr',
              values: [
                { period: 'FY 2026 YTD', value: 140, source: 'computed' },
                { period: 'FY 2025', value: 130, source: 'computed' },
              ],
            },
          ],
        },
      ],
    });
  });

  it('keeps a fiscal-year value entered after its quarters, and reports the roll-up it disagrees with', async () => {
    mockGetCompanyReporting.mockResolvedValue(FY2025_REPORTS);
    mockGetCompanyStandardKpiOverrides.mockResolvedValue([
      investorValue('revenue_q', 2025, {}, 90, '2026-02-01T00:00:00Z'),
    ]);

    const result = await getCompanyKpis({
      public_id: ACME_ID,
      period: 'annual',
      kpis: ['revenue_q'],
    });

    expect(result).toMatchObject({
      categories: [
        {
          kpis: [
            {
              code: 'revenue_q',
              values: [
                {
                  period: 'FY 2025',
                  value: 90,
                  source: 'direct',
                  computedValue: 100,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('reads extracted months as entered and rolls them into their quarter', async () => {
    mockGetCompanyStandardKpiOverrides.mockResolvedValue([
      investorValue('cash', 2026, { month: 7 }, 500, '2026-08-05T00:00:00Z'),
      investorValue('cash', 2026, { month: 8 }, 450, '2026-09-05T00:00:00Z'),
    ]);

    await expect(
      getCompanyKpis({ public_id: ACME_ID, period: 'monthly' }),
    ).resolves.toMatchObject({
      categories: [
        {
          category: 'Cash & Liquidity',
          kpis: [
            {
              code: 'cash',
              values: [
                { period: 'Aug 2026', value: 450, source: 'direct' },
                { period: 'Jul 2026', value: 500, source: 'direct' },
              ],
            },
          ],
        },
      ],
    });
    await expect(getCompanyKpis({ public_id: ACME_ID })).resolves.toMatchObject(
      {
        categories: [
          {
            category: 'Cash & Liquidity',
            kpis: [
              {
                code: 'cash',
                values: [{ period: 'Q3 2026', value: 450, source: 'computed' }],
              },
            ],
          },
        ],
      },
    );
  });

  it('narrows by category, and by KPI code or label, case-insensitively', async () => {
    mockGetCompanyReporting.mockResolvedValue([
      report(
        2026,
        2,
        { revenue_q: 150, arr: 1200, cash: 800 },
        '2026-07-10T00:00:00Z',
      ),
    ]);
    mockGetCompanyCustomKpis.mockResolvedValue([PIPELINE_COVERAGE]);

    await expect(
      getCompanyKpis({ public_id: ACME_ID, categories: ['cash & liquidity'] }),
    ).resolves.toMatchObject({
      kpiCount: 1,
      categories: [{ category: 'Cash & Liquidity', kpis: [{ code: 'cash' }] }],
    });
    await expect(
      getCompanyKpis({
        public_id: ACME_ID,
        kpis: ['REVENUE_Q', 'pipeline coverage'],
      }),
    ).resolves.toMatchObject({
      kpiCount: 2,
      categories: [
        { category: 'Growth & Revenue', kpis: [{ code: 'revenue_q' }] },
        { category: 'Sales', kpis: [{ label: 'Pipeline Coverage' }] },
      ],
    });
  });
});
