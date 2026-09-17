import type { OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';

/**
 * How each HR level is written in the Assignments UI. One map, because a
 * column heading, a profile field and a filter's placeholder must agree — they
 * were three separate copies, and the plural was being made by appending "s"
 * ("All Entitys").
 */
export const LEVEL_LABEL: Record<OrgUnitTreeLevel, string> = {
  entity: 'Entity',
  business_group: 'Business Group',
  division: 'Division',
  business_unit: 'Business Unit',
  department: 'Department',
  team: 'Team',
};

export const LEVEL_LABEL_PLURAL: Record<OrgUnitTreeLevel, string> = {
  entity: 'Entities',
  business_group: 'Business Groups',
  division: 'Divisions',
  business_unit: 'Business Units',
  department: 'Departments',
  team: 'Teams',
};
