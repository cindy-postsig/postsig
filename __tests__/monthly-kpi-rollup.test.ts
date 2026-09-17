import { describe, expect, it } from '@jest/globals';
import {
  customDisplayValue,
  earliestDisplayedYear,
  editableKpiHasPeriodContent,
  formatMonthLabel,
  quarterOfMonth,
  resolveAnnualKpi,
  resolveQuarterKpi,
} from '@/lib/v2/kpis/transforms';
import type {
  CustomKpiValue,
  EditableKpi,
  RollupKpi,
} from '@/lib/v2/kpis/types';

const T1 = '2026-01-01T00:00:00Z';
const T2 = '2026-02-01T00:00:00Z';

const cell = (
  period: { quarter?: number | null; month?: number | null; year?: number },
  numeric: number | null,
  updatedAt: string | null = null,
): CustomKpiValue => {
  const scalar = { numeric, text: null };
  return {
    periodYear: period.year ?? 2026,
    periodQuarter: period.quarter ?? null,
    periodMonth: period.month ?? null,
    portcoValue: null,
    investorValue: scalar,
    displayValue: scalar,
    edited: numeric != null,
    portcoUpdatedAt: null,
    investorUpdatedAt: updatedAt,
  };
};

const month = (m: number, numeric: number | null, updatedAt?: string) =>
  cell({ month: m }, numeric, updatedAt ?? null);
const quarterCell = (q: number, numeric: number | null, updatedAt?: string) =>
  cell({ quarter: q }, numeric, updatedAt ?? null);

const kpi = (isFlow: boolean, values: CustomKpiValue[]): RollupKpi => ({
  isFlow,
  values,
});

