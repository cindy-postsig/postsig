import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import {
  ContractActivityType,
  type AllocationActivityScope,
  type AllocationChangedActivityData,
} from '@/constants/types';

type ServiceClient = ReturnType<typeof createClient>;

interface ActivityLike {
  activity_type: ContractActivityType;
  activity_data: unknown;
}

function isAllocationData(
  value: unknown,
): value is AllocationChangedActivityData {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as AllocationChangedActivityData).before) &&
    Array.isArray((value as AllocationChangedActivityData).after)
  );
}

function collectIds(
  scopes: AllocationActivityScope[],
  into: {
    units: Set<number>;
    employees: Set<number>;
    products: Set<number>;
  },
) {
  for (const scope of scopes) {
    if (scope.productId !== null) into.products.add(scope.productId);
    for (const line of scope.lines) {
      if (line.orgUnitId !== null) into.units.add(line.orgUnitId);
      if (line.orgEmployeeId !== null) into.employees.add(line.orgEmployeeId);
    }
  }
}

function stampNames(
  scopes: AllocationActivityScope[],
  names: {
    units: Map<number, string>;
    employees: Map<number, string>;
    products: Map<number, string>;
  },
): AllocationActivityScope[] {
  return scopes.map((scope) => ({
    ...scope,
    productName:
      scope.productId === null
        ? undefined
        : names.products.get(scope.productId),
    lines: scope.lines.map((line) => ({
      ...line,
      targetName:
        line.orgUnitId !== null
          ? names.units.get(line.orgUnitId)
          : line.orgEmployeeId !== null
            ? names.employees.get(line.orgEmployeeId)
            : undefined,
    })),
  }));
}

/**
 * ALLOCATION_CHANGED stores target ids only. Names are resolved when the
 * History tab loads so the row reads "Research 50%" rather than "#42 50%";
 * soft-deleted employees and stale nodes still resolve because neither is
 * ever hard-deleted.
 */
export async function attachAllocationActivityNames<T extends ActivityLike>(
  activities: T[],
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<T[]> {
  const ids = {
    units: new Set<number>(),
    employees: new Set<number>(),
    products: new Set<number>(),
  };
  for (const activity of activities) {
    if (activity.activity_type !== ContractActivityType.ALLOCATION_CHANGED) {
      continue;
    }
    if (!isAllocationData(activity.activity_data)) continue;
    collectIds(activity.activity_data.before, ids);
    collectIds(activity.activity_data.after, ids);
  }
  if (ids.units.size + ids.employees.size + ids.products.size === 0) {
    return activities;
  }

  const [unitRows, employeeRows, productRows] = await Promise.all([
    ids.units.size === 0
      ? { data: [], error: null }
      : client
          .from('org_units')
          .select('id, name')
          .eq('organization_id', organizationId)
          .in('id', [...ids.units]),
    ids.employees.size === 0
      ? { data: [], error: null }
      : client
          .from('org_employees')
          .select('id, first_name, last_name')
          .eq('organization_id', organizationId)
          .in('id', [...ids.employees]),
    ids.products.size === 0
      ? { data: [], error: null }
      : client
          .from('vendor_products')
          .select('id, name')
          .in('id', [...ids.products]),
  ]);
  const failure = unitRows.error ?? employeeRows.error ?? productRows.error;
  if (failure) {
    logger.error(
      { error: sanitizeForLogging(failure), organizationId },
      'Failed to resolve allocation activity names',
    );
    return activities;
  }

  const names = {
    units: new Map((unitRows.data ?? []).map((row) => [row.id, row.name])),
    employees: new Map(
      (employeeRows.data ?? []).map((row) => [
        row.id,
        `${row.first_name} ${row.last_name}`.trim(),
      ]),
    ),
    products: new Map(
      (productRows.data ?? []).map((row) => [row.id, row.name]),
    ),
  };

  return activities.map((activity) => {
    if (
      activity.activity_type !== ContractActivityType.ALLOCATION_CHANGED ||
      !isAllocationData(activity.activity_data)
    ) {
      return activity;
    }
    const data: AllocationChangedActivityData = {
      ...activity.activity_data,
      before: stampNames(activity.activity_data.before, names),
      after: stampNames(activity.activity_data.after, names),
    };
    return { ...activity, activity_data: data };
  });
}
