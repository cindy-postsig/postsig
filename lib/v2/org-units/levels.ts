export const ORG_UNIT_TREE_LEVELS = [
  'entity',
  'business_group',
  'division',
  'business_unit',
  'department',
  'team',
] as const;

export type OrgUnitTreeLevel = (typeof ORG_UNIT_TREE_LEVELS)[number];

export type OrgUnitLevel = OrgUnitTreeLevel | 'cost_center';

export function isOrgUnitTreeLevel(value: unknown): value is OrgUnitTreeLevel {
  return ORG_UNIT_TREE_LEVELS.includes(value as OrgUnitTreeLevel);
}

export function isOrgUnitLevel(value: unknown): value is OrgUnitLevel {
  return isOrgUnitTreeLevel(value) || value === 'cost_center';
}
