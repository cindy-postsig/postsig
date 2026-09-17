import { describe, expect, it } from '@jest/globals';

import type { CapTableSnapshot } from '@/app/(app)/(investor)/investor/types';

import {
  buildPreferredStageRows,
  percentOfTotal,
  snapshotsFromRestatementBoundary,
} from '@/app/(app)/(investor)/investor/cap-table-utils';

function makeSnapshot(
  overrides: Partial<CapTableSnapshot> = {},
): CapTableSnapshot {
  return {
    asOfDate: '2024-01-01',
    snapshotTypeCode: null,
    financingRoundId: null,
    securities: [],
    fullyDilutedTotal: 0,
    totalOutstanding: null,
    impliedValuation: null,
    sharePrice: null,
    commonAuthorized: null,
    commonOutstanding: null,
    preferredAuthorized: null,
    preferredOutstanding: null,
    optionPoolAuthorized: null,
    optionPoolOutstanding: null,
    optionPoolAvailable: null,
    optionPoolFdPercent: null,
    ourTotalShares: null,
    ourCommonShares: null,
    ourPreferredShares: null,
    ourPreferredPct: null,
    ourOwnershipPercent: null,
    ourFdOwnershipPercent: null,
    ourVotingPct: null,
    stageCode: '',
    stageName: '',
    ...overrides,
  };
}

describe('percentOfTotal', () => {
  it('returns percentage of units relative to total', () => {
    expect(percentOfTotal(25, 100)).toBe(25);
  });

  it('returns 0 when total is zero', () => {
    expect(percentOfTotal(10, 0)).toBe(0);
  });

  it('returns 0 when total is negative', () => {
    expect(percentOfTotal(10, -5)).toBe(0);
  });
});

describe('buildPreferredStageRows', () => {
  it('returns empty array for empty snapshots', () => {
    expect(buildPreferredStageRows([], 1000)).toEqual([]);
  });

  it('builds rows from single snapshot per stage', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 100,
      }),
      makeSnapshot({
        stageName: 'Series A',
        stageCode: 'SER_A',
        preferredOutstanding: 350,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    // reversed: Series A first, then Seed
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Series A');
    expect(rows[0].units).toBe(250); // 350 - 100
    expect(rows[1].name).toBe('Seed');
    expect(rows[1].units).toBe(100); // 100 - 0
  });

  it('keeps latest snapshot when duplicates exist for a stage', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 100,
      }),
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 200,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Seed');
    expect(rows[0].units).toBe(200); // latest snapshot's value
  });

  it('uses stageCode as fallback when stageName is empty', () => {
    const snapshots = [
      makeSnapshot({
        stageName: '',
        stageCode: 'SEED',
        preferredOutstanding: 100,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('SEED');
  });

  it('skips snapshots with no label', () => {
    const snapshots = [
      makeSnapshot({
        stageName: '',
        stageCode: '',
        preferredOutstanding: 100,
      }),
      makeSnapshot({
        stageName: 'Series A',
        stageCode: 'SER_A',
        preferredOutstanding: 300,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Series A');
    expect(rows[0].units).toBe(300);
  });

  it('skips stages with zero units', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 100,
      }),
      makeSnapshot({
        stageName: 'Series A',
        stageCode: 'SER_A',
        preferredOutstanding: 100, // same as prev → 0 delta
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Seed');
  });

  it('computes fdPercent correctly', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 250,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows[0].fdPercent).toBe(25);
  });

  it('computes myUnits and myFdPercent from ourPreferredPct', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 200,
        ourPreferredPct: 0.5,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows[0].myUnits).toBe(100); // 200 * 0.5
    expect(rows[0].myFdPercent).toBe(10); // 100/1000 * 100
  });

  it('leaves myUnits undefined when ourPreferredPct is null', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 200,
        ourPreferredPct: null,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows[0].myUnits).toBeUndefined();
    expect(rows[0].myFdPercent).toBeUndefined();
  });

  it('returns rows in reverse order (latest stage first)', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 100,
      }),
      makeSnapshot({
        stageName: 'Series A',
        stageCode: 'SER_A',
        preferredOutstanding: 300,
      }),
      makeSnapshot({
        stageName: 'Series B',
        stageCode: 'SER_B',
        preferredOutstanding: 600,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows.map((r) => r.name)).toEqual(['Series B', 'Series A', 'Seed']);
  });

  it('deduplicates by stageName across multiple stages', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 100,
      }),
      makeSnapshot({
        stageName: 'Series A',
        stageCode: 'SER_A',
        preferredOutstanding: 300,
      }),
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 150,
      }),
      makeSnapshot({
        stageName: 'Series A',
        stageCode: 'SER_A',
        preferredOutstanding: 400,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    // Seed kept at index 0, Series A at index 1 (insertion order preserved)
    // Latest values: Seed=150, Series A=400
    // Deltas: Seed=150-0=150, Series A=400-150=250
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Series A');
    expect(rows[0].units).toBe(250);
    expect(rows[1].name).toBe('Seed');
    expect(rows[1].units).toBe(150);
  });

  it('sets id using stageCode when available', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed Round',
        stageCode: 'SEED',
        preferredOutstanding: 100,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows[0].id).toBe('preferred-SEED');
  });

  it('sets id using label when stageCode is empty', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed Round',
        stageCode: '',
        preferredOutstanding: 100,
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    expect(rows[0].id).toBe('preferred-Seed Round');
  });

  it('clamps negative deltas to zero', () => {
    const snapshots = [
      makeSnapshot({
        stageName: 'Seed',
        stageCode: 'SEED',
        preferredOutstanding: 200,
      }),
      makeSnapshot({
        stageName: 'Series A',
        stageCode: 'SER_A',
        preferredOutstanding: 100, // less than previous → negative delta
      }),
    ];

    const rows = buildPreferredStageRows(snapshots, 1000);

    // Seed: 200, Series A: max(100-200, 0) = 0 → skipped
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Seed');
  });
});

