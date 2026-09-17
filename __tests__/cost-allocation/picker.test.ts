import {
  buildPickerCatalog,
  targetTypeLabel,
  type PickerEmployee,
} from '@/lib/v2/cost-allocation/picker';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';

const node = (
  id: number,
  level: OrgUnitNode['level'],
  name: string,
  parentId: number | null = null,
): OrgUnitNode => ({ id, level, name, parent_id: parentId });

const employee = (
  id: number,
  name: string,
  overrides: Partial<PickerEmployee> = {},
): PickerEmployee => ({
  id,
  name,
  status: 'active',
  deleted_at: null,
  org_unit_id: null,
  cost_center: null,
  ...overrides,
});

const FULL_ORDER = [
  'entity',
  'business_group',
  'division',
  'business_unit',
  'department',
  'team',
] as const;

describe('buildPickerCatalog', () => {
  it('offers only levels with nodes, in org order, Division included, then cost centers and users', () => {
    const catalog = buildPickerCatalog({
      levelOrder: [...FULL_ORDER],
      units: [
        node(1, 'entity', 'Berenberg'),
        node(2, 'division', 'Markets', 1),
        node(3, 'department', 'Research', 2),
        node(4, 'cost_center', '70133 - Sales Trading'),
      ],
      employees: [employee(10, 'Ada Lovelace', { org_unit_id: 3 })],
    });

    expect(catalog.map((c) => c.key)).toEqual([
      'entity',
      'division',
      'department',
      'cost_center',
      'user',
    ]);
    expect(catalog.map((c) => c.label)).toEqual([
      'Entities',
      'Divisions',
      'Departments',
      'Cost Centers',
      'Users',
    ]);
  });

  it('follows the org level order rather than the canonical order', () => {
    const catalog = buildPickerCatalog({
      levelOrder: ['department', 'entity'],
      units: [node(1, 'entity', 'Berenberg'), node(2, 'department', 'Ops', 1)],
      employees: [],
    });

    expect(catalog.map((c) => c.key)).toEqual(['department', 'entity']);
  });

  it('returns an empty catalog for an org with no employees and no nodes', () => {
    expect(
      buildPickerCatalog({ levelOrder: [], units: [], employees: [] }),
    ).toEqual([]);
  });

  it('adds a parent-path breadcrumb only when two nodes at a level share a name', () => {
    const catalog = buildPickerCatalog({
      levelOrder: [...FULL_ORDER],
      units: [
        node(1, 'business_unit', 'US Large Cap'),
        node(2, 'business_unit', 'Wealth Management'),
        node(3, 'department', 'Research', 1),
        node(4, 'department', 'Research', 2),
        node(5, 'department', 'Ops', 2),
      ],
      employees: [],
    });

    const departments = catalog.find((c) => c.key === 'department');
    const byId = new Map(departments?.items.map((i) => [i.target.id, i]));
    expect(byId.get(3)?.breadcrumb).toBe('US Large Cap');
    expect(byId.get(4)?.breadcrumb).toBe('Wealth Management');
    expect(byId.get(5)?.breadcrumb).toBeUndefined();
  });

  it('walks the full parent path, nearest first, for the breadcrumb', () => {
    const catalog = buildPickerCatalog({
      levelOrder: [...FULL_ORDER],
      units: [
        node(1, 'entity', 'Berenberg'),
        node(2, 'business_unit', 'Equities', 1),
        node(3, 'team', 'Desk', 2),
        node(4, 'team', 'Desk', 1),
      ],
      employees: [],
    });

    const teams = catalog.find((c) => c.key === 'team');
    const byId = new Map(teams?.items.map((i) => [i.target.id, i]));
    expect(byId.get(3)?.breadcrumb).toBe('Equities · Berenberg');
    expect(byId.get(4)?.breadcrumb).toBe('Berenberg');
  });

  it('offers every active employee as a user target and excludes inactive or departed ones', () => {
    const catalog = buildPickerCatalog({
      levelOrder: [],
      units: [],
      employees: [
        employee(3, 'Zed Active', { org_unit_id: 7 }),
        employee(1, 'Ada Active'),
        employee(2, 'On Leave', { status: 'on_leave' }),
        employee(4, 'Departed', { status: 'departed' }),
        employee(5, 'Deleted', { deleted_at: '2026-01-01' }),
      ],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0].key).toBe('user');
    expect(catalog[0].items).toEqual([
      {
        target: {
          kind: 'employee',
          id: 1,
          name: 'Ada Active',
          orgUnitId: null,
        },
      },
      {
        target: { kind: 'employee', id: 3, name: 'Zed Active', orgUnitId: 7 },
      },
    ]);
  });
});

describe('targetTypeLabel', () => {
  it('labels units by level and employees as users, with a generic fallback', () => {
    const levels = { 1: 'department' as const, 2: 'cost_center' as const };
    expect(
      targetTypeLabel({ kind: 'org_unit', id: 1, name: 'Research' }, levels),
    ).toBe('Department');
    expect(
      targetTypeLabel({ kind: 'org_unit', id: 2, name: '70133' }, levels),
    ).toBe('Cost Center');
    expect(
      targetTypeLabel({ kind: 'org_unit', id: 99, name: 'Unknown' }, levels),
    ).toBe('Org Unit');
    expect(
      targetTypeLabel(
        { kind: 'employee', id: 5, name: 'Ada', orgUnitId: null },
        levels,
      ),
    ).toBe('User');
  });
});
