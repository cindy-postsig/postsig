import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { NotFoundError } from '@/lib/errors';
import { isInvoiceType } from '@/app/lib/constants';
import type { OrgUnitLevel } from '@/lib/v2/org-units/levels';
import { getOrgHierarchyLevelOrder } from '@/lib/v2/org-units/sync';
import {
  fetchAllPages,
  loadAllocationContextForContract,
  readUnits,
} from './context';
import { resolveAllocations } from './resolver';
import {
  buildPickerCatalog,
  type PickerCategory,
  type PickerEmployee,
} from './picker';
import { allocationProvenance } from './editor';
import type { ContractScopeValues } from './amounts';
import type { AllocationProduct, ResolvedContractAllocation } from './types';

type ServiceClient = ReturnType<typeof createClient>;

export interface AllocationSeat {
  productId: number | null;
  /** null = a legacy seat with no linked employee; counted, never allocated. */
  employeeId: number | null;
}

export interface CostAllocationTabData {
  contractId: number;
  isInvoice: boolean;
  resolved: ResolvedContractAllocation;
  hasOwnAllocation: boolean;
  /** Set when the resolved allocation is inherited; labels the "Inherited from …" line. */
  sourceContract: { id: number; label: string } | null;
  /** The hierarchy parent, when linked: the unassigned state's "set up on <parent>" affordance. */
  parentContract: { id: number; label: string } | null;
  /** False = nothing to allocate to yet (no units, no employees): the tab's empty state. */
  hasAllocationTargets: boolean;
  levelByUnitId: Record<number, OrgUnitLevel>;
  /** Current seats: the "Add all active users" shortcut, the active_users offer, and its live preview. */
  seats: AllocationSeat[];
  /** The record's products: the by-product scopes it can carry, and the names those scopes print. */
  products: AllocationProduct[];
}

export type CostAllocationTabPayload = CostAllocationTabData &
  ContractScopeValues;

/**
 * The target picker's browse catalog — identical for every contract in the
 * org, so it travels separately from the per-contract tab payload and is
 * fetched only when the editor opens.
 */
export interface AllocationCatalogData {
  catalog: PickerCategory[];
}

export async function loadAllocationCatalog(
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<AllocationCatalogData> {
  const [levelOrder, units, employees] = await Promise.all([
    getOrgHierarchyLevelOrder(organizationId, client),
    readUnits(organizationId, client),
    loadPickerEmployees(organizationId, client),
  ]);
  return { catalog: buildPickerCatalog({ levelOrder, units, employees }) };
}

async function anyActiveEmployeeExists(
  organizationId: string,
  client: ServiceClient,
): Promise<boolean> {
  // Mirrors the picker's Users category: only status 'active' employees are
  // selectable targets, so only they count toward "something to allocate to".
  const { data, error } = await client
    .from('org_employees')
    .select('id')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId },
      'Failed to probe employees for allocation targets',
    );
    throw error;
  }
  return data !== null;
}

export async function loadPickerEmployees(
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<PickerEmployee[]> {
  const rows = await fetchAllPages(
    (from, to) =>
      client
        .from('org_employees')
        .select(
          'id, first_name, last_name, status, deleted_at, org_unit_id, cost_center',
        )
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .order('id')
        .range(from, to),
    organizationId,
    'picker employees',
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

export async function loadContractHeader(
  organizationId: string,
  contractId: number,
  client: ServiceClient = createClient(),
): Promise<{ id: number; type_id: number | null; typeName: string | null }> {
  const { data, error } = await client
    .from('contracts')
    .select('id, type_id, contract_types ( name )')
    .eq('organization_id', organizationId)
    .eq('id', contractId)
    .maybeSingle();
  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId, contractId },
      'Failed to load contract for allocation tab',
    );
    throw error;
  }
  if (!data) throw new NotFoundError('Contract');
  return {
    id: data.id,
    type_id: data.type_id,
    typeName: data.contract_types?.name ?? null,
  };
}

/**
 * vendor_products_details is one row per product × year; the allocation scope
 * is the product itself, so the rows dedupe by product id. Tenancy rides the
 * inner contract embed — the table carries no organization_id of its own.
 */
export async function loadContractProducts(
  organizationId: string,
  contractId: number,
  client: ServiceClient = createClient(),
): Promise<AllocationProduct[]> {
  const rows = await fetchAllPages(
    (from, to) =>
      client
        .from('vendor_products_details')
        .select(
          'id, vendor_products ( id, name ), contract:contracts!inner(organization_id)',
        )
        .eq('contract.organization_id', organizationId)
        .eq('contract_id', contractId)
        .order('id')
        .range(from, to),
    organizationId,
    'contract products',
  );
  const byId = new Map<number, AllocationProduct>();
  for (const row of rows) {
    const product = row.vendor_products;
    if (!product || byId.has(product.id)) continue;
    byId.set(product.id, { id: product.id, name: product.name });
  }
  return [...byId.values()];
}

export async function loadCostAllocationTabData(
  organizationId: string,
  contractId: number,
  client: ServiceClient = createClient(),
): Promise<CostAllocationTabData> {
  const [header, ctx, products] = await Promise.all([
    loadContractHeader(organizationId, contractId, client),
    loadAllocationContextForContract(organizationId, contractId, client),
    loadContractProducts(organizationId, contractId, client),
  ]);

  const resolved = resolveAllocations([{ id: contractId }], ctx).get(
    contractId,
  ) ?? { contractId, scopes: [] };
  const units = [...ctx.unitsById.values()];

  const labelContract = async (id: number) => {
    const header = await loadContractHeader(organizationId, id, client);
    return {
      id: header.id,
      label: `${header.typeName ?? 'Contract'} · ID ${id}`,
    };
  };
  const provenance = allocationProvenance(resolved);
  const parentId = ctx.hierarchy.parents.get(contractId);
  const [sourceContract, parentContract] = await Promise.all([
    provenance.kind === 'inherited'
      ? labelContract(provenance.sourceContractId)
      : null,
    parentId === undefined ? null : labelContract(parentId),
  ]);

  const levelByUnitId: Record<number, OrgUnitLevel> = {};
  for (const unit of units) levelByUnitId[unit.id] = unit.level;

  const seats: AllocationSeat[] = (
    ctx.seatsByContractId.get(contractId) ?? []
  ).map((seat) => ({
    productId: seat.product_id,
    employeeId: seat.org_employee_id,
  }));

  return {
    contractId,
    isInvoice: isInvoiceType(header.type_id),
    resolved,
    hasOwnAllocation:
      (ctx.allocationsByContractId.get(contractId)?.length ?? 0) > 0,
    sourceContract,
    parentContract,
    hasAllocationTargets:
      units.length > 0 ||
      (await anyActiveEmployeeExists(organizationId, client)),
    levelByUnitId,
    seats,
    products,
  };
}
