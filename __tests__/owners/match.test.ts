jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

let userRows: { id: string; name: string | null; email: string | null }[] = [];
let employeeRows: {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
}[] = [];
const ranges: Record<string, [number, number][]> = {};
const filters: Record<string, Record<string, unknown>> = {};

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: (table: string) => {
      ranges[table] ??= [];
      filters[table] ??= {};
      const builder: Record<string, unknown> = {};
      let from = 0;
      let to = Number.MAX_SAFE_INTEGER;
      Object.assign(builder, {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[table][column] = value;
          return builder;
        },
        is: (column: string, value: unknown) => {
          filters[table][column] = value;
          return builder;
        },
        order: () => builder,
        range: (start: number, end: number) => {
          from = start;
          to = end;
          ranges[table].push([start, end]);
          return builder;
        },
        then: (
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject: (reason: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: (table === 'users' ? userRows : employeeRows).slice(
              from,
              to + 1,
            ),
            error: null,
          }).then(resolve, reject),
      });
      return builder;
    },
  }),
}));

import {
  loadSponsorMatchCatalog,
  matchSponsorNames,
  type SponsorMatchCatalog,
} from '@/lib/v2/owners/match';

const CATALOG: SponsorMatchCatalog = {
  users: [
    { id: 'u-1', name: 'Ada Lovelace', email: 'ada@acme.com' },
    { id: 'u-2', name: 'Grace Hopper', email: null },
    { id: 'u-3', name: null, email: 'nameless@acme.com' },
  ],
  employees: [
    {
      id: 10,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada.hr@acme.com',
    },
    { id: 11, firstName: 'Alan', lastName: 'Turing', email: null },
  ],
};

describe('matchSponsorNames', () => {
  it('matches a user by email before anything else', () => {
    expect(matchSponsorNames(['ADA@acme.com'], CATALOG)).toEqual([
      { kind: 'user', id: 'u-1' },
    ]);
  });

  it('falls back to a user display name, case-insensitively', () => {
    expect(matchSponsorNames(['grace hopper'], CATALOG)).toEqual([
      { kind: 'user', id: 'u-2' },
    ]);
  });

  it('prefers the user over the employee of the same name', () => {
    expect(matchSponsorNames(['Ada Lovelace'], CATALOG)).toEqual([
      { kind: 'user', id: 'u-1' },
    ]);
  });

  it('matches an employee by email when no user has the name', () => {
    expect(matchSponsorNames(['ADA.HR@ACME.COM'], CATALOG)).toEqual([
      { kind: 'employee', id: 10 },
    ]);
  });

  it('matches an employee by first + last name', () => {
    expect(matchSponsorNames([' alan turing '], CATALOG)).toEqual([
      { kind: 'employee', id: 11 },
    ]);
  });

  it('keeps an unmatched name as a trimmed label', () => {
    expect(matchSponsorNames(['  Jane Doe  '], CATALOG)).toEqual([
      { kind: 'label', name: 'Jane Doe' },
    ]);
  });

  it('drops blank names', () => {
    expect(matchSponsorNames(['', '   '], CATALOG)).toEqual([]);
  });

  it('dedupes matches and labels, labels case-insensitively', () => {
    expect(
      matchSponsorNames(
        ['ada@acme.com', 'Ada Lovelace', 'Acme Corp', 'ACME CORP'],
        CATALOG,
      ),
    ).toEqual([
      { kind: 'user', id: 'u-1' },
      { kind: 'label', name: 'Acme Corp' },
    ]);
  });

  it('ignores a user row with neither name nor email as a name match', () => {
    expect(matchSponsorNames(['nameless@acme.com'], CATALOG)).toEqual([
      { kind: 'user', id: 'u-3' },
    ]);
  });
});

describe('loadSponsorMatchCatalog', () => {
  const ORG = 'org-1';

  beforeEach(() => {
    for (const key of Object.keys(ranges)) delete ranges[key];
    for (const key of Object.keys(filters)) delete filters[key];
    userRows = [];
    employeeRows = [];
  });

  it('pages both reads past the 1000-row PostgREST cap', async () => {
    userRows = Array.from({ length: 1003 }, (_, index) => ({
      id: `u-${index}`,
      name: `User ${index}`,
      email: `user${index}@acme.com`,
    }));
    employeeRows = Array.from({ length: 1001 }, (_, index) => ({
      id: index,
      first_name: 'Emp',
      last_name: String(index),
      email: null,
    }));

    const catalog = await loadSponsorMatchCatalog(ORG);

    expect(ranges.users).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(ranges.org_employees).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(catalog.users).toHaveLength(1003);
    expect(catalog.employees).toHaveLength(1001);
    expect(catalog.employees[1000]).toEqual({
      id: 1000,
      firstName: 'Emp',
      lastName: '1000',
      email: null,
    });
  });

  it('scopes both reads to the org and skips deleted employees', async () => {
    await loadSponsorMatchCatalog(ORG);

    expect(filters.users.organization_id).toBe(ORG);
    expect(filters.org_employees.organization_id).toBe(ORG);
    expect(filters.org_employees.deleted_at).toBeNull();
  });
});