describe('snapshotsFromRestatementBoundary', () => {
  // A company that raises Seed and Series A, then recapitalizes: the
  // reclassification snapshot renames Series A Preferred to Series A-1
  // Preferred and is authoritative for what exists afterwards.
  const seed = makeSnapshot({
    asOfDate: '2022-01-01',
    stageCode: 'seed',
    stageName: 'Seed',
    preferredOutstanding: 100,
    securities: [
      {
        id: 'sec-seed',
        name: 'Seed Preferred',
        securityType: 'preferred',
        units: 100,
        fdPercent: 10,
      },
    ],
  });
  const seriesA = makeSnapshot({
    asOfDate: '2023-01-01',
    stageCode: 'series_a',
    stageName: 'Series A',
    preferredOutstanding: 300,
    securities: [
      {
        id: 'sec-a',
        name: 'Series A Preferred',
        securityType: 'preferred',
        units: 200,
        fdPercent: 20,
      },
    ],
  });
  const recap = makeSnapshot({
    asOfDate: '2024-01-01',
    stageCode: 'reclassification',
    stageName: 'Reclassification',
    preferredOutstanding: 500,
    securities: [
      {
        id: 'sec-a1',
        name: 'Series A-1 Preferred',
        securityType: 'preferred',
        units: 500,
        fdPercent: 50,
      },
    ],
  });
  const seriesB = makeSnapshot({
    asOfDate: '2025-01-01',
    stageCode: 'series_b',
    stageName: 'Series B',
    preferredOutstanding: 800,
  });

  it('excludes pre-event snapshots for a post-event date', () => {
    const result = snapshotsFromRestatementBoundary(
      [seed, seriesA, recap, seriesB],
      '2025-01-01',
    );

    expect(result.map((s) => s.stageCode)).toEqual([
      'reclassification',
      'series_b',
    ]);
  });

  it('includes pre-event snapshots for a pre-event date', () => {
    const result = snapshotsFromRestatementBoundary(
      [seed, seriesA, recap, seriesB],
      '2023-01-01',
    );

    expect(result.map((s) => s.stageCode)).toEqual(['seed', 'series_a']);
  });

  it('returns every snapshot up to the date when none are synthetic', () => {
    const result = snapshotsFromRestatementBoundary(
      [seed, seriesA, seriesB],
      '2025-01-01',
    );

    expect(result.map((s) => s.stageCode)).toEqual([
      'seed',
      'series_a',
      'series_b',
    ]);
  });

  it('uses the most recent synthetic snapshot at or before the date', () => {
    const split = makeSnapshot({
      asOfDate: '2026-01-01',
      stageCode: 'reverse_split',
      stageName: 'Reverse Split',
      preferredOutstanding: 80,
    });
    const result = snapshotsFromRestatementBoundary(
      [seed, seriesA, recap, seriesB, split],
      '2026-06-01',
    );

    expect(result.map((s) => s.stageCode)).toEqual(['reverse_split']);
  });

  it('includes the boundary snapshot itself', () => {
    const result = snapshotsFromRestatementBoundary(
      [seed, seriesA, recap],
      '2024-01-01',
    );

    expect(result.map((s) => s.stageCode)).toEqual(['reclassification']);
  });

  it('sorts ascending and ignores snapshots after the date', () => {
    const result = snapshotsFromRestatementBoundary(
      [seriesB, seed, seriesA],
      '2023-06-01',
    );

    expect(result.map((s) => s.asOfDate)).toEqual(['2022-01-01', '2023-01-01']);
  });

  it('drops classes restated away by the boundary snapshot', () => {
    // Mirrors the securities accumulation in CapTableContent: later snapshots
    // override earlier ones by class name, so without the boundary the renamed
    // "Series A Preferred" would keep rendering with stale pre-event units.
    const accumulate = (snapshots: (typeof seed)[]) => {
      const byName = new Map<string, number>();
      for (const snap of snapshots) {
        for (const sec of snap.securities.filter(
          (s) => s.securityType === 'preferred',
        )) {
          byName.set(sec.name, sec.units);
        }
      }
      return byName;
    };

    const restated = accumulate(
      snapshotsFromRestatementBoundary([seed, seriesA, recap], '2024-01-01'),
    );
    expect([...restated.keys()]).toEqual(['Series A-1 Preferred']);
    expect(restated.get('Seed Preferred')).toBeUndefined();
    expect(restated.get('Series A Preferred')).toBeUndefined();
  });

  it('gives the boundary row the full post-event preferred total', () => {
    // buildPreferredStageRows deltas against a 0 baseline, so starting at the
    // boundary makes the synthetic row carry the whole restated total instead
    // of a delta against pre-event (or pre-split-scale) numbers.
    const rows = buildPreferredStageRows(
      snapshotsFromRestatementBoundary(
        [seed, seriesA, recap, seriesB],
        '2025-01-01',
      ),
      1000,
    );

    // reversed: Series B first, then the boundary row
    expect(rows.map((r) => r.name)).toEqual(['Series B', 'Reclassification']);
    expect(rows.find((r) => r.name === 'Reclassification')?.units).toBe(500);
    // Series B deltas against post-event numbers: 800 - 500
    expect(rows.find((r) => r.name === 'Series B')?.units).toBe(300);
  });
});
