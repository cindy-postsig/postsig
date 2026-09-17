import { describe, expect, it } from '@jest/globals';
import { customDisplayValue, resolveAnnualKpi } from '@/lib/v2/kpis/transforms';
import type { CustomKpiValue, RollupKpi } from '@/lib/v2/kpis/types';

const T1 = '2026-01-01T00:00:00Z';
const T2 = '2026-02-01T00:00:00Z';
const T3 = '2026-03-01T00:00:00Z';

const cell = (
  quarter: number | null,
  numeric: number | null,
  opts: {
    year?: number;
    month?: number | null;
    origin?: 'portco' | 'investor';
    updatedAt?: string | null;
    text?: string | null;
  } = {},
): CustomKpiValue => {
  const {
    year = 2026,
    month = null,
    origin = 'portco',
    updatedAt = null,
    text = null,
  } = opts;
  const scalar = { numeric, text };
  return {
    periodYear: year,
    periodQuarter: quarter,
    periodMonth: month,
    portcoValue: origin === 'portco' ? scalar : null,
    investorValue: origin === 'investor' ? scalar : null,
    displayValue: scalar,
    edited: origin === 'investor',
    portcoUpdatedAt: origin === 'portco' ? updatedAt : null,
    investorUpdatedAt: origin === 'investor' ? updatedAt : null,
  };
};

const kpi = (isFlow: boolean, values: CustomKpiValue[]): RollupKpi => ({
  isFlow,
  values,
});

describe('resolveAnnualKpi recency', () => {
  it('shows the direct FY value when the FY side is newer', () => {
    const k = kpi(true, [
      cell(null, 100, { updatedAt: T2 }),
      cell(1, 10, { updatedAt: T1 }),
      cell(2, 20, { updatedAt: T1 }),
    ]);
    const r = resolveAnnualKpi(k, 2026);
    expect(r?.source).toBe('direct');
    expect(r?.displayValue).toEqual({ numeric: 100, text: null });
    expect(r?.computedValue).toEqual({ numeric: 30, text: null });
  });

  it('shows the computed roll-up when a quarter is newer', () => {
    const k = kpi(true, [
      cell(null, 100, { updatedAt: T1 }),
      cell(1, 10, { updatedAt: T3 }),
    ]);
    const r = resolveAnnualKpi(k, 2026);
    expect(r?.source).toBe('computed');
    expect(r?.displayValue).toEqual({ numeric: 10, text: null });
    expect(r?.outOfSync).toBe(false);
  });

  it('breaks a timestamp tie in favour of the direct FY value', () => {
    const k = kpi(true, [
      cell(null, 100, { updatedAt: T2 }),
      cell(1, 100, { updatedAt: T2 }),
    ]);
    expect(resolveAnnualKpi(k, 2026)?.source).toBe('direct');
  });

  it('treats null timestamps as oldest, so an all-null tie goes to direct', () => {
    const k = kpi(true, [cell(null, 100), cell(1, 10)]);
    const r = resolveAnnualKpi(k, 2026);
    expect(r?.source).toBe('direct');
    expect(r?.displayValue).toEqual({ numeric: 100, text: null });
  });

  it('is direct with no marker for an FY-only year (no quarterly cells)', () => {
    const k = kpi(true, [cell(null, 100, { updatedAt: T1 })]);
    const r = resolveAnnualKpi(k, 2026);
    expect(r).toEqual({
      displayValue: { numeric: 100, text: null },
      source: 'direct',
      computedValue: null,
      outOfSync: false,
    });
  });

  it('returns null when the year has neither an FY value nor quarterly cells', () => {
    const k = kpi(true, [cell(1, 10, { year: 2025, updatedAt: T1 })]);
    expect(resolveAnnualKpi(k, 2026)).toBeNull();
  });

  it('falls back to the computed roll-up when the FY cell is empty', () => {
    const k = kpi(true, [
      cell(null, null, { updatedAt: T3 }),
      cell(1, 20, { updatedAt: T1 }),
      cell(2, 30, { updatedAt: T1 }),
    ]);
    const r = resolveAnnualKpi(k, 2026);
    expect(r?.source).toBe('computed');
    expect(r?.displayValue).toEqual({ numeric: 50, text: null });
  });
});