describe('quarterOfMonth', () => {
  it('maps each month onto its calendar quarter', () => {
    expect([1, 3, 4, 6, 7, 9, 10, 12].map(quarterOfMonth)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
});

describe('formatMonthLabel', () => {
  it('renders an abbreviated month and year', () => {
    expect(formatMonthLabel(1, 2026)).toBe('Jan 2026');
    expect(formatMonthLabel(12, 2025)).toBe('Dec 2025');
  });
});

describe('earliestDisplayedYear', () => {
  it('opens the window three years back', () => {
    expect(earliestDisplayedYear(2026)).toBe(2023);
  });
});

describe('resolveQuarterKpi', () => {
  it('sums a flow metric across the quarter months', () => {
    const k = kpi(true, [month(1, 10), month(2, 20), month(3, 30)]);
    expect(resolveQuarterKpi(k, 2026, 1)).toMatchObject({
      source: 'computed',
      displayValue: { numeric: 60, text: null },
    });
  });

  it('snapshots the latest month for a stock metric', () => {
    const k = kpi(false, [month(4, 10), month(6, 30), month(5, 20)]);
    expect(resolveQuarterKpi(k, 2026, 2)).toMatchObject({
      source: 'computed',
      displayValue: { numeric: 30, text: null },
    });
  });

  it('only rolls up the months belonging to that quarter', () => {
    const k = kpi(true, [month(1, 10), month(4, 99)]);
    expect(resolveQuarterKpi(k, 2026, 1)?.displayValue).toEqual({
      numeric: 10,
      text: null,
    });
  });

  it('keeps years apart', () => {
    const k = kpi(true, [cell({ month: 1, year: 2025 }, 10)]);
    expect(resolveQuarterKpi(k, 2026, 1)).toBeNull();
  });

  it('returns null for a quarter with neither a cell nor months', () => {
    const k = kpi(true, [month(1, 10)]);
    expect(resolveQuarterKpi(k, 2026, 3)).toBeNull();
  });

  it('prefers a directly-entered quarter over an older monthly roll-up', () => {
    const k = kpi(true, [
      quarterCell(1, 100, T2),
      month(1, 10, T1),
      month(2, 20, T1),
    ]);
    const r = resolveQuarterKpi(k, 2026, 1);
    expect(r?.source).toBe('direct');
    expect(r?.displayValue).toEqual({ numeric: 100, text: null });
    expect(r?.computedValue).toEqual({ numeric: 30, text: null });
    expect(r?.outOfSync).toBe(true);
  });

  it('shows the monthly roll-up when a month is newer than the quarter', () => {
    const k = kpi(true, [quarterCell(1, 100, T1), month(1, 10, T2)]);
    expect(resolveQuarterKpi(k, 2026, 1)).toMatchObject({
      source: 'computed',
      displayValue: { numeric: 10, text: null },
      outOfSync: false,
    });
  });

  it('falls back to the monthly roll-up when the quarter cell is empty', () => {
    const k = kpi(true, [quarterCell(1, null, T2), month(1, 10, T1)]);
    expect(resolveQuarterKpi(k, 2026, 1)).toMatchObject({
      source: 'computed',
      displayValue: { numeric: 10, text: null },
    });
  });
});

describe('monthly values rolling through to the fiscal year', () => {
  it('sums every month of the year for a flow metric', () => {
    const k = kpi(true, [month(1, 10), month(5, 20), month(11, 30)]);
    expect(resolveAnnualKpi(k, 2026)).toMatchObject({
      source: 'computed',
      displayValue: { numeric: 60, text: null },
    });
  });

  it('snapshots the latest reported month for a stock metric', () => {
    const k = kpi(false, [month(1, 10), month(11, 30), month(5, 20)]);
    expect(resolveAnnualKpi(k, 2026)?.displayValue).toEqual({
      numeric: 30,
      text: null,
    });
  });

  it('mixes month-derived quarters with directly reported ones', () => {
    // Q1 comes from its months, Q2 was reported as a quarter.
    const k = kpi(true, [month(1, 10), month(2, 20), quarterCell(2, 50)]);
    expect(resolveAnnualKpi(k, 2026)?.displayValue).toEqual({
      numeric: 80,
      text: null,
    });
  });

  it('does not double-count a quarter that also has months', () => {
    const k = kpi(true, [
      quarterCell(1, 30, T2),
      month(1, 10, T1),
      month(2, 20, T1),
    ]);
    expect(resolveAnnualKpi(k, 2026)?.displayValue).toEqual({
      numeric: 30,
      text: null,
    });
  });

  it('lets a directly-entered fiscal year still win on recency', () => {
    const k = kpi(true, [cell({}, 999, T2), month(1, 10, T1)]);
    const r = resolveAnnualKpi(k, 2026);
    expect(r?.source).toBe('direct');
    expect(r?.displayValue).toEqual({ numeric: 999, text: null });
    expect(r?.outOfSync).toBe(true);
  });

  it('does not read a month as the fiscal-year cell', () => {
    // Both carry a NULL quarter; only the month is present here, so the year
    // must resolve to the roll-up rather than to a direct FY value.
    const k = kpi(true, [month(6, 42)]);
    expect(resolveAnnualKpi(k, 2026)?.source).toBe('computed');
  });
});

describe('customDisplayValue monthly branch', () => {
  it('reads the exact month', () => {
    const k = kpi(false, [month(3, 25), month(4, 26)]);
    expect(customDisplayValue(k, 2026, null, 3)).toEqual({
      numeric: 25,
      text: null,
    });
  });

  it('returns null for a month with no value', () => {
    const k = kpi(false, [month(3, 25)]);
    expect(customDisplayValue(k, 2026, null, 7)).toBeNull();
  });

  it('never falls back to the fiscal-year cell for a month', () => {
    const k = kpi(false, [cell({}, 999)]);
    expect(customDisplayValue(k, 2026, null, 3)).toBeNull();
  });
});

describe('editableKpiHasPeriodContent monthly axis', () => {
  const asEditable = (values: CustomKpiValue[]): EditableKpi => ({
    publicId: 'pub-1',
    code: 'arr',
    label: 'ARR',
    category: 'Unit Economics',
    valueType: 'currency',
    isFlow: false,
    isCustom: false,
    description: null,
    values,
  });

  it('counts a monthly value on every axis, since months roll up', () => {
    const k = asEditable([month(3, 25)]);
    expect(editableKpiHasPeriodContent(k, 'monthly')).toBe(true);
    expect(editableKpiHasPeriodContent(k, 'quarterly')).toBe(true);
    expect(editableKpiHasPeriodContent(k, 'annual')).toBe(true);
  });

  it('does not count a quarterly value on the monthly axis', () => {
    const k = asEditable([quarterCell(1, 25)]);
    expect(editableKpiHasPeriodContent(k, 'monthly')).toBe(false);
    expect(editableKpiHasPeriodContent(k, 'quarterly')).toBe(true);
  });

  it('does not count a fiscal-year value on the monthly axis', () => {
    const k = asEditable([cell({}, 25)]);
    expect(editableKpiHasPeriodContent(k, 'monthly')).toBe(false);
    expect(editableKpiHasPeriodContent(k, 'quarterly')).toBe(false);
    expect(editableKpiHasPeriodContent(k, 'annual')).toBe(true);
  });

  it('ignores empty monthly cells', () => {
    const k = asEditable([month(3, null)]);
    expect(editableKpiHasPeriodContent(k, 'monthly')).toBe(false);
  });
});
