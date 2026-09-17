import { fetchAllRows, parseBackfillArgs } from '@/scripts/lib/backfill-cli';

describe('parseBackfillArgs', () => {
  it('defaults to every organization, .env.local, and a real run', () => {
    expect(parseBackfillArgs([])).toEqual({
      org: null,
      envPath: '.env.local',
      dryRun: false,
    });
  });

  it('reads --org, --env, and --dry-run', () => {
    expect(
      parseBackfillArgs(['--dry-run', '--org', 'org-1', '--env', '.env.prod']),
    ).toEqual({ org: 'org-1', envPath: '.env.prod', dryRun: true });
  });

  // A bare or empty --org must not widen a production backfill from one
  // tenant to all: the callers filter with `if (org)`.
  it('rejects --org without a value', () => {
    expect(() => parseBackfillArgs(['--org'])).toThrow(
      '--org requires a value',
    );
    expect(() => parseBackfillArgs(['--org', '--dry-run'])).toThrow(
      '--org requires a value',
    );
    expect(() => parseBackfillArgs(['--org', ''])).toThrow(
      '--org requires a value',
    );
    expect(() => parseBackfillArgs(['--env', ''])).toThrow(
      '--env requires a value',
    );
  });

  it('rejects unknown arguments', () => {
    expect(() => parseBackfillArgs(['--apply'])).toThrow(
      'Unknown argument: --apply',
    );
  });
});

describe('fetchAllRows', () => {
  const page = (from: number, to: number, total: number) =>
    Array.from(
      { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
      (_, i) => ({
        id: from + i,
      }),
    );

  it('reads every page until a short page ends the set', async () => {
    const calls: Array<[number, number]> = [];
    const rows = await fetchAllRows(async (from, to) => {
      calls.push([from, to]);
      return { data: page(from, to, 2500), error: null };
    });
    expect(rows).toHaveLength(2500);
    expect(rows[0]).toEqual({ id: 0 });
    expect(rows[2499]).toEqual({ id: 2499 });
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('stops after one page when the set is exactly one short page', async () => {
    const calls: number[] = [];
    const rows = await fetchAllRows(async (from, to) => {
      calls.push(from);
      return { data: page(from, to, 3), error: null };
    });
    expect(rows.map((row) => row.id)).toEqual([0, 1, 2]);
    expect(calls).toEqual([0]);
  });

  it('treats null data as an empty set', async () => {
    await expect(
      fetchAllRows(async () => ({ data: null, error: null })),
    ).resolves.toEqual([]);
  });

  it('throws the query error instead of returning a partial set', async () => {
    const error = { message: 'permission denied' };
    await expect(
      fetchAllRows(async (from) =>
        from === 0
          ? { data: page(0, 999, 5000), error: null }
          : { data: null, error },
      ),
    ).rejects.toBe(error);
  });
});