describe('resolveAnnualKpi out-of-sync marker', () => {
  it('marks a direct FY value that disagrees with the roll-up', () => {
    const k = kpi(true, [
      cell(null, 100, { updatedAt: T2 }),
      cell(1, 10, { updatedAt: T1 }),
      cell(2, 20, { updatedAt: T1 }),
    ]);
    expect(resolveAnnualKpi(k, 2026)?.outOfSync).toBe(true);
  });

  it('does not mark a direct FY value equal to the roll-up', () => {
    const k = kpi(true, [
      cell(null, 30, { updatedAt: T2 }),
      cell(1, 10, { updatedAt: T1 }),
      cell(2, 20, { updatedAt: T1 }),
    ]);
    expect(resolveAnnualKpi(k, 2026)?.outOfSync).toBe(false);
  });

  it('never marks a year with no quarterly data, even if a roll-up would differ', () => {
    const k = kpi(true, [cell(null, 100, { updatedAt: T2 })]);
    expect(resolveAnnualKpi(k, 2026)?.outOfSync).toBe(false);
  });

  it('never marks a direct FY value against an all-null flow roll-up', () => {
    const k = kpi(true, [
      cell(null, 100, { updatedAt: T2 }),
      cell(1, null, { updatedAt: T1 }),
      cell(2, null, { updatedAt: T1 }),
    ]);
    const r = resolveAnnualKpi(k, 2026);
    expect(r?.source).toBe('direct');
    expect(r?.outOfSync).toBe(false);
  });
});

describe('resolveAnnualKpi roll-up math', () => {
  it('sums the quarters for a flow computed value', () => {
    const k = kpi(true, [
      cell(1, 10, { updatedAt: T1 }),
      cell(2, 20, { updatedAt: T1 }),
      cell(3, 30, { updatedAt: T1 }),
    ]);
    expect(resolveAnnualKpi(k, 2026)).toMatchObject({
      source: 'computed',
      displayValue: { numeric: 60, text: null },
    });
  });

  it('takes the latest reported quarter for a stock computed value', () => {
    const k = kpi(false, [
      cell(1, 10, { updatedAt: T1 }),
      cell(3, 30, { updatedAt: T1 }),
      cell(2, 20, { updatedAt: T1 }),
    ]);
    expect(resolveAnnualKpi(k, 2026)).toMatchObject({
      source: 'computed',
      displayValue: { numeric: 30, text: null },
    });
  });

  it('collapses all-null flow quarters to a blank scalar, not null', () => {
    const k = kpi(true, [
      cell(1, null, { updatedAt: T1 }),
      cell(2, null, { updatedAt: T1 }),
    ]);
    expect(resolveAnnualKpi(k, 2026)?.displayValue).toEqual({
      numeric: null,
      text: null,
    });
  });
});

describe('resolveAnnualKpi FY-cell provenance', () => {
  it('keeps the investor-over-portco display value baked into the FY cell', () => {
    const fy: CustomKpiValue = {
      periodYear: 2026,
      periodQuarter: null,
      periodMonth: null,
      portcoValue: { numeric: 80, text: null },
      investorValue: { numeric: 100, text: null },
      displayValue: { numeric: 100, text: null },
      edited: true,
      portcoUpdatedAt: T1,
      investorUpdatedAt: T2,
    };
    const r = resolveAnnualKpi(kpi(false, [fy]), 2026);
    expect(r?.source).toBe('direct');
    expect(r?.displayValue).toEqual({ numeric: 100, text: null });
  });
});

describe('customDisplayValue quarterly branch', () => {
  it('reads the exact quarter regardless of an FY row for the year', () => {
    const k = kpi(true, [
      cell(null, 999, { updatedAt: T3 }),
      cell(2, 20, { updatedAt: T1 }),
    ]);
    expect(customDisplayValue(k, 2026, 2)).toEqual({ numeric: 20, text: null });
  });
});
