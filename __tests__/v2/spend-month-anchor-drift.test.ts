import {
  sliceActual,
  sliceAmortized,
  resolveWindow,
  type FiscalConfig,
} from '@/lib/v2/spend/slicers';
import type { FeeSegment } from '@/lib/v2/spend';

/**
 * A term starting on the 29th, 30th, or 31st crosses a February, and
 * `addUTCMonths` clamps to the target month's last day. Stepping from the
 * previous cursor rather than a fixed anchor made that clamp cumulative: the
 * walk dropped to the 28th at February and never climbed back, which left
 * room for a thirteenth month inside a twelve-month term. The divisor stayed
 * 12, so the segment booked 13/12 of its fee — a $144,000 contract reported
 * $156,000, and a 3% allocation of it read $4,680 instead of $4,320
 * (psk-1846 QA).
 *
 * Both monthly-stepping slicers had it, so both are pinned here.
 */

const FISCAL: FiscalConfig = { startMonth: 1 };
// resolveWindow takes asOf for the relative presets; a dated window ignores it.
const ASOF = new Date('2026-01-01T00:00:00.000Z');

const segment = (from: string, to: string, fee: number): FeeSegment =>
  ({ productId: 1, from, to, fee }) as FeeSegment;

const total = (items: Array<{ value: number }>) =>
  items.reduce((sum, item) => sum + item.value, 0);

describe('a term anchored past the 28th conserves its fee', () => {
  // 2025-06-30 through 2026-06-29 inclusive: exactly twelve months, and the
  // window that reproduced the report.
  const TERM = segment('2025-06-30', '2026-06-30', 144_000);
  const window = resolveWindow(
    { from: '2025-06-30', to: '2026-06-30' },
    ASOF,
    FISCAL,
  );

  it('amortizes across twelve months, not thirteen', () => {
    const items = sliceAmortized([TERM], window, 'month', 'monthly', FISCAL);

    expect(items).toHaveLength(12);
    expect(total(items)).toBe(144_000);
  });

  it('bills twelve monthly cycles, not thirteen', () => {
    const items = sliceActual(
      [TERM],
      window,
      'month',
      { billingMonths: 1 },
      FISCAL,
    );

    expect(items).toHaveLength(12);
    expect(total(items)).toBe(144_000);
  });

  it('lands one bucket per calendar month of the term', () => {
    const items = sliceAmortized([TERM], window, 'month', 'monthly', FISCAL);

    // June 2025 through May 2026. June 2026 is one day of the window and no
    // month of the term, so it must not appear at all.
    expect(items.map((item) => item.period).sort()).toEqual([
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
    ]);
  });

  it('conserves the fee whatever day of the month the term starts on', () => {
    for (const day of ['28', '29', '30', '31']) {
      const start = `2025-01-${day}`;
      const end = `2026-01-${day}`;
      const items = sliceAmortized(
        [segment(start, end, 120_000)],
        resolveWindow({ from: start, to: end }, ASOF, FISCAL),
        'month',
        'monthly',
        FISCAL,
      );

      expect({ day, months: items.length, total: total(items) }).toEqual({
        day,
        months: 12,
        total: 120_000,
      });
    }
  });
});
