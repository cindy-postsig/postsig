import { pickLatestSnapshot } from '@/lib/v2/inv';

describe('pickLatestSnapshot', () => {
  const snap = (id: number, snapshotDate: string) => ({ id, snapshotDate });

  it('returns null when there are no snapshots', () => {
    expect(pickLatestSnapshot([])).toBeNull();
  });

  it('returns the only snapshot', () => {
    const only = snap(7, '2024-01-01');
    expect(pickLatestSnapshot([only])).toBe(only);
  });

  it('picks the newest date even when an older row has a higher id', () => {
    const older = snap(99, '2023-06-30');
    const newer = snap(2, '2024-02-01');

    expect(pickLatestSnapshot([older, newer])).toBe(newer);
  });

  it('breaks a date tie on the highest id', () => {
    // (company_id, snapshot_date) is not unique — a round_close and a
    // portfolio_import snapshot legitimately share a date. Overrides are keyed
    // by row id, so this tie-break must match the read path's ORDER BY.
    const lower = snap(41, '2025-05-01');
    const higher = snap(42, '2025-05-01');

    expect(pickLatestSnapshot([lower, higher])).toBe(higher);
  });

  it('is independent of input order', () => {
    const lower = snap(41, '2025-05-01');
    const higher = snap(42, '2025-05-01');

    expect(pickLatestSnapshot([lower, higher])?.id).toBe(42);
    expect(pickLatestSnapshot([higher, lower])?.id).toBe(42);
  });
});
