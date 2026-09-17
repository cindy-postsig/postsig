import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { getContract } from '@/lib/v2';
import { syncOrgUnitsForEmployees } from '@/lib/v2/org-units';
import { requireMcpContext, requireScope } from '@/app/lib/mcp/context';
import { NotFoundToolError, ValidationToolError } from '@/app/lib/mcp/errors';

export type EmployeeConflictPolicy = 'link_only' | 'update_org_employee';

export interface UserUpsertInput {
  email?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  employee_id?: string | null;
  cost_center?: string | null;
  country?: string | null;
  region?: string | null;
  department?: string | null;
  division?: string | null;
  start_date?: string | null;
  leave_date?: string | null;
}

interface NormalizedUser {
  email: string | null;
  name: string;
  first_name: string;
  last_name: string;
  employee_id: string | null;
  cost_center: string | null;
  country: string | null;
  region: string | null;
  department: string | null;
  division: string | null;
  start_date: string | null;
  leave_date: string | null;
  raw: UserUpsertInput;
}

interface SkippedRow {
  reason: string;
  row: UserUpsertInput;
}

type PlanCategory =
  | 'new_employee'
  | 'existing_match_clean'
  | 'existing_match_with_diffs'
  | 'already_linked';

interface PlanRow {
  category: PlanCategory;
  matchedBy?: 'employee_id' | 'email' | 'name';
  identity: { name: string; email: string | null; employee_id: string | null };
  orgEmployeeId?: number;
  contractUserId?: number;
  differences?: Record<string, { from: unknown; to: unknown }>;
}

export interface AddUsersResult {
  contract: {
    id: number;
    name: string | null;
    vendor: { id: number | null; name: string | null };
    termStart: string | null;
    termEnd: string | null;
  };
  product: { id: number; name: string | null } | null;
  parsedRowCount: number;
  validRowCount: number;
  skipped: SkippedRow[];
  plan: PlanRow[];
  summary: {
    newEmployees: number;
    existingMatchesClean: number;
    existingMatchesWithDiffs: number;
    alreadyLinked: number;
  };
  dryRun: boolean;
  onEmployeeConflict: EmployeeConflictPolicy;
  applied: {
    orgEmployeesInserted: number;
    orgEmployeesUpdated: number;
    contractUsersInserted: number;
    contractUsersUpdated: number;
  };
}

const TRACKED_EMPLOYEE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'employee_id',
  'cost_center',
  'country',
  'region',
  'department',
  'division',
  'start_date',
  'leave_date',
] as const;

const CONTRACT_USER_SNAPSHOT_FIELDS = [
  'name',
  'email',
  'employee_id',
  'cost_center',
  'country',
  'region',
  'department',
  'division',
  'start_date',
  'leave_date',
] as const;

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function normalize(row: UserUpsertInput): NormalizedUser | null {
  const email = row.email ? row.email.trim().toLowerCase() : null;
  let first = row.first_name?.trim() ?? '';
  let last = row.last_name?.trim() ?? '';
  let name = row.name?.trim() ?? '';
  if (!name && (first || last)) name = [first, last].filter(Boolean).join(' ');
  if (!name) return null;
  if (!first && !last) ({ first, last } = splitName(name));

  return {
    email: email || null,
    name,
    first_name: first,
    last_name: last,
    employee_id: row.employee_id?.trim() || null,
    cost_center: row.cost_center?.trim() || null,
    country: row.country?.trim() || null,
    region: row.region?.trim() || null,
    department: row.department?.trim() || null,
    division: row.division?.trim() || null,
    start_date: row.start_date || null,
    leave_date: row.leave_date || null,
    raw: row,
  };
}

interface OrgEmployeeRow {
  id: number;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  employee_id: string | null;
  cost_center: string | null;
  country: string | null;
  region: string | null;
  department: string | null;
  division: string | null;
  start_date: string | null;
  leave_date: string | null;
}

interface ContractUserRow {
  id: number;
  contract_id: number | null;
  product_id: number | null;
  org_employee_id: number | null;
  name: string;
  email: string | null;
  employee_id: string | null;
  cost_center: string | null;
  country: string | null;
  region: string | null;
  department: string | null;
  division: string | null;
  start_date: string | null;
  leave_date: string | null;
}

