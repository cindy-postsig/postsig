import { cache } from 'react';
import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import {
  buildOrgHierarchyMap,
  type ContractRelationship,
} from '@/lib/inventory/hierarchyUtils';
import {
  isActiveEmployee,
  isOrgUnitLevel,
  type OrgUnitNode,
} from '@/lib/v2/org-units';
import { readContractSeats } from '@/lib/v2/seats/queries';
import { fetchAllPages, fetchByIds } from './paging';
import {
  isAllocationMode,
  type AllocationContext,
  type AllocationEmployee,
  type AllocationLineRow,
  type AllocationRow,
  type ContractSeat,
} from './types';

/** Re-exported where callers already read it; it lives in ./paging now. */
export { fetchAllPages };

type ServiceClient = ReturnType<typeof createClient>;

/** An employee as read from the roster; the builder resolves its cost-center node and active flag. */
export interface AllocationEmployeeInput {
  id: number;
  name: string;
  status: string;
  deleted_at: string | null;
  org_unit_id: number | null;
  cost_center?: string | null;
}

export interface AllocationContextInput {
  allocations: AllocationRow[];
  lines: AllocationLineRow[];
  units: OrgUnitNode[];
  employees: AllocationEmployeeInput[];
  seats: ContractSeat[];
  relationships: ContractRelationship[];
}

