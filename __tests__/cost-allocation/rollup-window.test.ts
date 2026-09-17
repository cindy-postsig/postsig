import {
  ENGINE_WINDOW_BOUNDS,
  REPORT_PERIODS,
  allTimeWindow,
  resolveReportWindow,
  resolveRollupWindow,
} from '@/lib/v2/cost-allocation/report-window';

import { resolveWindow } from '@/lib/v2/spend/window';

const TODAY = new Date('2026-08-25T15:00:00Z');
const JAN = { startMonth: 1 };
const APR = { startMonth: 4 };
const OCT = { startMonth: 10 };

describe('resolveRollupWindow', () => {
  it('offers exactly the presets both reports share, plus custom', () => {
    expect(REPORT_PERIODS).toEqual([
      'all',
      'ytd',
      'current-fy',
      'projected-fy',
      'this-quarter',
      'last-quarter',
      'this-month',
      'last-month',
      'custom',
    ]);
  });

  it('shares the calendar presets with the invoice report', () => {
    for (const period of [
      'ytd',
      'this-quarter',
      'last-quarter',
      'this-month',
      'last-month',
    ] as const) {
      expect(resolveRollupWindow({ period }, TODAY, JAN)).toEqual({
        period,
        window: resolveReportWindow(period, TODAY),
        custom: null,
      });
    }
  });

  it("Current FY and Projected FY are the org's whole fiscal years — the engine's currentFY and nextFY windows", () => {
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    for (const [fiscalConfig, current, projected] of [
      [
        JAN,
        { start: '2026-01-01', end: '2027-01-01' },
        { start: '2027-01-01', end: '2028-01-01' },
      ],
      [
        APR,
        { start: '2026-04-01', end: '2027-04-01' },
        { start: '2027-04-01', end: '2028-04-01' },
      ],
      // August sits in the fiscal year that started last October.
      [
        OCT,
        { start: '2025-10-01', end: '2026-10-01' },
        { start: '2026-10-01', end: '2027-10-01' },
      ],
    ] as const) {
      for (const [period, expected, engineWindow] of [
        ['current-fy', current, 'currentFY'],
        ['projected-fy', projected, 'nextFY'],
      ] as const) {
        expect(resolveRollupWindow({ period }, TODAY, fiscalConfig)).toEqual({
          period,
          window: expected,
          custom: null,
        });
        const engine = resolveWindow(engineWindow, TODAY, fiscalConfig);
        expect({ start: iso(engine.start), end: iso(engine.end) }).toEqual(
          expected,
        );
      }
    }
  });

  it('bounds All Time to what the engine can price and enumerate', () => {
    expect(resolveRollupWindow({ period: 'all' }, TODAY, JAN)).toEqual({
      period: 'all',
      window: ENGINE_WINDOW_BOUNDS,
      custom: null,
    });
  });

  it('defaults to the current fiscal year for an unknown or missing preset', () => {
    expect(resolveRollupWindow({}, TODAY, JAN).period).toBe('current-fy');
    // 'last-quarter' used to stand in for an unknown preset here; it is a real
    // one now, so the example has to be something the summary genuinely lacks.
    expect(
      resolveRollupWindow({ period: 'this-week' }, TODAY, JAN).period,
    ).toBe('current-fy');
  });

  it('turns an inclusive custom range into a half-open window and keeps the typed dates', () => {
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '2026-02-10', to: '2026-03-31' },
        TODAY,
        JAN,
      ),
    ).toEqual({
      period: 'custom',
      window: { start: '2026-02-10', end: '2026-04-01' },
      custom: { from: '2026-02-10', to: '2026-03-31' },
    });
  });

  it('clamps a custom range to the engine bounds', () => {
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '1990-01-01', to: '2150-06-30' },
        TODAY,
        JAN,
      ).window,
    ).toEqual(ENGINE_WINDOW_BOUNDS);
    // The last representable day clamps too, instead of overflowing the
    // exclusive-end increment into an expanded-year string.
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '2050-01-01', to: '9999-12-31' },
        TODAY,
        JAN,
      ).window,
    ).toEqual({ start: '2050-01-01', end: ENGINE_WINDOW_BOUNDS.end });
  });

  it('rejects a custom range lying entirely outside the engine bounds instead of inverting it', () => {
    const fallback = resolveRollupWindow({ period: 'current-fy' }, TODAY, JAN);
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '1990-01-01', to: '1995-01-01' },
        TODAY,
        JAN,
      ),
    ).toEqual(fallback);
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '2150-01-01', to: '2150-06-30' },
        TODAY,
        JAN,
      ),
    ).toEqual(fallback);
    // A range touching the bound from outside is still empty, not inverted.
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '1999-12-01', to: '1999-12-31' },
        TODAY,
        JAN,
      ),
    ).toEqual(fallback);
    // Overlapping the bound keeps the overlap.
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '1999-12-01', to: '2000-01-31' },
        TODAY,
        JAN,
      ).window,
    ).toEqual({ start: '2000-01-01', end: '2000-02-01' });
  });

  it('falls back to the default preset for a missing, malformed, or reversed custom range', () => {
    const fallback = resolveRollupWindow({ period: 'current-fy' }, TODAY, JAN);
    expect(resolveRollupWindow({ period: 'custom' }, TODAY, JAN)).toEqual(
      fallback,
    );
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '2026-02-30', to: '2026-03-01' },
        TODAY,
        JAN,
      ),
    ).toEqual(fallback);
    expect(
      resolveRollupWindow(
        { period: 'custom', from: 'yesterday', to: '2026-03-01' },
        TODAY,
        JAN,
      ),
    ).toEqual(fallback);
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '2026-03-02', to: '2026-03-01' },
        TODAY,
        JAN,
      ),
    ).toEqual(fallback);
  });

  it('accepts a single-day custom range', () => {
    expect(
      resolveRollupWindow(
        { period: 'custom', from: '2026-03-01', to: '2026-03-01' },
        TODAY,
        JAN,
      ).window,
    ).toEqual({ start: '2026-03-01', end: '2026-03-02' });
  });
});

