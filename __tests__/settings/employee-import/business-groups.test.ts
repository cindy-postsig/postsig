jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

type GroupRow = { id: number; name: string };

let groupRows: GroupRow[] = [];
const insertBatches: Record<string, unknown>[][] = [];
let nextId = 1;
/** Simulates a concurrent import having already taken these names. */
let raceOn: string[] = [];

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: (from: number, to: number) =>
          Promise.resolve({ data: groupRows.slice(from, to + 1), error: null }),
        insert: (rows: Record<string, unknown>[]) => {
          insertBatches.push(rows);
          const clash = rows.find((row) =>
            raceOn.includes(String(row.name).toLowerCase()),
          );
          if (clash) {
            // Postgres rejects the whole statement, so no row lands from it.
            return Promise.resolve({ error: { code: '23505' } });
          }
          for (const row of rows) {
            groupRows.push({ id: nextId++, name: String(row.name) });
          }
          return Promise.resolve({ error: null });
        },
      });
      return builder;
    },
  }),
}));

import {
  matchBusinessGroups,
  normalizeGroupName,
} from '@/lib/v2/employee-import/groups';

const ORG = 'org-1';

beforeEach(() => {
  groupRows = [
    { id: 10, name: 'Sales' },
    { id: 11, name: 'Operations' },
  ];
  insertBatches.length = 0;
  nextId = 100;
  raceOn = [];
});

describe('normalizeGroupName', () => {
  it('trims and lowercases so one group has one key', () => {
    expect(normalizeGroupName('  Sales ')).toBe('sales');
    expect(normalizeGroupName('SALES')).toBe('sales');
  });
});

describe('matchBusinessGroups', () => {
  it('matches ignoring case and surrounding spaces', async () => {
    const { byName, unmatched } = await matchBusinessGroups(ORG, [
      'Sales ',
      'sales',
      'SALES',
      'Operations',
    ]);

    expect(unmatched).toEqual([]);
    expect(byName.get('sales')).toEqual({ id: 10, name: 'Sales' });
    expect(byName.get('operations')).toEqual({ id: 11, name: 'Operations' });
  });

  // The reported bug: a match was invisible, so a resolved value looked dropped.
  it('reports both spellings so the UI can show bg1 → BG1', async () => {
    groupRows = [{ id: 42, name: 'BG1' }];

    const { matched, unmatched } = await matchBusinessGroups(ORG, ['bg1']);

    expect(unmatched).toEqual([]);
    expect(matched).toEqual([{ source: 'bg1', group: 'BG1' }]);
  });

  it('reports a match even when the spellings are identical', async () => {
    const { matched } = await matchBusinessGroups(ORG, ['Sales']);
    expect(matched).toEqual([{ source: 'Sales', group: 'Sales' }]);
  });

  it('reports unmatched names in the spelling the file used', async () => {
    const { unmatched } = await matchBusinessGroups(ORG, [
      'Sales',
      '  EMEA Sales  ',
    ]);
    expect(unmatched).toEqual(['EMEA Sales']);
  });

  it('dedupes unmatched names by normalized key', async () => {
    const { unmatched } = await matchBusinessGroups(ORG, [
      'EMEA Sales',
      'emea sales',
      'EMEA SALES ',
    ]);
    expect(unmatched).toEqual(['EMEA Sales']);
  });

  it('never writes', async () => {
    await matchBusinessGroups(ORG, ['Brand New Group']);
    expect(insertBatches).toEqual([]);
  });

  it('skips blank names and short-circuits when nothing is left', async () => {
    const { byName, matched, unmatched } = await matchBusinessGroups(ORG, [
      '',
      '   ',
    ]);
    expect(byName.size).toBe(0);
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([]);
    expect(insertBatches).toEqual([]);
  });
});
