import { describe, expect, it } from '@jest/globals';
import {
  buildKpiPeriods,
  buildStandardEditableKpis,
  hasQuarterlyQuantKpis,
  pivotKpisByCategory,
} from '@/lib/v2/kpis/transforms';
import type {
  CompanyCustomKpi,
  KpiDefinition,
  KpiValueType,
  ReportingKpiValue,
  ReportingQuarter,
  StandardKpiOverride,
} from '@/lib/v2/kpis/types';

const kpi = (
  code: string,
  category: string,
  sortOrder: number,
  valueNumeric: number | null = 1,
  valueType: KpiValueType = 'currency',
): ReportingKpiValue => ({
  code,
  label: code,
  category,
  valueType,
  valueNumeric,
  valueText: null,
  sortOrder,
  updatedAt: null,
});

const quarter = (
  packId: number,
  year: number,
  q: number | null,
  kpis: ReportingKpiValue[] = [],
): ReportingQuarter => ({
  packId,
  periodYear: year,
  periodQuarter: q,
  periodLabel: q == null ? `FY ${year}` : `Q${q} ${year}`,
  submittedAt: '2026-01-01T00:00:00Z',
  kpis,
  documents: [],
});

const customKpi = (
  values: {
    year: number;
    quarter: number | null;
    month?: number | null;
    numeric?: number | null;
  }[],
): CompanyCustomKpi => ({
  publicId: 'pub-1',
  label: 'NRR',
  category: 'Unit Economics',
  valueType: 'percent',
  isFlow: false,
  values: values.map((v) => ({
    periodYear: v.year,
    periodQuarter: v.quarter,
    periodMonth: v.month ?? null,
    portcoValue: null,
    investorValue: { numeric: v.numeric ?? 1, text: null },
    displayValue: { numeric: v.numeric ?? 1, text: null },
    edited: true,
    portcoUpdatedAt: null,
    investorUpdatedAt: null,
  })),
});

const NOW = { year: 2026, quarter: 3 };

describe('buildKpiPeriods annual', () => {
  it('rolls submitted quarters up into one fiscal-year column', () => {
    const submitted = [quarter(1, 2026, 1), quarter(2, 2025, null)];
    const result = buildKpiPeriods('annual', submitted, [], NOW);
    expect(result.map((r) => r.year)).toEqual([2026, 2025]);
    expect(result.every((r) => r.quarter === null && r.month === null)).toBe(
      true,
    );
  });

  it('synthesizes a fiscal year carried only by authored values', () => {
    const result = buildKpiPeriods(
      'annual',
      [],
      [customKpi([{ year: 2025, quarter: 2 }])],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('FY 2025 YTD');
  });

  it('labels a year with a Q4 value as a full fiscal year', () => {
    const result = buildKpiPeriods(
      'annual',
      [],
      [customKpi([{ year: 2025, quarter: 4 }])],
      NOW,
    );
    expect(result[0].label).toBe('FY 2025');
  });

  it('treats a Q4 month as completing the fiscal year', () => {
    const result = buildKpiPeriods(
      'annual',
      [],
      [customKpi([{ year: 2025, quarter: null, month: 11 }])],
      NOW,
    );
    expect(result[0].label).toBe('FY 2025');
  });

  it('gives a year one column whether it was submitted or authored', () => {
    const submitted = [quarter(1, 2025, 1, [kpi('rev', 'Financial', 1)])];
    const result = buildKpiPeriods(
      'annual',
      submitted,
      [customKpi([{ year: 2025, quarter: 2 }])],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].year).toBe(2025);
  });

  it('sorts columns newest-first across submitted and authored years', () => {
    const submitted = [quarter(1, 2024, 1, [kpi('rev', 'Financial', 1)])];
    const result = buildKpiPeriods(
      'annual',
      submitted,
      [customKpi([{ year: 2026, quarter: 1 }])],
      NOW,
    );
    expect(result.map((r) => r.year)).toEqual([2026, 2024]);
  });

  it('drops years older than the history window', () => {
    const submitted = [quarter(1, 2022, 1, [kpi('rev', 'Financial', 1)])];
    const result = buildKpiPeriods(
      'annual',
      submitted,
      [customKpi([{ year: 2023, quarter: 1 }])],
      NOW,
    );
    expect(result.map((r) => r.year)).toEqual([2023]);
  });
});

