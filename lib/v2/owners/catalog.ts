import { createClient } from '@/utils/supabase/service_server';
import { filterVisibleOrgUsers } from '@/lib/utils/users';
import { getOrgHierarchyLevelOrder } from '@/lib/v2/org-units/sync';
import { fetchAllPages, readUnits } from '@/lib/v2/cost-allocation/context';
import {
  buildPickerCatalog,
  type PickerCategory,
} from '@/lib/v2/cost-allocation/picker';
import { loadPickerEmployees } from '@/lib/v2/cost-allocation/tab-data';
import { orgUnitPath } from '@/lib/v2/cost-allocation/target-path';

type ServiceClient = ReturnType<typeof createClient>;

export interface OwnerCatalogUser {
  id: string;
  name: string;
  email: string | null;
}

export interface OwnerCatalogEmployee {
  id: number;
  name: string;
  unitPath: string | null;
}

/**
 * The Owner tab's pickers, org-wide and identical for every contract, so it is
 * fetched once when a picker first opens. Owners exist for every org, so this
 * is deliberately not behind the cost-allocation flag.
 */
export interface OwnersCatalogData {
  /**
   * The business_group level only, as one picker section. The schema takes an
   * org_unit at any level, but the monthly report's Spend by Business Group
   * keys rows by owner-group name, so a department picked here would read as
   * a business group there; the other levels wait for the report's level
   * selector (psk-1975 phase 2).
   */
  groups: PickerCategory[];
  users: OwnerCatalogUser[];
  employees: OwnerCatalogEmployee[];
}

async function loadCatalogUsers(
  organizationId: string,
  client: ServiceClient,
): Promise<OwnerCatalogUser[]> {
  const rows = await fetchAllPages(
    (from, to) =>
      client
        .from('users')
        .select('id, name, email')
        .eq('organization_id', organizationId)
        .order('id')
        .range(from, to),
    organizationId,
    'owners catalog users',
  );
  return filterVisibleOrgUsers(rows)
    .map((user) => ({
      id: user.id,
      name: user.name?.trim() || user.email || '',
      email: user.email,
    }))
    .filter((user) => user.name !== '')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadOwnersCatalog(
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<OwnersCatalogData> {
  const [levelOrder, units, pickerEmployees, users] = await Promise.all([
    getOrgHierarchyLevelOrder(organizationId, client),
    readUnits(organizationId, client),
    loadPickerEmployees(organizationId, client),
    loadCatalogUsers(organizationId, client),
  ]);

  const catalog = buildPickerCatalog({
    levelOrder,
    units,
    employees: pickerEmployees,
  });
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));

  const employees = (
    catalog.find((category) => category.key === 'user')?.items ?? []
  ).flatMap((item) => {
    if (item.target.kind !== 'employee') return [];
    const path =
      item.target.orgUnitId === null
        ? []
        : orgUnitPath(item.target.orgUnitId, unitsById);
    return [
      {
        id: item.target.id,
        name: item.target.name,
        unitPath: path.length > 0 ? path.join(' · ') : null,
      },
    ];
  });

  return {
    groups: catalog.filter((category) => category.key === 'business_group'),
    users,
    employees,
  };
}