function groupBy<T>(items: T[], keyOf: (item: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export function buildAllocationContext(
  input: AllocationContextInput,
): AllocationContext {
  // Spans every edge endpoint, not just the contracts a caller resolves: an
  // invoice's allocated ancestor must stay walkable even when the caller passes
  // only the invoice.
  const hierarchy = buildOrgHierarchyMap(input.relationships);

  // Cost-center nodes are flat and keyed by the raw column value the sync
  // upserted them from, so an exact name match is the identity (the picker's
  // staleness rule uses the same match).
  const costCenterIdByName = new Map<string, number>();
  for (const unit of input.units) {
    if (unit.level === 'cost_center' && !costCenterIdByName.has(unit.name)) {
      costCenterIdByName.set(unit.name, unit.id);
    }
  }
  const employees: AllocationEmployee[] = input.employees.map((employee) => ({
    id: employee.id,
    name: employee.name,
    org_unit_id: employee.org_unit_id,
    cost_center_unit_id:
      employee.cost_center == null
        ? null
        : (costCenterIdByName.get(employee.cost_center) ?? null),
    active: isActiveEmployee(employee),
  }));

  return {
    allocationsByContractId: groupBy(input.allocations, (a) => a.contract_id),
    linesByAllocationId: groupBy(input.lines, (l) => l.allocation_id),
    unitsById: new Map(input.units.map((unit) => [unit.id, unit])),
    employeesById: new Map(
      employees.map((employee) => [employee.id, employee]),
    ),
    seatsByContractId: groupBy(input.seats, (s) => s.contract_id),
    hierarchy,
  };
}

function toAllocationRows(
  rows: Array<{
    id: number;
    contract_id: number;
    product_id: number | null;
    mode: string;
  }>,
): AllocationRow[] {
  return rows.map((row) => {
    if (!isAllocationMode(row.mode)) {
      throw new Error(
        `Unknown allocation mode "${row.mode}" on allocation ${row.id}`,
      );
    }
    return {
      id: row.id,
      contract_id: row.contract_id,
      product_id: row.product_id,
      mode: row.mode,
    };
  });
}

export async function readUnits(
  organizationId: string,
  client: ServiceClient,
): Promise<OrgUnitNode[]> {
  const rows = await fetchAllPages(
    (from, to) =>
      client
        .from('org_units')
        .select('id, level, name, parent_id')
        .eq('organization_id', organizationId)
        .order('id')
        .range(from, to),
    organizationId,
    'org units',
  );
  return rows.map((row) => {
    if (!isOrgUnitLevel(row.level)) {
      throw new Error(
        `Unknown org unit level "${row.level}" on org unit ${row.id}`,
      );
    }
    return {
      id: row.id,
      level: row.level,
      name: row.name,
      parent_id: row.parent_id,
    };
  });
}

async function readEmployees(
  organizationId: string,
  client: ServiceClient,
  ids: readonly number[],
): Promise<AllocationEmployeeInput[]> {
  // Deleted and inactive employees stay readable: existing lines pointing at
  // them remain valid, so their refs must still resolve. `status` and
  // `deleted_at` come along to tell the two apart — active_users splits over
  // the active ones only.
  const rows = await fetchByIds(
    ids,
    (chunk, from, to) =>
      client
        .from('org_employees')
        .select(
          'id, first_name, last_name, status, deleted_at, org_unit_id, cost_center',
        )
        .eq('organization_id', organizationId)
        .in('id', chunk)
        .order('id')
        .range(from, to),
    organizationId,
    'employees',
  );
  return rows.map((row) => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`.trim(),
    status: row.status,
    deleted_at: row.deleted_at,
    org_unit_id: row.org_unit_id,
    cost_center: row.cost_center,
  }));
}

/**
 * Seats and employees are read by need, after the allocation rows: seats only
 * for contracts an `active_users` scope splits over (plus any the caller
 * previews), employees only where a line or a loaded seat points. The
 * resolver never looks anywhere else, so the org roster stays out of the
 * hot path — an org of 1,500 employees with a dozen employee lines reads a
 * dozen rows.
 */
async function assembleContext(
  organizationId: string,
  client: ServiceClient,
  input: Omit<AllocationContextInput, 'employees' | 'seats'>,
  previewSeatContractIds: readonly number[] = [],
): Promise<AllocationContext> {
  const seatContractIds = new Set(previewSeatContractIds);
  for (const allocation of input.allocations) {
    if (allocation.mode === 'active_users') {
      seatContractIds.add(allocation.contract_id);
    }
  }
  const seatRows = await readContractSeats(organizationId, client, {
    contractIds: [...seatContractIds],
  });
  const seats: ContractSeat[] = seatRows.map((row) => ({
    contract_id: row.contract_id,
    product_id: row.product_id,
    org_employee_id: row.org_employee_id,
  }));

  const employeeIds = new Set<number>();
  for (const line of input.lines) {
    if (line.org_employee_id !== null) employeeIds.add(line.org_employee_id);
  }
  for (const seat of seats) {
    if (seat.org_employee_id !== null) employeeIds.add(seat.org_employee_id);
  }
  const employees = await readEmployees(organizationId, client, [
    ...employeeIds,
  ]);

  return buildAllocationContext({ ...input, employees, seats });
}

async function readOrgRelationships(
  organizationId: string,
): Promise<ContractRelationship[]> {
  // Lazy so fixture tests can inject relationships without dragging in the
  // contracts data layer (same pattern as lib/contracts/supersededProducts.ts).
  const { fetchAllRelationshipsForOrg } =
    await import('@/data/superuser/contracts');
  return fetchAllRelationshipsForOrg(organizationId);
}

/**
 * The org-wide context: every allocation, for callers that resolve many
 * contracts at once (the business-group stamp on the contract set, the
 * reports, the engine's allocation dimension). Deliberately separate from the
 * engine's Redis-cached contract select — allocations never join it, so an
 * allocation write needs no org-wide cache invalidation.
 *
 * `relationships` lets callers that already fetched the org's relationship
 * rows (most engine paths do) skip the extra query.
 */
export async function loadAllocationContext(
  organizationId: string,
  client: ServiceClient = createClient(),
  relationships?: ContractRelationship[],
): Promise<AllocationContext> {
  const [rawAllocations, lines, units, allRelationships] = await Promise.all([
    fetchAllPages(
      (from, to) =>
        client
          .from('contract_cost_allocations')
          .select('id, contract_id, product_id, mode')
          .eq('organization_id', organizationId)
          .order('id')
          .range(from, to),
      organizationId,
      'allocations',
    ),
    fetchAllPages(
      (from, to) =>
        client
          .from('contract_cost_allocation_lines')
          .select('id, allocation_id, org_unit_id, org_employee_id, percent')
          .eq('organization_id', organizationId)
          .order('id')
          .range(from, to),
      organizationId,
      'allocation lines',
    ),
    readUnits(organizationId, client),
    relationships ?? readOrgRelationships(organizationId),
  ]);

  return assembleContext(organizationId, client, {
    allocations: toAllocationRows(rawAllocations),
    lines,
    units,
    relationships: allRelationships,
  });
}

/**
 * The hierarchy edges above one contract, hop by hop. Follows the same edge
 * `HierarchyMap.parents` resolves — hierarchy edges only, lowest-numbered
 * parent of a multi-parent child — and the same parent-org filter
 * fetchAllRelationshipsForOrg applies, so the resolver walks exactly the
 * chain it would find in the org-wide map. A revisited id ends the walk; the
 * edges already collected let the resolver report the cycle itself.
 */
async function readAncestorEdges(
  organizationId: string,
  contractId: number,
  client: ServiceClient,
): Promise<ContractRelationship[]> {
  const edges: ContractRelationship[] = [];
  const visited = new Set<number>();
  let currentId: number | null = contractId;
  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId);
    const { data, error } = await client
      .from('contract_relationships')
      .select(
        'parent_contract_id, child_contract_id, relationship_type, parent_contract:contracts!contract_relationships_parent_contract_id_fkey!inner(organization_id)',
      )
      .eq('parent_contract.organization_id', organizationId)
      .eq('child_contract_id', currentId)
      .eq('active', true)
      .is('relationship_type', null)
      .or('disabled.is.null,disabled.eq.false');
    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId, contractId },
        'Failed to load allocation context',
      );
      throw error;
    }
    let next: number | null = null;
    for (const edge of data ?? []) {
      edges.push({
        parent_contract_id: edge.parent_contract_id,
        child_contract_id: edge.child_contract_id,
        relationship_type: edge.relationship_type,
      });
      if (
        edge.parent_contract_id !== null &&
        (next === null || edge.parent_contract_id < next)
      ) {
        next = edge.parent_contract_id;
      }
    }
    currentId = next;
  }
  return edges;
}

/**
 * The context one contract needs: its ancestor chain's allocations (the
 * resolver inherits from the nearest allocated ancestor and never looks
 * sideways), the org tree, and the contract's own seats — always loaded, since
 * the tab previews them whatever the mode. Resolves identically to the
 * org-wide context for that contract at a fraction of the reads.
 */
export async function loadAllocationContextForContract(
  organizationId: string,
  contractId: number,
  client: ServiceClient = createClient(),
): Promise<AllocationContext> {
  const [relationships, units] = await Promise.all([
    readAncestorEdges(organizationId, contractId, client),
    readUnits(organizationId, client),
  ]);
  const chainIds = new Set([contractId]);
  for (const edge of relationships) {
    if (edge.parent_contract_id !== null) chainIds.add(edge.parent_contract_id);
    if (edge.child_contract_id !== null) chainIds.add(edge.child_contract_id);
  }

  const rawAllocations = await fetchByIds(
    [...chainIds],
    (chunk, from, to) =>
      client
        .from('contract_cost_allocations')
        .select('id, contract_id, product_id, mode')
        .eq('organization_id', organizationId)
        .in('contract_id', chunk)
        .order('id')
        .range(from, to),
    organizationId,
    'allocations',
  );
  const allocations = toAllocationRows(rawAllocations);
  const lines = await fetchByIds(
    allocations.map((allocation) => allocation.id),
    (chunk, from, to) =>
      client
        .from('contract_cost_allocation_lines')
        .select('id, allocation_id, org_unit_id, org_employee_id, percent')
        .eq('organization_id', organizationId)
        .in('allocation_id', chunk)
        .order('id')
        .range(from, to),
    organizationId,
    'allocation lines',
  );

  return assembleContext(
    organizationId,
    client,
    { allocations, lines, units, relationships },
    [contractId],
  );
}

/**
 * Request-scoped: every fetch boundary that stamps business groups in one
 * request (the contract list, an archived merge, a by-id read) shares a single
 * load. Keyed on the org alone, so it fetches its own relationships rather
 * than taking a caller's array as a cache key.
 */
export const loadAllocationContextForRequest = cache(
  (organizationId: string): Promise<AllocationContext> =>
    loadAllocationContext(organizationId),
);