describe('buildKpiPeriods quarterly', () => {
  it('always includes the current quarter with no pack', () => {
    const cols = buildKpiPeriods('quarterly', [], [], NOW);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({
      year: 2026,
      quarter: 3,
      month: null,
      label: 'Q3 2026',
    });
  });

  it('collapses a pack and a custom value for the same quarter into one column', () => {
    const cols = buildKpiPeriods(
      'quarterly',
      [quarter(7, 2026, 3)],
      [customKpi([{ year: 2026, quarter: 3 }])],
      NOW,
    );
    expect(cols).toHaveLength(1);
    expect(cols[0].label).toBe('Q3 2026');
  });

  it('adds authored-only quarters and sorts newest-first', () => {
    const cols = buildKpiPeriods(
      'quarterly',
      [quarter(7, 2025, 4)],
      [customKpi([{ year: 2026, quarter: 1 }])],
      NOW,
    );
    expect(cols.map((c) => c.label)).toEqual(['Q3 2026', 'Q1 2026', 'Q4 2025']);
  });

  it('opens a column for the quarter a monthly value rolls up into', () => {
    const cols = buildKpiPeriods(
      'quarterly',
      [],
      [customKpi([{ year: 2025, quarter: null, month: 5 }])],
      NOW,
    );
    expect(cols.map((c) => c.label)).toEqual(['Q3 2026', 'Q2 2025']);
  });

  it('ignores annual periods and annual custom values', () => {
    const cols = buildKpiPeriods(
      'quarterly',
      [quarter(9, 2025, null)],
      [customKpi([{ year: 2025, quarter: null }])],
      NOW,
    );
    expect(cols).toHaveLength(1);
    expect(cols[0].label).toBe('Q3 2026');
  });

  it('drops quarters older than the history window', () => {
    const cols = buildKpiPeriods('quarterly', [quarter(7, 2022, 4)], [], NOW);
    expect(cols.map((c) => c.label)).toEqual(['Q3 2026']);
  });
});

describe('buildKpiPeriods monthly', () => {
  it('lists only months that carry values, newest-first', () => {
    const cols = buildKpiPeriods(
      'monthly',
      [quarter(1, 2026, 1)],
      [
        customKpi([
          { year: 2026, quarter: null, month: 1 },
          { year: 2025, quarter: null, month: 12 },
          { year: 2026, quarter: null, month: 3 },
        ]),
      ],
      NOW,
    );
    expect(cols.map((c) => c.label)).toEqual([
      'Mar 2026',
      'Jan 2026',
      'Dec 2025',
    ]);
    expect(cols.every((c) => c.quarter === null && c.month != null)).toBe(true);
  });

  it('has no columns when nothing was reported monthly', () => {
    const cols = buildKpiPeriods(
      'monthly',
      [quarter(1, 2026, 1)],
      [customKpi([{ year: 2026, quarter: 1 }])],
      NOW,
    );
    expect(cols).toEqual([]);
  });

  it('drops months older than the history window', () => {
    const cols = buildKpiPeriods(
      'monthly',
      [],
      [
        customKpi([
          { year: 2022, quarter: null, month: 6 },
          { year: 2023, quarter: null, month: 6 },
        ]),
      ],
      NOW,
    );
    expect(cols.map((c) => c.label)).toEqual(['Jun 2023']);
  });
});

describe('pivotKpisByCategory', () => {
  it('groups metrics by category ordered by catalog sortOrder', () => {
    const periods = [
      quarter(1, 2026, 1, [
        kpi('burn', 'Financial', 2),
        kpi('rev', 'Financial', 1),
        kpi('nps', 'Customers', 3),
      ]),
    ];
    const result = pivotKpisByCategory(periods);
    expect(Array.from(result.keys())).toEqual(['Financial', 'Customers']);
    expect(result.get('Financial')!.map((m) => m.code)).toEqual([
      'rev',
      'burn',
    ]);
  });

  it('keys each metric value by the pack it appeared in', () => {
    const periods = [
      quarter(1, 2026, 1, [kpi('rev', 'Financial', 1, 100)]),
      quarter(2, 2026, 2, [kpi('rev', 'Financial', 1, 200)]),
    ];
    const metric = pivotKpisByCategory(periods).get('Financial')![0];
    expect(metric.valuesByPack.get(1)?.valueNumeric).toBe(100);
    expect(metric.valuesByPack.get(2)?.valueNumeric).toBe(200);
  });

  it('hides narrative and textarea KPIs', () => {
    const periods = [
      quarter(1, 2026, 1, [
        kpi('notes', 'Narrative', 1),
        kpi('summary', 'Financial', 2, null, 'textarea'),
      ]),
    ];
    expect(pivotKpisByCategory(periods).size).toBe(0);
  });
});

