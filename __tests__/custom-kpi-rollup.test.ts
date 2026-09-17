import { describe, expect, it } from '@jest/globals';
import { customDisplayValue, formatKpiDisplay } from '@/lib/v2/kpis/transforms';
import type { CompanyCustomKpi } from '@/lib/v2/kpis/types';

const kpi = (
  isFlow: boolean,
  values: CompanyCustomKpi['values'],
): CompanyCustomKpi => ({
  publicId: 'pub-1',
  label: 'Revenue',
  category: 'Unit Economics',
  valueType: 'currency',
  isFlow,
  values,
});

const q = (year: number, quarter: number, numeric: number | null) => ({
  periodYear: year,
  periodQuarter: quarter,
  periodMonth: null,
  portcoValue: null,
  investorValue: { numeric, text: null },
  displayValue: { numeric, text: null },
  edited: numeric != null,
  portcoUpdatedAt: null,
  investorUpdatedAt: null,
});

describe('customDisplayValue', () => {
  it('returns the exact quarter for a quarterly period', () => {
    const k = kpi(false, [q(2026, 1, 10), q(2026, 2, 20)]);
    expect(customDisplayValue(k, 2026, 2)).toEqual({ numeric: 20, text: null });
  });

  it('returns null when the quarter has no value', () => {
    const k = kpi(false, [q(2026, 1, 10)]);
    expect(customDisplayValue(k, 2026, 3)).toBeNull();
  });

  it('uses the latest quarter for a point-in-time annual rollup', () => {
    const k = kpi(false, [q(2026, 1, 10), q(2026, 3, 30), q(2026, 2, 20)]);
    expect(customDisplayValue(k, 2026, null)).toEqual({
      numeric: 30,
      text: null,
    });
  });

  it('sums the quarters for a flow annual rollup', () => {
    const k = kpi(true, [q(2026, 1, 10), q(2026, 2, 20), q(2026, 3, 30)]);
    expect(customDisplayValue(k, 2026, null)).toEqual({
      numeric: 60,
      text: null,
    });
  });

  it('sums only non-null numerics for a flow rollup', () => {
    const k = kpi(true, [q(2026, 1, 10), q(2026, 2, null)]);
    expect(customDisplayValue(k, 2026, null)).toEqual({
      numeric: 10,
      text: null,
    });
  });

  it('returns null when the year has no quarterly values', () => {
    const k = kpi(true, [q(2025, 1, 10)]);
    expect(customDisplayValue(k, 2026, null)).toBeNull();
  });

  it('prefers a value entered directly for the fiscal year over a roll-up', () => {
    const k = kpi(true, [
      { ...q(2026, 1, 10), periodQuarter: null },
      q(2026, 2, 20),
      q(2026, 3, 30),
    ]);
    expect(customDisplayValue(k, 2026, null)).toEqual({
      numeric: 10,
      text: null,
    });
  });

  it('falls back to the quarterly roll-up when the annual cell is empty', () => {
    const k = kpi(true, [
      {
        ...q(2026, 1, null),
        periodQuarter: null,
        displayValue: { numeric: null, text: null },
      },
      q(2026, 2, 20),
      q(2026, 3, 30),
    ]);
    expect(customDisplayValue(k, 2026, null)).toEqual({
      numeric: 50,
      text: null,
    });
  });
});

describe('formatKpiDisplay', () => {
  it('formats percents', () => {
    expect(formatKpiDisplay('percent', 112, null)).toBe('112%');
  });

  it('formats plain numbers with grouping', () => {
    expect(formatKpiDisplay('number', 1234, null)).toBe(
      (1234).toLocaleString(),
    );
  });

  it('falls back to text when numeric is absent', () => {
    expect(formatKpiDisplay('text', null, 'Strong')).toBe('Strong');
  });

  it('shows a dash for blank values', () => {
    expect(formatKpiDisplay('number', null, '  ')).toBe('-');
  });
});
