import { createClient } from '@/utils/supabase/service_server';
import { fetchAllPages } from '@/lib/v2/cost-allocation/context';
import { sponsorRefKey } from './refs';
import type { OwnerSponsorRef } from './types';

type ServiceClient = ReturnType<typeof createClient>;

export interface SponsorMatchCatalog {
  users: { id: string; name: string | null; email: string | null }[];
  employees: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
  }[];
}

const key = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim().toLowerCase() ?? '';
  return trimmed === '' ? null : trimmed;
};

function firstBy<T>(rows: readonly T[], of: (row: T) => string | null) {
  const index = new Map<string, T>();
  for (const row of rows) {
    const rowKey = of(row);
    if (rowKey !== null && !index.has(rowKey)) index.set(rowKey, row);
  }
  return index;
}

/**
 * A free-text sponsor name resolved to an owner row, in the order the data run
 * uses: a PostSig user by email then by display name, then an HR employee by
 * email then by full name, and a bare label for anyone in neither list.
 */
export function matchSponsorNames(
  names: readonly string[],
  catalog: SponsorMatchCatalog,
): OwnerSponsorRef[] {
  const usersByEmail = firstBy(catalog.users, (user) => key(user.email));
  const usersByName = firstBy(catalog.users, (user) => key(user.name));
  const employeesByEmail = firstBy(catalog.employees, (employee) =>
    key(employee.email),
  );
  const employeesByName = firstBy(catalog.employees, (employee) =>
    key(`${employee.firstName} ${employee.lastName}`),
  );

  const seen = new Set<string>();
  const refs: OwnerSponsorRef[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed === '') continue;
    const lookup = trimmed.toLowerCase();
    const user = usersByEmail.get(lookup) ?? usersByName.get(lookup);
    const employee =
      employeesByEmail.get(lookup) ?? employeesByName.get(lookup);
    const ref: OwnerSponsorRef = user
      ? { kind: 'user', id: user.id }
      : employee
        ? { kind: 'employee', id: employee.id }
        : { kind: 'label', name: trimmed };
    const refKey = sponsorRefKey(ref);
    if (seen.has(refKey)) continue;
    seen.add(refKey);
    refs.push(ref);
  }
  return refs;
}

export async function loadSponsorMatchCatalog(
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<SponsorMatchCatalog> {
  const [users, employees] = await Promise.all([
    fetchAllPages(
      (from, to) =>
        client
          .from('users')
          .select('id, name, email')
          .eq('organization_id', organizationId)
          .order('id')
          .range(from, to),
      organizationId,
      'sponsor match users',
    ),
    fetchAllPages(
      (from, to) =>
        client
          .from('org_employees')
          .select('id, first_name, last_name, email')
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .order('id')
          .range(from, to),
      organizationId,
      'sponsor match employees',
    ),
  ]);

  return {
    users,
    employees: employees.map((employee) => ({
      id: employee.id,
      firstName: employee.first_name,
      lastName: employee.last_name,
      email: employee.email,
    })),
  };
}