describe('allTimeWindow', () => {
  it('spans the fiscal years the org holds contracts in, not the engine bounds', () => {
    expect(
      allTimeWindow(
        { earliestStart: '2021-06-01', latestEnd: '2027-05-31' },
        JAN,
        TODAY,
      ),
    ).toEqual({ start: '2021-01-01', end: '2028-01-01' });
  });

  it('snaps to the org fiscal year rather than the calendar year', () => {
    expect(
      allTimeWindow(
        { earliestStart: '2021-06-01', latestEnd: '2027-05-31' },
        APR,
        TODAY,
      ),
    ).toEqual({ start: '2021-04-01', end: '2028-04-01' });
  });

  it('always covers the current fiscal year, even when every contract has lapsed', () => {
    expect(
      allTimeWindow(
        { earliestStart: '2019-01-01', latestEnd: '2020-12-31' },
        JAN,
        TODAY,
      ),
    ).toEqual({ start: '2019-01-01', end: '2027-01-01' });
  });

  it('falls back to the current fiscal year when the org has no recorded dates', () => {
    expect(
      allTimeWindow({ earliestStart: null, latestEnd: null }, JAN, TODAY),
    ).toEqual({ start: '2026-01-01', end: '2027-01-01' });
  });

  it('backstops a mis-keyed far-future term end at the engine bounds', () => {
    const window = allTimeWindow(
      { earliestStart: '2021-01-01', latestEnd: '9999-12-31' },
      JAN,
      TODAY,
    );
    expect(window.end).toBe(ENGINE_WINDOW_BOUNDS.end);
  });

  it('treats a malformed term date as absent rather than throwing', () => {
    // "2026-99-99" string-sorts as a plausible future date but parses to an
    // Invalid Date, which used to reach toISOString and throw RangeError.
    expect(
      allTimeWindow(
        { earliestStart: '2021-01-01', latestEnd: '2026-99-99' },
        JAN,
        TODAY,
      ),
    ).toEqual({ start: '2021-01-01', end: '2027-01-01' });

    expect(
      allTimeWindow(
        { earliestStart: 'not-a-date', latestEnd: '2027-05-31' },
        JAN,
        TODAY,
      ),
    ).toEqual({ start: '2026-01-01', end: '2028-01-01' });

    expect(() =>
      allTimeWindow(
        { earliestStart: '2021-02-30', latestEnd: '2026-13-01' },
        JAN,
        TODAY,
      ),
    ).not.toThrow();
  });

  it('never returns the full engine bounds for an ordinary org', () => {
    const window = allTimeWindow(
      { earliestStart: '2021-06-01', latestEnd: '2027-05-31' },
      JAN,
      TODAY,
    );
    expect(window).not.toEqual(ENGINE_WINDOW_BOUNDS);
    expect(window.start > ENGINE_WINDOW_BOUNDS.start).toBe(true);
    expect(window.end < ENGINE_WINDOW_BOUNDS.end).toBe(true);
  });
});
