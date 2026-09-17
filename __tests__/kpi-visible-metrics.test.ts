import { describe, expect, it } from '@jest/globals';
import {
  editableKpiHasPeriodContent,
  visibleCategoryKpis,
} from '@/lib/v2/kpis/transforms';
import type { CustomKpiValue, EditableKpi } from '@/lib/v2/kpis/types';

const cell = (
  year: number,
  quarter: number | null,
  numeric: number | null,
  month: number | null = null,
): CustomKpiValue => ({
  periodYear: year,
  periodQuarter: quarter,
  periodMonth: month,
  portcoValue: null,
  investorValue: { numeric, text: null },
  displayValue: { numeric, text: null },
  edited: numeric != null,
  portcoUpdatedAt: null,
  investorUpdatedAt: null,
});

const kpi = (label: string, values: CustomKpiValue[]): EditableKpi => ({
  publicId: `pub-${label}`,
  code: label,
  label,
  category: 'Unit Economics',
  valueType: 'currency',
  isFlow: false,
  isCustom: false,
  description: null,
  values,
});

describe('editableKpiHasPeriodContent', () => {
  it('counts a quarterly value on both axes', () => {
    const k = kpi('arr', [cell(2026, 1, 10)]);
    expect(editableKpiHasPeriodContent(k, 'quarterly')).toBe(true);
    expect(editableKpiHasPeriodContent(k, 'annual')).toBe(true);
  });

  it('counts a fiscal-year value only on the annual axis', () => {
    const k = kpi('headcount', [cell(2026, null, 42)]);
    expect(editableKpiHasPeriodContent(k, 'quarterly')).toBe(false);
    expect(editableKpiHasPeriodContent(k, 'annual')).toBe(true);
  });

  it('ignores cells that carry no value', () => {
    const k = kpi('churn', [cell(2026, 1, null), cell(2026, null, null)]);
    expect(editableKpiHasPeriodContent(k, 'quarterly')).toBe(false);
    expect(editableKpiHasPeriodContent(k, 'annual')).toBe(false);
  });

  it('has no content when the metric has no cells at all', () => {
    const k = kpi('nps', []);
    expect(editableKpiHasPeriodContent(k, 'quarterly')).toBe(false);
    expect(editableKpiHasPeriodContent(k, 'annual')).toBe(false);
  });
});

describe('visibleCategoryKpis', () => {
  const quarterlyOnly = kpi('arr', [cell(2026, 1, 10)]);
  const annualOnly = kpi('headcount', [cell(2026, null, 42)]);
  const empty = kpi('nps', []);
  const entry = {
    standard: [quarterlyOnly, annualOnly, empty],
    custom: [annualOnly],
  };

  it('keeps only quarterly-reported metrics in the quarterly view', () => {
    expect(visibleCategoryKpis(entry, false, 'quarterly')).toEqual({
      standard: [quarterlyOnly],
      custom: [],
    });
  });

  it('keeps annual-only metrics in the annual view', () => {
    expect(visibleCategoryKpis(entry, false, 'annual')).toEqual({
      standard: [quarterlyOnly, annualOnly],
      custom: [annualOnly],
    });
  });

  it('returns the full catalog when showing all metrics', () => {
    expect(visibleCategoryKpis(entry, true, 'quarterly')).toEqual(entry);
  });

  it('returns empty lists for a category with no entry', () => {
    expect(visibleCategoryKpis(undefined, false, 'annual')).toEqual({
      standard: [],
      custom: [],
    });
  });
});
