import { normalizeEmail, normalizeOptional } from './_email';

export type EmployeeStatus = 'active' | 'inactive' | 'on_leave';

export type EmployeeRowInput = {
  organization_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  employee_id?: string;
  region?: string;
  country?: string;
  division?: string;
  department?: string;
  cost_center?: string;
  business_unit?: string;
  entity?: string;
  team?: string;
  /**
   * Business-group org-unit node. Never written to the row — membership is
   * carried by `org_unit_id` via the upsert walk; absent means "leave the
   * employee's business group alone", so an unresolved name in a weekly
   * import cannot unset an existing membership.
   */
  business_group_node_id?: number;
  start_date?: string;
  leave_date?: string;
  status?: EmployeeStatus;
};

/**
 * Builds the DB row for both the insert and the update path of a bulk import.
 *
 * `status` is spread conditionally rather than defaulted to null, because the
 * same row shape feeds both paths: an absent value must mean "take the column
 * default" on insert (status is `not null default 'active'`, so a null would
 * fail with 23502) and "leave the column alone" on update (so a weekly import
 * does not clobber a manually-set `on_leave`).
 */
export function buildEmployeeRow(e: EmployeeRowInput) {
  return {
    organization_id: e.organization_id,
    first_name: e.first_name.trim(),
    last_name: e.last_name.trim(),
    email: normalizeEmail(e.email),
    employee_id: normalizeOptional(e.employee_id),
    region: normalizeOptional(e.region),
    country: normalizeOptional(e.country),
    division: normalizeOptional(e.division),
    department: normalizeOptional(e.department),
    cost_center: normalizeOptional(e.cost_center),
    business_unit: normalizeOptional(e.business_unit),
    entity: normalizeOptional(e.entity),
    team: normalizeOptional(e.team),
    start_date: normalizeOptional(e.start_date),
    leave_date: normalizeOptional(e.leave_date),
    ...(e.status !== undefined ? { status: e.status } : {}),
  };
}
