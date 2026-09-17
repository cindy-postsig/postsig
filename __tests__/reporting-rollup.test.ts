import { describe, expect, it } from '@jest/globals';
import { rollUpToFiscalYears } from '@/lib/v2/kpis/transforms';
import type {
  KpiValueType,
  ReportingKpiValue,
  ReportingQuarter,
} from '@/lib/v2/kpis/types';

const kpi = (
  code: string,
  valueNumeric: number | null,
  valueType: KpiValueType = 'currency',
): ReportingKpiValue => ({
  code,
  label: code,
  category: 'Test',
  valueType,
  valueNumeric,
  valueText: null,
  sortOrder: 0,
  updatedAt: null,
});

const quarter = (
  packId: number,
  periodYear: number,
  periodQuarter: number | null,
  kpis: ReportingKpiValue[],
): ReportingQuarter => ({
  packId,
  periodYear,
  periodQuarter,
  periodLabel:
    periodQuarter == null
      ? `FY ${periodYear}`
      : `Q${periodQuarter} ${periodYear}`,
  submittedAt: '2026-01-01T00:00:00Z',
  kpis,
  documents: [],
});

const FLOW = new Set(['revenue']);

const byCode = (q: ReportingQuarter) =>
  new Map(q.kpis.map((k) => [k.code, k.valueNumeric]));

describe('rollUpToFiscalYears', () => {
  it('sums flow metrics and snapshots stock metrics within a year', () => {
    const periods = [
      quarter(1, 2025, 1, [kpi('revenue', 100), kpi('arr', 1000)]),
      quarter(2, 2025, 2, [kpi('revenue', 200), kpi('arr', 1200)]),
      quarter(3, 2025, 3, [kpi('revenue', 300), kpi('arr', 1500)]),
      quarter(4, 2025, 4, [kpi('revenue', 400), kpi('arr', 2000)]),
    ];

    const [fy] = rollUpToFiscalYears(periods, FLOW);

    expect(fy.periodLabel).toBe('FY 2025');
    expect(byCode(fy).get('revenue')).toBe(1000);
    expect(byCode(fy).get('arr')).toBe(2000);
  });

  it('labels an incomplete year (no Q4) as YTD', () => {
    const periods = [
      quarter(1, 2026, 1, [kpi('revenue', 100), kpi('arr', 2100)]),
      quarter(2, 2026, 2, [kpi('revenue', 150), kpi('arr', 2300)]),
    ];

    const [fy] = rollUpToFiscalYears(periods, FLOW);

    expect(fy.periodLabel).toBe('FY 2026 YTD');
    expect(byCode(fy).get('revenue')).toBe(250);
    expect(byCode(fy).get('arr')).toBe(2300);
  });

  it('orders years newest-first and keeps each as its own FY column', () => {
    const periods = [
      quarter(1, 2024, 4, [kpi('revenue', 50)]),
      quarter(2, 2025, 4, [kpi('revenue', 80)]),
    ];

    const rolled = rollUpToFiscalYears(periods, FLOW);

    expect(rolled.map((r) => r.periodLabel)).toEqual(['FY 2025', 'FY 2024']);
  });

  it('snapshots to the latest quarter that reported a value, ignoring blanks', () => {
    const periods = [
      quarter(1, 2025, 1, [kpi('arr', 1000)]),
      quarter(2, 2025, 2, [kpi('arr', null)]),
    ];

    const [fy] = rollUpToFiscalYears(periods, FLOW);

    expect(byCode(fy).get('arr')).toBe(1000);
  });

  it('skips null quarters when summing a flow', () => {
    const periods = [
      quarter(1, 2025, 1, [kpi('revenue', null)]),
      quarter(2, 2025, 2, [kpi('revenue', 200)]),
    ];

    const [fy] = rollUpToFiscalYears(periods, FLOW);

    expect(byCode(fy).get('revenue')).toBe(200);
  });

  it('passes already-annual periods through unchanged', () => {
    const periods = [quarter(9, 2025, null, [kpi('revenue', 500)])];

    const rolled = rollUpToFiscalYears(periods, FLOW);

    expect(rolled).toHaveLength(1);
    expect(rolled[0].periodLabel).toBe('FY 2025');
    expect(byCode(rolled[0]).get('revenue')).toBe(500);
  });
});
