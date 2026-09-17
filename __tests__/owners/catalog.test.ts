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
const userFilters: Record<string, unknown> = {};
const userRanges: [number, number][] = [];

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      let from = 0;
      let to = Number.MAX_SAFE_INTEGER;
      Object.assign(builder, {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          userFilters[column] = value;
          return builder;
        },
        order: () => builder,
        range: (start: number, end: number) => {
          from = start;
          to = end;
          userRanges.push([start, end]);
          return builder;
        },
        then: (
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject: (reason: unknown) => unknown,
        ) =>
          Promise.resolve({
            data: userRows.slice(from, to + 1),
            error: null,
          }).then(resolve, reject),
      });
      return builder;
    },
  }),
}));

const getOrgHierarchyLevelOrder = jest.fn();
jest.mock('@/lib/v2/org-units/sync', () => ({
  getOrgHierarchyLevelOrder: (...args: unknown[]) =>
    getOrgHierarchyLevelOrder(...args),
}));

const readUnits = jest.fn();
jest.mock('@/lib/v2/cost-allocation/context', () => ({
  ...jest.requireActual('@/lib/v2/cost-allocation/context'),
  readUnits: (...args: unknown[]) => readUnits(...args),
}));

const loadPickerEmployees = jest.fn();
jest.mock('@/lib/v2/cost-allocation/tab-data', () => ({
  loadPickerEmployees: (...args: unknown[]) => loadPickerEmployees(...args),
}));

import { loadOwnersCatalog } from '@/lib/v2/owners/catalog';

const ORG = 'org-1';

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(userFilters)) delete userFilters[key];
  userRanges.length = 0;
  userRows = [
    { id: 'u-1', name: 'Ada Lovelace', email: 'ada@acme.com' },
    { id: 'u-2', name: null, email: 'grace@acme.com' },
    { id: 'u-3', name: 'PostSig Support', email: 'support@postsig.com' },
  ];
  getOrgHierarchyLevelOrder.mockResolvedValue(['business_group', 'department']);
  readUnits.mockResolvedValue([
    { id: 1, level: 'business_group', name: 'Markets', parent_id: null },
    { id: 2, level: 'department', name: 'Trading', parent_id: 1 },
    { id: 3, level: 'cost_center', name: 'CC-100', parent_id: null },
  ]);
  loadPickerEmployees.mockResolvedValue([
    {
      id: 10,
      name: 'Alan Turing',
      status: 'active',
      deleted_at: null,
      org_unit_id: 2,
      cost_center: null,
    },
    {
      id: 11,
      name: 'Grace Hopper',
      status: 'active',
      deleted_at: null,
      org_unit_id: null,
      cost_center: null,
    },
  ]);
});

describe('loadOwnersCatalog', () => {
  it('offers only the business_group level, as one section, whatever else the org has', async () => {
    const catalog = await loadOwnersCatalog(ORG);

    expect(catalog.groups.map((category) => category.key)).toEqual([
      'business_group',
    ]);
    expect(catalog.groups.map((category) => category.label)).toEqual([
      'Business Groups',
    ]);
    expect(catalog.groups[0].items.map((item) => item.target.name)).toEqual([
      'Markets',
    ]);
  });

  it('excludes the employee category from the group sections', async () => {
    const catalog = await loadOwnersCatalog(ORG);

    expect(catalog.groups.some((category) => category.key === 'user')).toBe(
      false,
    );
    for (const category of catalog.groups) {
      for (const item of category.items) {
        expect(item.target.kind).toBe('org_unit');
      }
    }
  });

  it('returns employees with their unit path, and a null path when they have no unit', async () => {
    const catalog = await loadOwnersCatalog(ORG);

    expect(catalog.employees).toEqual([
      { id: 10, name: 'Alan Turing', unitPath: 'Markets · Trading' },
      { id: 11, name: 'Grace Hopper', unitPath: null },
    ]);
  });

  it('returns org users by display name, falling back to the email', async () => {
    const catalog = await loadOwnersCatalog(ORG);

    expect(catalog.users).toEqual([
      { id: 'u-1', name: 'Ada Lovelace', email: 'ada@acme.com' },
      { id: 'u-2', name: 'grace@acme.com', email: 'grace@acme.com' },
    ]);
    expect(userFilters.organization_id).toBe(ORG);
  });

  it('pages past the 1000-row PostgREST cap', async () => {
    userRows = Array.from({ length: 1003 }, (_, index) => ({
      id: `u-${index}`,
      name: `User ${String(index).padStart(4, '0')}`,
      email: `user${index}@acme.com`,
    }));

    const catalog = await loadOwnersCatalog(ORG);

    expect(userRanges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(catalog.users).toHaveLength(1003);
    expect(catalog.users[1002]).toEqual({
      id: 'u-1002',
      name: 'User 1002',
      email: 'user1002@acme.com',
    });
  });

  it('renders as flat lists for an org with no HR import', async () => {
    getOrgHierarchyLevelOrder.mockResolvedValue([]);
    readUnits.mockResolvedValue([]);
    loadPickerEmployees.mockResolvedValue([]);

    const catalog = await loadOwnersCatalog(ORG);

    expect(catalog.groups).toEqual([]);
    expect(catalog.employees).toEqual([]);
    expect(catalog.users).toHaveLength(2);
  });
});
