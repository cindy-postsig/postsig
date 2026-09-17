import type { OrgUnitLevel, OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';
import { isActiveEmployee, type OrgUnitNode } from '@/lib/v2/org-units/tree';
import { sharedNameBreadcrumbs } from './target-path';
import type { AllocationTargetRef } from './types';

export type PickerCategoryKey = OrgUnitLevel | 'user';

export const PICKER_CATEGORY_LABELS: Record<PickerCategoryKey, string> = {
  entity: 'Entities',
  business_group: 'Business Groups',
  division: 'Divisions',
  business_unit: 'Business Units',
  department: 'Departments',
  team: 'Teams',
  cost_center: 'Cost Centers',
  user: 'Users',
};

export const TARGET_TYPE_LABELS: Record<PickerCategoryKey, string> = {
  entity: 'Entity',
  business_group: 'Business Group',
  division: 'Division',
  business_unit: 'Business Unit',
  department: 'Department',
  team: 'Team',
  cost_center: 'Cost Center',
  user: 'User',
};

export interface PickerItem {
  target: AllocationTargetRef;
  /** Parent path, nearest first; present only when another node at the level shares the name (decision Q3). */
  breadcrumb?: string;
}

export interface PickerCategory {
  key: PickerCategoryKey;
  label: string;
  items: PickerItem[];
}

export interface PickerEmployee {
  id: number;
  name: string;
  status: string;
  deleted_at: string | null;
  org_unit_id: number | null;
  cost_center: string | null;
}

export interface PickerCatalogInput {
  levelOrder: OrgUnitTreeLevel[];
  units: OrgUnitNode[];
  employees: PickerEmployee[];
}

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name);

/**
 * Cost-center nodes are never an employee's leaf, so `getStaleNodeIds` cannot
 * see their activity; it is derived from the `cost_center` column instead,
 * keyed to the node by name. Consumed by the summary report's rollup rows.
 */
export function activeCostCenterNames(
  employees: readonly PickerEmployee[],
): Set<string> {
  const names = new Set<string>();
  for (const employee of employees) {
    if (!isActiveEmployee(employee)) continue;
    if (employee.cost_center !== null) names.add(employee.cost_center);
  }
  return names;
}

/**
 * Level-driven catalog for the target picker: one category per tree level in
 * the org's order that has at least one node, then flat cost centers, then all
 * active employees (decision Q5). An org with nothing to offer yields an empty
 * array — the tab's empty state.
 */
export function buildPickerCatalog(
  input: PickerCatalogInput,
): PickerCategory[] {
  const unitsById = new Map(input.units.map((unit) => [unit.id, unit]));

  const nodesByLevel = new Map<OrgUnitLevel, OrgUnitNode[]>();
  for (const unit of input.units) {
    const nodes = nodesByLevel.get(unit.level);
    if (nodes) nodes.push(unit);
    else nodesByLevel.set(unit.level, [unit]);
  }

  const breadcrumbs = sharedNameBreadcrumbs(input.units, unitsById);
  const toItems = (nodes: OrgUnitNode[]) =>
    [...nodes].sort(byName).map((node): PickerItem => {
      const item: PickerItem = {
        target: { kind: 'org_unit', id: node.id, name: node.name },
      };
      const breadcrumb = breadcrumbs.get(node.id);
      if (breadcrumb) item.breadcrumb = breadcrumb;
      return item;
    });

  const categories: PickerCategory[] = [];
  for (const level of input.levelOrder) {
    const nodes = nodesByLevel.get(level);
    if (!nodes || nodes.length === 0) continue;
    categories.push({
      key: level,
      label: PICKER_CATEGORY_LABELS[level],
      items: toItems(nodes),
    });
  }

  const costCenters = nodesByLevel.get('cost_center');
  if (costCenters && costCenters.length > 0) {
    categories.push({
      key: 'cost_center',
      label: PICKER_CATEGORY_LABELS.cost_center,
      items: toItems(costCenters),
    });
  }

  const activeEmployees = input.employees.filter(isActiveEmployee).sort(byName);
  if (activeEmployees.length > 0) {
    categories.push({
      key: 'user',
      label: PICKER_CATEGORY_LABELS.user,
      items: activeEmployees.map((employee) => ({
        target: {
          kind: 'employee',
          id: employee.id,
          name: employee.name,
          orgUnitId: employee.org_unit_id,
        },
      })),
    });
  }

  return categories;
}

export function targetKey(target: AllocationTargetRef): string {
  return `${target.kind}:${target.id}`;
}

/**
 * Type-column label for a line. A unit at a level the org's level order omits
 * can still be a saved target, so an unknown level degrades to a generic label
 * rather than hiding the line.
 */
export function targetTypeLabel(
  target: AllocationTargetRef,
  levelByUnitId: Readonly<Record<number, OrgUnitLevel>>,
): string {
  if (target.kind === 'employee') return TARGET_TYPE_LABELS.user;
  const level = levelByUnitId[target.id];
  return level ? TARGET_TYPE_LABELS[level] : 'Org Unit';
}
