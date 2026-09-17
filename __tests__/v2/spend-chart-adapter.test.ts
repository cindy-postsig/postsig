import {
  toChartData,
  toTcvChartData,
  toCommitmentChartData,
  formatPeriodLabel,
} from '@/components/budget/SpendChart/toChartData';
import type { SpendQueryResponse } from '@/app/api/v2/handlers/spend/query';

function response(
  overrides: Partial<SpendQueryResponse> = {},
): SpendQueryResponse {
  return {
    kind: 'spend',
    basis: 'amortized',
    currency: 'preconverted-usd',
    targetCurrency: 'USD',
    window: { start: '2026-01-01', end: '2027-01-01', fiscalYear: 2026 },
    periods: ['2026-01', '2026-02', '2026-03'],
    items: [],
    refs: {},
    ...overrides,
  };
}

describe('formatPeriodLabel', () => {
  it('formats month and quarter keys', () => {
    expect(formatPeriodLabel('2026-07')).toBe("Jul '26");
    expect(formatPeriodLabel('2026-Q3')).toBe("Q3 '26");
    expect(formatPeriodLabel('FY2026')).toBe('FY2026');
  });
});

describe('toChartData', () => {
  it('zero-fills every period and accumulates items with ref labels', () => {
    const data = toChartData(
      response({
        items: [
          { period: '2026-02', groupKey: '10', value: 100 },
          { period: '2026-02', groupKey: '20', value: 50.5 },
        ],
        refs: {
          '10': {
            label: 'Acme',
            vendorDomain: 'acme.com',
            productName: 'Feed',
          },
        },
      }),
    );

    expect(data.points.map((p) => p.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(data.points.map((p) => p.value)).toEqual([0, 150.5, 0]);

    const feb = data.points[1];
    expect(feb.slices).toEqual([
      {
        groupKey: '10',
        label: 'Acme',
        vendorDomain: 'acme.com',
        productName: 'Feed',
        value: 100,
      },
      {
        groupKey: '20',
        label: '20',
        vendorDomain: undefined,
        productName: undefined,
        value: 50.5,
      },
    ]);
  });

  it('carries the engine native stamps onto slices (psk-1796)', () => {
    const data = toChartData(
      response({
        currency: 'base',
        targetCurrency: 'EUR',
        items: [
          {
            period: '2026-02',
            groupKey: '10',
            value: 92,
            nativeValue: 100,
            nativeCurrency: 'USD',
          },
          // A EUR contract under the EUR base: native === value.
          {
            period: '2026-02',
            groupKey: '20',
            value: 50,
            nativeValue: 50,
            nativeCurrency: 'EUR',
          },
        ],
        refs: {},
      }),
    );

    const feb = data.points.find((p) => p.key === '2026-02')!;
    // The bar total stays the converted aggregate...
    expect(feb.value).toBe(142);
    // ...while each slice keeps the amount its contract is priced in.
    expect(feb.slices.map((s) => [s.nativeValue, s.nativeCurrency])).toEqual([
      [100, 'USD'],
      [50, 'EUR'],
    ]);
  });

  it('drops items outside the period axis rather than inventing buckets', () => {
    const data = toChartData(
      response({ items: [{ period: '2030-01', groupKey: '1', value: 7 }] }),
    );
    expect(data.points.map((p) => p.value)).toEqual([0, 0, 0]);
  });
});

describe('toCommitmentChartData', () => {
  it('splits kinds into stacked series with the total in value, dropping zero events', () => {
    const data = toCommitmentChartData(
      response({
        kind: 'commitments',
        items: [
          { period: '2026-02', groupKey: '10', value: 100, kind: 'new' },
          { period: '2026-02', groupKey: '20', value: 40, kind: 'renewal' },
          { period: '2026-02', groupKey: '30', value: 0, kind: 'new' },
        ],
        refs: { '10': { label: 'Acme' } },
      }),
    );

    expect(data.points.map((p) => p.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    const feb = data.points[1];
    expect(feb).toMatchObject({ value: 140, newValue: 100, renewalValue: 40 });
    expect(feb.slices.map((s) => [s.groupKey, s.kind])).toEqual([
      ['10', 'new'],
      ['20', 'renewal'],
    ]);
  });

  it("stacks 'multi-year' slices with renewals, keeping the badge kind", () => {
    const data = toCommitmentChartData(
      response({
        kind: 'commitments',
        items: [
          { period: '2026-02', groupKey: '10', value: 100, kind: 'new' },
          { period: '2026-02', groupKey: '11', value: 60, kind: 'multi-year' },
          { period: '2026-02', groupKey: '20', value: 40, kind: 'renewal' },
        ],
        refs: {},
      }),
    );

    const feb = data.points[1];
    expect(feb).toMatchObject({ value: 200, newValue: 100, renewalValue: 100 });
    expect(feb.slices.map((s) => [s.groupKey, s.kind])).toEqual([
      ['10', 'new'],
      ['11', 'multi-year'],
      ['20', 'renewal'],
    ]);
  });
});

describe('toCommitmentChartData native stamps', () => {
  it('carries nativeValue/nativeCurrency onto commitment slices (psk-1796)', () => {
    const data = toCommitmentChartData(
      response({
        kind: 'commitments',
        currency: 'base',
        targetCurrency: 'EUR',
        items: [
          {
            period: '2026-02',
            groupKey: '10',
            value: 800,
            nativeValue: 1000,
            nativeCurrency: 'USD',
            kind: 'renewal',
          },
        ],
        refs: {},
      }),
    );

    const feb = data.points.find((p) => p.key === '2026-02')!;
    expect(feb.slices).toHaveLength(1);
    expect(feb.slices[0].kind).toBe('renewal');
    expect(feb.slices[0].nativeValue).toBe(1000);
    expect(feb.slices[0].nativeCurrency).toBe('USD');
  });
});

describe('toTcvChartData', () => {
  const monthsOf = (start: number, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const month = start + i;
      const year = 2026 + Math.floor((month - 1) / 12);
      return `${year}-${String(((month - 1) % 12) + 1).padStart(2, '0')}`;
    });

  it('trims empty leading and trailing periods, staying monthly for short spans', () => {
    const data = toTcvChartData(
      response({
        kind: 'tcv',
        periods: monthsOf(1, 12),
        items: [
          { period: '2026-03', groupKey: '1', value: 10 },
          { period: '2026-06', groupKey: '2', value: 20 },
        ],
      }),
    );
    expect(data.isMonthly).toBe(true);
    expect(data.points.map((p) => p.key)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });

  it('collapses to calendar quarters when the populated span exceeds 15 months', () => {
    const data = toTcvChartData(
      response({
        kind: 'tcv',
        periods: monthsOf(1, 24),
        items: [
          { period: '2026-01', groupKey: '1', value: 10 },
          { period: '2026-02', groupKey: '2', value: 5 },
          { period: '2027-06', groupKey: '3', value: 20 },
        ],
      }),
    );
    expect(data.isMonthly).toBe(false);
    expect(data.points[0]).toMatchObject({ key: '2026-Q1', value: 15 });
    expect(data.points[data.points.length - 1]).toMatchObject({
      key: '2027-Q2',
      value: 20,
    });
    expect(data.points[0].slices.map((s) => s.groupKey)).toEqual(['1', '2']);
  });
});