function matchOrgEmployee(
  user: NormalizedUser,
  pool: OrgEmployeeRow[],
): { row: OrgEmployeeRow; via: 'employee_id' | 'email' | 'name' } | null {
  if (user.employee_id) {
    const byId = pool.find(
      (r) =>
        r.employee_id &&
        r.employee_id.trim().toLowerCase() === user.employee_id!.toLowerCase(),
    );
    if (byId) return { row: byId, via: 'employee_id' };
  }
  if (user.email) {
    const byEmail = pool.find(
      (r) => r.email && r.email.trim().toLowerCase() === user.email,
    );
    if (byEmail) return { row: byEmail, via: 'email' };
  }
  const target = user.name.trim().toLowerCase();
  const byName = pool.find(
    (r) =>
      [r.first_name, r.last_name]
        .filter(Boolean)
        .join(' ')
        .trim()
        .toLowerCase() === target,
  );
  if (byName) return { row: byName, via: 'name' };
  return null;
}

function diffEmployee(
  user: NormalizedUser,
  existing: OrgEmployeeRow,
): Record<string, { from: unknown; to: unknown }> {
  const diffs: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of TRACKED_EMPLOYEE_FIELDS) {
    const newVal = user[f];
    const oldVal = existing[f];
    if (newVal !== null && newVal !== '' && newVal !== oldVal) {
      diffs[f] = { from: oldVal, to: newVal };
    }
  }
  return diffs;
}

