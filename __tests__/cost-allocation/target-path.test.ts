import type { OrgUnitNode } from '@/lib/v2/org-units/tree';
import { sharedNameBreadcrumbs } from '@/lib/v2/cost-allocation/target-path';

const node = (
  id: number,
  level: OrgUnitNode['level'],
  name: string,
  parent_id: number | null = null,
): OrgUnitNode => ({ id, level, name, parent_id });

describe('sharedNameBreadcrumbs', () => {
  const units = [
    node(1, 'entity', 'Bank'),
    node(2, 'business_group', 'Wealth', 1),
    node(3, 'business_group', 'Markets', 1),
    node(4, 'department', 'Research', 2),
    node(5, 'department', 'Research', 3),
    node(6, 'department', 'Ops', 3),
    node(7, 'team', 'Research', 6),
  ];
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));

  it('walks the parents nearest-first for every node whose name is shared at its level', () => {
    const breadcrumbs = sharedNameBreadcrumbs(units, unitsById);

    expect(breadcrumbs.get(4)).toBe('Wealth · Bank');
    expect(breadcrumbs.get(5)).toBe('Markets · Bank');
  });

  it('leaves unique names alone, and a name shared across levels is not shared', () => {
    const breadcrumbs = sharedNameBreadcrumbs(units, unitsById);

    expect(breadcrumbs.has(6)).toBe(false);
    // A team called Research is not a department called Research.
    expect(breadcrumbs.has(7)).toBe(false);
  });
});
