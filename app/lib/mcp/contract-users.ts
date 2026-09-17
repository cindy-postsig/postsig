import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { NotFoundToolError } from '@/app/lib/mcp/errors';
import {
  getBusinessGroupsByLeaf,
  type BusinessGroupNode,
} from '@/lib/v2/org-units';

/**
 * Two storage sites for the same person can disagree:
 *   - contract_users carries an inline snapshot (legacy + add-row flow)
 *   - org_employees, when contract_users.org_employee_id is set, is the
 *     canonical master record (HR-style fields edited org-wide)
 *
 * Precedence: when org_employees is present and not soft-deleted, its fields
 * override the inline snapshot. This mirrors useContractUsers in the UI hook
 * so MCP narration and on-screen narration can't disagree.
 *
 * Group is the exception: it is resolved from the employee's org-unit path, so
 * the frozen inline group snapshot is never read — an unlinked row has no group
 * rather than a stale one.
 */
export interface EnrichedContractUser {
  id: number;
  name: string;
  email: string | null;
  product: { id: number; name: string } | null;
  employeeId: string | null;
  costCenter: string | null;
  country: string | null;
  region: string | null;
  division: string | null;
  department: string | null;
  group: { id: number; name: string } | null;
  startDate: string | null;
  leaveDate: string | null;
  status: 'active' | 'inactive' | 'on_leave';
  orgEmployeeId: number | null;
  /**
   * True when the row resolves via org_employees (the canonical master record).
   * False when only the inline contract_users snapshot exists (legacy data
   * or rows added without linking). Surfacing this lets an agent flag stale
   * inline data when answering metadata questions.
   */
  linkedToOrgEmployee: boolean;
}

interface RawContractUserRow {
  id: number;
  name: string | null;
  email: string | null;
  product_id: number | null;
  vendor_products: { id: number; name: string } | null;
  employee_id: string | null;
  region: string | null;
  country: string | null;
  division: string | null;
  department: string | null;
  cost_center: string | null;
  start_date: string | null;
  leave_date: string | null;
  org_employee_id: number | null;
  org_employees: {
    id: number;
    organization_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    employee_id: string | null;
    region: string | null;
    country: string | null;
    division: string | null;
    department: string | null;
    cost_center: string | null;
    org_unit_id: number | null;
    businessGroup?: BusinessGroupNode | null;
    start_date: string | null;
    leave_date: string | null;
    status: 'active' | 'inactive' | 'on_leave' | null;
    deleted_at: string | null;
  } | null;
}

function merge(row: RawContractUserRow): EnrichedContractUser | null {
  const oe = row.org_employees;
  // Soft-deleted org_employees → drop the row (matches useContractUsers).
  // An inline snapshot pointing at a deleted master record is treated as
  // detached rather than fallen-back-to.
  if (oe && oe.deleted_at) return null;

  const linked = Boolean(oe);
  const oeName =
    oe && [oe.first_name, oe.last_name].filter(Boolean).join(' ').trim();

  return {
    id: row.id,
    name: oeName || row.name || '',
    email: oe?.email ?? row.email,
    product: row.vendor_products
      ? { id: row.vendor_products.id, name: row.vendor_products.name }
      : null,
    employeeId: oe?.employee_id ?? row.employee_id,
    costCenter: oe?.cost_center ?? row.cost_center,
    country: oe?.country ?? row.country,
    region: oe?.region ?? row.region,
    division: oe?.division ?? row.division,
    department: oe?.department ?? row.department,
    group: oe?.businessGroup ?? null,
    startDate: oe?.start_date ?? row.start_date,
    leaveDate: oe?.leave_date ?? row.leave_date,
    status: oe?.status ?? 'active',
    orgEmployeeId: row.org_employee_id,
    linkedToOrgEmployee: linked,
  };
}

const SELECT = `
  id, name, email, product_id,
  vendor_products ( id, name ),
  employee_id, region, country, division, department, cost_center,
  start_date, leave_date,
  org_employee_id,
  org_employees (
    id, organization_id, first_name, last_name, email, employee_id,
    region, country, division, department, cost_center, org_unit_id,
    start_date, leave_date, status, deleted_at
  )
`;

/**
 * Load all contract_users for a contract, merged with their org_employees
 * master record (org_employees wins when present). Org-scoped via the
 * contract row's organization_id; fails closed on mismatch.
 *
 * Use this anywhere MCP tools surface "active users" so the agent sees
 * cost_center, country, region, etc. with the same precedence the UI uses.
 */
export async function resolveContractUsers(
  contractId: number,
  productId?: number,
): Promise<EnrichedContractUser[]> {
  const ctx = requireMcpContext();
  const supabase = createServiceClient();

  // Verify the contract belongs to the caller's org before reading its users.
  // Fail closed when org_id is missing — never read users whose tenancy we
  // can't positively verify (mirrors add_users_to_contract).
  const { data: contract, error: contractErr } = await supabase
    .from('contracts')
    .select('id, organization_id')
    .eq('id', contractId)
    .maybeSingle();

  if (contractErr) {
    logger.error(
      { err: contractErr, contractId },
      'mcp: failed to load contract for user resolution',
    );
    throw new Error('Failed to load contract');
  }
  if (!contract) {
    throw new NotFoundToolError('Contract', contractId);
  }
  if (contract.organization_id !== ctx.userMetadata.organizationId) {
    logger.error(
      {
        contractId,
        contractOrg: contract.organization_id ?? null,
        userOrg: ctx.userMetadata.organizationId,
        tokenId: ctx.tokenId,
      },
      'mcp: contract org mismatch on resolveContractUsers',
    );
    throw new NotFoundToolError('Contract', contractId);
  }

  let query = supabase
    .from('contract_users')
    .select(SELECT)
    .eq('contract_id', contractId);
  if (productId !== undefined) {
    query = query.eq('product_id', productId);
  }

  const { data, error } = await query;
  if (error) {
    logger.error(
      { err: error, contractId, productId },
      'mcp: failed to load contract_users',
    );
    throw new Error('Failed to load contract users');
  }

  const rows = (data ?? []) as unknown as RawContractUserRow[];

  const businessGroupsByLeaf = await getBusinessGroupsByLeaf(
    ctx.userMetadata.organizationId,
    supabase,
  );
  for (const row of rows) {
    const oe = row.org_employees;
    if (!oe) continue;
    oe.businessGroup =
      oe.org_unit_id === null
        ? null
        : (businessGroupsByLeaf.get(oe.org_unit_id) ?? null);
  }

  return rows.map(merge).filter((u): u is EnrichedContractUser => u !== null);
}