describe('hasQuarterlyQuantKpis', () => {
  it('is true when a quarterly period has a quantitative KPI', () => {
    const submitted = [quarter(1, 2026, 1, [kpi('rev', 'Financial', 1)])];
    expect(hasQuarterlyQuantKpis(submitted)).toBe(true);
  });

  it('ignores annual periods and narrative-only quarters', () => {
    const submitted = [
      quarter(1, 2025, null, [kpi('rev', 'Financial', 1)]),
      quarter(2, 2026, 1, [kpi('notes', 'Narrative', 1)]),
    ];
    expect(hasQuarterlyQuantKpis(submitted)).toBe(false);
  });
});

describe('buildStandardEditableKpis', () => {
  const def = (
    code: string,
    category: string,
    sortOrder: number,
    opts: Partial<
      Pick<KpiDefinition, 'valueType' | 'isFlow' | 'description'>
    > = {},
  ): KpiDefinition => ({
    id: sortOrder,
    publicId: `pub-${code}`,
    code,
    label: code.toUpperCase(),
    category,
    valueType: opts.valueType ?? 'currency',
    unit: null,
    description: opts.description ?? null,
    placeholder: null,
    sortOrder,
    isFlow: opts.isFlow ?? false,
    isCustom: false,
  });

  const override = (
    code: string,
    year: number,
    q: number | null,
    numeric: number,
  ): StandardKpiOverride => ({
    code,
    periodYear: year,
    periodQuarter: q,
    periodMonth: null,
    value: { numeric, text: null },
    updatedAt: null,
  });

  it('returns a row per eligible catalog KPI even with no values', () => {
    const rows = buildStandardEditableKpis(
      [def('arr', 'Financial', 1), def('nps', 'Customers', 2)],
      [],
      [],
    );
    expect(rows.map((r) => r.publicId)).toEqual(['pub-arr', 'pub-nps']);
    expect(rows[0].values).toEqual([]);
    expect(rows[0].isCustom).toBe(false);
  });

  it('lets an investor override win the display and marks the cell edited', () => {
    const [row] = buildStandardEditableKpis(
      [def('arr', 'Financial', 1)],
      [quarter(1, 2026, 1, [kpi('arr', 'Financial', 1, 100)])],
      [override('arr', 2026, 1, 120)],
    );
    expect(row.values).toEqual([
      {
        periodYear: 2026,
        periodQuarter: 1,
        periodMonth: null,
        portcoValue: { numeric: 100, text: null },
        investorValue: { numeric: 120, text: null },
        displayValue: { numeric: 120, text: null },
        edited: true,
        portcoUpdatedAt: null,
        investorUpdatedAt: null,
      },
    ]);
  });

  it('leaves a portco-only cell unedited', () => {
    const [row] = buildStandardEditableKpis(
      [def('arr', 'Financial', 1)],
      [quarter(1, 2026, 1, [kpi('arr', 'Financial', 1, 100)])],
      [],
    );
    expect(row.values[0]).toMatchObject({
      portcoValue: { numeric: 100, text: null },
      investorValue: null,
      displayValue: { numeric: 100, text: null },
      edited: false,
    });
  });

  it('surfaces an investor value even when there is no portco submission', () => {
    const [row] = buildStandardEditableKpis(
      [def('arr', 'Financial', 1)],
      [],
      [override('arr', 2026, 2, 90)],
    );
    expect(row.values[0]).toMatchObject({
      portcoValue: null,
      investorValue: { numeric: 90, text: null },
      displayValue: { numeric: 90, text: null },
      edited: true,
    });
  });

  it('excludes narrative and textarea KPIs from the editable rows', () => {
    const rows = buildStandardEditableKpis(
      [
        def('arr', 'Financial', 1),
        def('notes', 'Narrative', 2),
        def('summary', 'Financial', 3, { valueType: 'textarea' }),
      ],
      [],
      [],
    );
    expect(rows.map((r) => r.code)).toEqual(['arr']);
  });

  it('carries the catalog description through for the label tooltip', () => {
    const [row] = buildStandardEditableKpis(
      [def('arr', 'Financial', 1, { description: 'Annual recurring revenue' })],
      [],
      [],
    );
    expect(row.description).toBe('Annual recurring revenue');
  });
});
