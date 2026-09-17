import { createClient } from '@/utils/supabase/service_server';
import { fetchAllPages } from '@/lib/v2/cost-allocation/context';

// Reads behind the Assignments tab. The service client bypasses RLS, so every
// query scopes itself on organization_id.

type ServiceClient = ReturnType<typeof createClient>;

/** The roster fields the person profile and the Users table need. */
export interface AssignmentEmployeeRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  employee_id: string | null;
  status: string;
  deleted_at: string | null;
  org_unit_id: number | null;
  cost_center: string | null;
  region: string | null;
  country: string | null;
}

export async function readAssignmentEmployees(
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<AssignmentEmployeeRow[]> {
  return fetchAllPages<AssignmentEmployeeRow>(
    (from, to) =>
      client
        .from('org_employees')
        .select(
          'id, first_name, last_name, email, employee_id, status, deleted_at, org_unit_id, cost_center, region, country',
        )
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('id')
        .range(from, to),
    organizationId,
    'assignment employees',
  );
}