export async function addUsersToContract(args: {
  contractId: number;
  productId?: number;
  users: UserUpsertInput[];
  dryRun: boolean;
  onEmployeeConflict: EmployeeConflictPolicy;
}): Promise<AddUsersResult> {
  // Defense-in-depth: scope is also checked at the tool wrapper, but enforce
  // here too so any future caller into this function fails closed.
  requireScope('write');
  const ctx = requireMcpContext();
  const supabase = createServiceClient();

  // getContract uses ALS for auth context and applies org scoping; it returns
  // the contract's joined display fields (contract_name, vendor, dates).
  const contract = (await getContract(args.contractId)) as
    | (Record<string, unknown> & {
        id: number;
        organization_id?: string | null;
        contract_name?: string | null;
        vendor_id?: number | null;
        vendor?: { name?: string | null } | null;
        term_start_date?: Array<{ date: string }> | null;
        term_end_date?: Array<{ date: string }> | null;
      })
    | null;

  if (!contract) {
    throw new NotFoundToolError('Contract', args.contractId);
  }
  // Fail closed: a missing organization_id on the contract is treated as a
  // mismatch, not a pass. We never want to mutate a row whose tenancy we
  // can't positively verify.
  if (contract.organization_id !== ctx.userMetadata.organizationId) {
    logger.error(
      {
        contractId: args.contractId,
        contractOrg: contract.organization_id ?? null,
        userOrg: ctx.userMetadata.organizationId,
        tokenId: ctx.tokenId,
      },
      'mcp: contract org mismatch on add_users_to_contract',
    );
    throw new NotFoundToolError('Contract', args.contractId);
  }

  let productInfo: { id: number; name: string | null } | null = null;
  if (args.productId !== undefined) {
    const { data: vpu } = await supabase
      .from('vendor_products_users')
      .select('id, product_id, vendor_products(id, name)')
      .eq('contract_id', args.contractId)
      .eq('product_id', args.productId)
      .maybeSingle();
    if (!vpu) {
      throw new ValidationToolError(
        `Product ${args.productId} is not on contract ${args.contractId}`,
      );
    }
    productInfo = {
      id: args.productId,
      name:
        (vpu as unknown as { vendor_products?: { name?: string } | null })
          .vendor_products?.name ?? null,
    };
  }

  // Normalize input rows
  const skipped: SkippedRow[] = [];
  const normalized: NormalizedUser[] = [];
  for (const row of args.users) {
    const n = normalize(row);
    if (!n) {
      skipped.push({
        reason: 'missing name (provide name or first_name+last_name)',
        row,
      });
      continue;
    }
    normalized.push(n);
  }

  // Load org_employees pool for the org
  const { data: orgEmployees, error: orgErr } = await supabase
    .from('org_employees')
    .select(
      'id, organization_id, first_name, last_name, email, employee_id, cost_center, country, region, department, division, start_date, leave_date',
    )
    .eq('organization_id', ctx.userMetadata.organizationId)
    .is('deleted_at', null);

  if (orgErr) {
    logger.error(
      { err: orgErr, orgId: ctx.userMetadata.organizationId },
      'mcp: failed to load org_employees',
    );
    throw new Error('Failed to load org employees');
  }
  const orgPool = (orgEmployees ?? []) as OrgEmployeeRow[];

  // Load existing contract_users for this contract+product
  let existingQuery = supabase
    .from('contract_users')
    .select(
      'id, contract_id, product_id, org_employee_id, name, email, employee_id, cost_center, country, region, department, division, start_date, leave_date',
    )
    .eq('contract_id', args.contractId)
    // A released seat must not block re-adding the same person
    .is('released_at', null);
  if (args.productId !== undefined) {
    existingQuery = existingQuery.eq('product_id', args.productId);
  } else {
    existingQuery = existingQuery.is('product_id', null);
  }
  const { data: existingUsers, error: existingErr } = await existingQuery;
  if (existingErr) {
    logger.error(
      { err: existingErr, contractId: args.contractId },
      'mcp: failed to load contract_users',
    );
    throw new Error('Failed to load existing contract users');
  }
  const existingPool = (existingUsers ?? []) as ContractUserRow[];

  const findExistingLink = (
    user: NormalizedUser,
    orgEmployeeId: number | null,
  ): ContractUserRow | null => {
    if (orgEmployeeId !== null) {
      const byOrg = existingPool.find(
        (r) => r.org_employee_id === orgEmployeeId,
      );
      if (byOrg) return byOrg;
    }
    if (user.email) {
      const byEmail = existingPool.find(
        (r) => r.email && r.email.trim().toLowerCase() === user.email,
      );
      if (byEmail) return byEmail;
    }
    if (user.employee_id) {
      const byEmp = existingPool.find(
        (r) =>
          r.employee_id &&
          r.employee_id.trim().toLowerCase() ===
            user.employee_id!.toLowerCase(),
      );
      if (byEmp) return byEmp;
    }
    const target = user.name.trim().toLowerCase();
    const byName = existingPool.find(
      (r) => r.name.trim().toLowerCase() === target,
    );
    return byName ?? null;
  };

  const plan: PlanRow[] = [];
  const orgInserts: NormalizedUser[] = [];
  const orgUpdates: Array<{
    id: number;
    patch: Record<string, unknown>;
  }> = [];
  const contractInserts: Array<{
    user: NormalizedUser;
    orgEmployeeId: number | null;
  }> = [];
  const contractUpdates: Array<{
    id: number;
    patch: Record<string, unknown>;
    orgEmployeeId: number | null;
  }> = [];

  const summary = {
    newEmployees: 0,
    existingMatchesClean: 0,
    existingMatchesWithDiffs: 0,
    alreadyLinked: 0,
  };

  for (const u of normalized) {
    const match = matchOrgEmployee(u, orgPool);
    const orgEmployeeId = match?.row.id ?? null;

    const existingLink = findExistingLink(u, orgEmployeeId);

    if (existingLink) {
      // Already on this contract+product. Refresh snapshot fields.
      const patch: Record<string, unknown> = {};
      if (
        orgEmployeeId !== null &&
        existingLink.org_employee_id !== orgEmployeeId
      ) {
        patch.org_employee_id = orgEmployeeId;
      }
      for (const f of CONTRACT_USER_SNAPSHOT_FIELDS) {
        const newVal = u[f];
        const oldVal = existingLink[f];
        if (newVal !== null && newVal !== '' && newVal !== oldVal) {
          patch[f] = newVal;
        }
      }
      if (Object.keys(patch).length) {
        contractUpdates.push({
          id: existingLink.id,
          patch,
          orgEmployeeId,
        });
      }
      plan.push({
        category: 'already_linked',
        matchedBy: match?.via,
        identity: {
          name: u.name,
          email: u.email,
          employee_id: u.employee_id,
        },
        orgEmployeeId: orgEmployeeId ?? undefined,
        contractUserId: existingLink.id,
      });
      summary.alreadyLinked += 1;
      continue;
    }

    if (match) {
      const diffs = diffEmployee(u, match.row);
      if (Object.keys(diffs).length === 0) {
        plan.push({
          category: 'existing_match_clean',
          matchedBy: match.via,
          identity: {
            name: u.name,
            email: u.email,
            employee_id: u.employee_id,
          },
          orgEmployeeId: match.row.id,
        });
        summary.existingMatchesClean += 1;
      } else {
        plan.push({
          category: 'existing_match_with_diffs',
          matchedBy: match.via,
          identity: {
            name: u.name,
            email: u.email,
            employee_id: u.employee_id,
          },
          orgEmployeeId: match.row.id,
          differences: diffs,
        });
        summary.existingMatchesWithDiffs += 1;
        if (args.onEmployeeConflict === 'update_org_employee') {
          const patch: Record<string, unknown> = {};
          for (const [field, change] of Object.entries(diffs)) {
            patch[field] = change.to;
          }
          orgUpdates.push({ id: match.row.id, patch });
        }
      }
      contractInserts.push({ user: u, orgEmployeeId: match.row.id });
    } else {
      plan.push({
        category: 'new_employee',
        identity: {
          name: u.name,
          email: u.email,
          employee_id: u.employee_id,
        },
      });
      summary.newEmployees += 1;
      orgInserts.push(u);
      // contract_users row added after the org_employees insert resolves to an id
    }
  }

  const applied = {
    orgEmployeesInserted: 0,
    orgEmployeesUpdated: 0,
    contractUsersInserted: 0,
    contractUsersUpdated: 0,
  };

  if (!args.dryRun) {
    const employeeIdsToSync: number[] = [];

    // Insert new org_employees, capture ids in input order
    if (orgInserts.length) {
      const payload = orgInserts.map((u) => ({
        organization_id: ctx.userMetadata.organizationId,
        first_name: u.first_name || u.name,
        last_name: u.last_name || '',
        email: u.email,
        employee_id: u.employee_id,
        cost_center: u.cost_center,
        country: u.country,
        region: u.region,
        department: u.department,
        division: u.division,
        start_date: u.start_date,
        leave_date: u.leave_date,
        status: 'active',
      }));
      const { data: inserted, error: orgInsErr } = await supabase
        .from('org_employees')
        .insert(payload as never)
        .select('id');
      if (orgInsErr) {
        logger.error(
          { err: orgInsErr, count: orgInserts.length },
          'mcp: org_employees insert failed',
        );
        throw new Error('Failed to create employees');
      }
      applied.orgEmployeesInserted = inserted?.length ?? 0;
      const ids = (inserted ?? []) as Array<{ id: number }>;
      for (let i = 0; i < orgInserts.length; i++) {
        contractInserts.push({
          user: orgInserts[i],
          orgEmployeeId: ids[i]?.id ?? null,
        });
      }
      employeeIdsToSync.push(...ids.map((r) => r.id));
    }

    // Apply org_employee field updates
    for (const upd of orgUpdates) {
      const { error } = await supabase
        .from('org_employees')
        .update(upd.patch as never)
        .eq('id', upd.id)
        .eq('organization_id', ctx.userMetadata.organizationId);
      if (error) {
        logger.error(
          { err: error, id: upd.id },
          'mcp: org_employees update failed',
        );
        throw new Error('Failed to update employee');
      }
      applied.orgEmployeesUpdated += 1;
      employeeIdsToSync.push(upd.id);
    }

    // Insert contract_users
    if (contractInserts.length) {
      const payload = contractInserts.map(({ user, orgEmployeeId }) => ({
        contract_id: args.contractId,
        product_id: args.productId ?? null,
        org_employee_id: orgEmployeeId,
        name: user.name,
        email: user.email,
        employee_id: user.employee_id,
        cost_center: user.cost_center,
        country: user.country,
        region: user.region,
        department: user.department,
        division: user.division,
        start_date: user.start_date,
        leave_date: user.leave_date,
      }));
      const { data: inserted, error: cuInsErr } = await supabase
        .from('contract_users')
        .insert(payload as never)
        .select('id');
      if (cuInsErr) {
        logger.error(
          { err: cuInsErr, contractId: args.contractId },
          'mcp: contract_users insert failed',
        );
        throw new Error('Failed to link users to contract');
      }
      applied.contractUsersInserted = inserted?.length ?? 0;
    }

    // Update contract_users snapshot fields
    for (const upd of contractUpdates) {
      const { error } = await supabase
        .from('contract_users')
        .update(upd.patch as never)
        .eq('id', upd.id);
      if (error) {
        logger.error(
          { err: error, id: upd.id, contractId: args.contractId },
          'mcp: contract_users update failed',
        );
        throw new Error('Failed to update contract user');
      }
      applied.contractUsersUpdated += 1;
    }

    // Runs after the linkage so a hierarchy failure cannot leave employees
    // created but unlinked. This tool never writes entity, business_unit,
    // team, or the business group, so the walk over employees it creates is
    // partial by construction: their paths cover only the levels this tool
    // carries (PSK-1846).
    if (employeeIdsToSync.length) {
      await syncOrgUnitsForEmployees(
        ctx.userMetadata.organizationId,
        employeeIdsToSync,
        supabase,
      );
    }
  }

  return {
    contract: {
      id: contract.id,
      name: contract.contract_name ?? null,
      vendor: {
        id: contract.vendor_id ?? null,
        name: contract.vendor?.name ?? null,
      },
      termStart: contract.term_start_date?.[0]?.date ?? null,
      termEnd: contract.term_end_date?.[0]?.date ?? null,
    },
    product: productInfo,
    parsedRowCount: args.users.length,
    validRowCount: normalized.length,
    skipped,
    plan,
    summary,
    dryRun: args.dryRun,
    onEmployeeConflict: args.onEmployeeConflict,
    applied,
  };
}
