'use server';
import { createClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '@/data/users';
import { checkAbility } from '@/data/user-permissions';
import { AuthorizationError } from '@/lib/errors';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import type { BusinessGroup, OrgEmployee } from '@/constants/types';
import {
  getBusinessGroupsByLeaf,
  syncOrgUnitsForEmployees,
} from '@/lib/v2/org-units';
import { normalizeEmail, normalizeOptional } from './_email';
import { buildEmployeeRow, type EmployeeRowInput } from './_employee-row';

/** PostgREST caps responses at `max_rows` (1000), so large orgs must paginate. */
const DB_PAGE_SIZE = 1000;
/** Keeps a bulk import inside the route's 180s budget. */
const WRITE_CHUNK_SIZE = 500;
/** On a failed bulk insert, isolate bad rows without retrying the whole file. */
const INSERT_FALLBACK_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * `buildEmployeeRow` omits `status` when it is absent, so a batch can hold
 * rows with different key sets. PostgREST fills any key a row is missing with
 * the column DEFAULT, which would reset `status` to 'active' — the exact
 * clobber the omission exists to prevent. Grouping by key signature keeps
 * every batch homogeneous. At most two groups exist in practice.
 */
function groupByKeySignature<T extends { row: Record<string, unknown> }>(
  items: T[],
): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const signature = Object.keys(item.row).sort().join(',');
    const group = groups.get(signature);
    if (group) group.push(item);
    else groups.set(signature, [item]);
  }
  return Array.from(groups.values());
}

const ORG_EMPLOYEE_SELECT =
  'id, organization_id, first_name, last_name, email, employee_id, region, country, division, department, cost_center, business_unit, entity, team, org_unit_id, start_date, leave_date, status, created_at, updated_at';

type OrgEmployeeRow = Omit<OrgEmployee, 'businessGroup'>;

async function withBusinessGroups(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  rows: OrgEmployeeRow[],
): Promise<OrgEmployee[]> {
  const byLeaf = rows.some((row) => row.org_unit_id !== null)
    ? await getBusinessGroupsByLeaf(organizationId, supabase)
    : new Map<number, BusinessGroup>();
  return rows.map((row) => ({
    ...row,
    businessGroup:
      row.org_unit_id === null ? null : (byLeaf.get(row.org_unit_id) ?? null),
  }));
}

/** The write selects run before the sync stamps org_unit_id, so read after. */
async function readOrgEmployee(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  employeeId: number,
): Promise<OrgEmployee> {
  const { data, error } = await supabase
    .from('org_employees')
    .select<string, OrgEmployeeRow>(ORG_EMPLOYEE_SELECT)
    .eq('organization_id', organizationId)
    .eq('id', employeeId)
    .single();

  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId, employeeId },
      'Failed to read org employee',
    );
    throw error;
  }
  const [employee] = await withBusinessGroups(supabase, organizationId, [data]);
  return employee;
}

async function assertOrgAccess(organizationId: string) {
  const me = await getUserMetadata();
  if (!me?.organizationId) {
    throw new AuthorizationError('Not authenticated');
  }
  if (me.organizationId !== organizationId) {
    throw new AuthorizationError('Cross-organization access denied');
  }
  return me;
}

/**
 * Every export here is a server action, so org membership alone is not a
 * boundary: a read-only account can call one directly with a recovered
 * Next-Action id. Writes carry the same ability the directory page requires.
 */
async function assertCanManageEmployees() {
  if (!(await checkAbility('manage', 'Organization'))) {
    throw new AuthorizationError('Insufficient permissions');
  }
}

async function assertEmployeeAccess(employeeId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('org_employees')
    .select('organization_id, deleted_at')
    .eq('id', employeeId)
    .single();
  if (error || !data || data.deleted_at) {
    throw new AuthorizationError('Employee not found');
  }
  await assertOrgAccess(data.organization_id);
  return data.organization_id;
}

export async function getOrgEmployees(organizationId: string) {
  await assertOrgAccess(organizationId);

  const supabase = createClient();
  const all: OrgEmployeeRow[] = [];

  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('org_employees')
      .select<string, OrgEmployeeRow>(ORG_EMPLOYEE_SELECT)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('last_name')
      .order('first_name')
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);

    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < DB_PAGE_SIZE) break;
  }

  return withBusinessGroups(supabase, organizationId, all);
}

export async function addOrgEmployee({
  organizationId,
  first_name,
  last_name,
  email,
  employee_id,
  region,
  country,
  division,
  department,
  cost_center,
  business_unit,
  entity,
  team,
  business_group_node_id,
  start_date,
  leave_date,
}: {
  organizationId: string;
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
  business_group_node_id?: number;
  start_date?: string;
  leave_date?: string;
}) {
  await assertCanManageEmployees();
  await assertOrgAccess(organizationId);

  const supabase = createClient();
  const { data, error } = await supabase
    .from('org_employees')
    .insert({
      organization_id: organizationId,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: normalizeEmail(email),
      employee_id: normalizeOptional(employee_id),
      region: normalizeOptional(region),
      country: normalizeOptional(country),
      division: normalizeOptional(division),
      department: normalizeOptional(department),
      cost_center: normalizeOptional(cost_center),
      business_unit: normalizeOptional(business_unit),
      entity: normalizeOptional(entity),
      team: normalizeOptional(team),
      start_date: start_date ?? null,
      leave_date: leave_date ?? null,
    })
    .select('id')
    .single();

  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId },
      'Failed to add org employee',
    );
    throw error;
  }
  await syncOrgUnitsForEmployees(
    organizationId,
    [data.id],
    supabase,
    business_group_node_id === undefined
      ? undefined
      : new Map([[data.id, business_group_node_id]]),
  );
  return readOrgEmployee(supabase, organizationId, data.id);
}

export type BulkImportResult = {
  inserted: number;
  updated: number;
  skippedDuplicates: number;
  errors: { rowIndex: number; reason: string }[];
};

function friendlyPgErrorReason(err: {
  code?: string;
  message?: string;
}): string {
  switch (err.code) {
    case '22008':
    case '22007':
      return 'Invalid date — please use YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY';
    case '22P02':
      return 'Invalid value — could not be converted to the expected type';
    case '22001':
      return 'A value is too long for its column';
    case '23502':
      return 'A required field is empty';
    case '23505':
      return 'Email already exists in directory';
    case '23514':
      return 'A value did not meet validation rules';
    default:
      return err.message || 'Unknown error';
  }
}

export async function addOrgEmployees(
  employees: (EmployeeRowInput & { sourceRowIndex?: number })[],
): Promise<BulkImportResult> {
  const result: BulkImportResult = {
    inserted: 0,
    updated: 0,
    skippedDuplicates: 0,
    errors: [],
  };
  if (employees.length === 0) return result;

  const orgIds = new Set(employees.map((e) => e.organization_id));
  if (orgIds.size > 1) {
    throw new AuthorizationError('Mixed organization IDs in bulk insert');
  }
  const orgId = employees[0].organization_id;
  await assertCanManageEmployees();
  await assertOrgAccess(orgId);

  const supabase = createClient();

  const toRow = buildEmployeeRow;

  const allRows = employees.map((e, i) => ({
    row: toRow(e),
    rowIndex: e.sourceRowIndex ?? i,
    businessGroupNodeId: e.business_group_node_id,
  }));

  // PostgREST caps responses at max_rows (1000). An unpaginated read here would
  // silently hide every employee past the first page, so a re-import of a
  // larger directory would classify them as new and fail on the email index.
  const existing: {
    id: number;
    employee_id: string | null;
    email: string | null;
    first_name: string;
    last_name: string;
  }[] = [];

  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error: existingError } = await supabase
      .from('org_employees')
      .select('id, employee_id, email, first_name, last_name')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);

    if (existingError) {
      logger.error(
        { error: sanitizeForLogging(existingError), orgId },
        'Failed to load existing employees for dedup',
      );
      throw existingError;
    }

    existing.push(...(data ?? []));
    if (!data || data.length < DB_PAGE_SIZE) break;
  }

  const byEmployeeId = new Map<string, number>();
  const byEmail = new Map<string, number>();
  const nameOnlyExistingIds = new Map<
    string,
    { id: number; hasEmailOrEmployeeId: boolean }
  >();
  const nameKey = (first: string, last: string) =>
    `${first.trim().toLowerCase()}\0${last.trim().toLowerCase()}`;

  for (const e of existing) {
    if (e.employee_id) byEmployeeId.set(e.employee_id, e.id);
    if (e.email) byEmail.set(e.email.toLowerCase(), e.id);
    nameOnlyExistingIds.set(nameKey(e.first_name, e.last_name), {
      id: e.id,
      hasEmailOrEmployeeId: !!(e.email || e.employee_id),
    });
  }

  const findExistingId = (
    row: ReturnType<typeof toRow>,
  ): number | undefined => {
    if (row.employee_id && byEmployeeId.has(row.employee_id)) {
      return byEmployeeId.get(row.employee_id);
    }
    if (row.email && byEmail.has(row.email)) {
      return byEmail.get(row.email);
    }
    if (row.email || row.employee_id) return undefined;
    const match = nameOnlyExistingIds.get(
      nameKey(row.first_name, row.last_name),
    );
    if (match && !match.hasEmailOrEmployeeId) {
      return match.id;
    }
    return undefined;
  };

  const toUpdate: {
    id: number;
    row: ReturnType<typeof toRow>;
    rowIndex: number;
    businessGroupNodeId: number | undefined;
  }[] = [];
  const toInsert: {
    row: ReturnType<typeof toRow>;
    rowIndex: number;
    businessGroupNodeId: number | undefined;
  }[] = [];
  const claimedIds = new Set<number>();
  const seenInsertEmployeeIds = new Set<string>();
  const seenInsertEmails = new Set<string>();
  const seenInsertNames = new Set<string>();

  for (const { row, rowIndex, businessGroupNodeId } of allRows) {
    const existingId = findExistingId(row);
    if (existingId !== undefined) {
      if (claimedIds.has(existingId)) {
        result.skippedDuplicates += 1;
        continue;
      }
      claimedIds.add(existingId);
      toUpdate.push({ id: existingId, row, rowIndex, businessGroupNodeId });
      continue;
    }

    if (row.employee_id) {
      if (seenInsertEmployeeIds.has(row.employee_id)) {
        result.skippedDuplicates += 1;
        continue;
      }
      seenInsertEmployeeIds.add(row.employee_id);
    } else if (row.email) {
      if (seenInsertEmails.has(row.email)) {
        result.skippedDuplicates += 1;
        continue;
      }
      seenInsertEmails.add(row.email);
    } else {
      const key = nameKey(row.first_name, row.last_name);
      if (seenInsertNames.has(key)) {
        result.skippedDuplicates += 1;
        continue;
      }
      seenInsertNames.add(key);
    }
    toInsert.push({ row, rowIndex, businessGroupNodeId });
  }

  const writtenIds: number[] = [];
  const businessGroupOverrides = new Map<number, number | null>();
  const recordWritten = (
    id: number,
    businessGroupNodeId: number | undefined,
  ) => {
    writtenIds.push(id);
    if (businessGroupNodeId !== undefined) {
      businessGroupOverrides.set(id, businessGroupNodeId);
    }
  };

  // Postgres does not promise that INSERT ... RETURNING follows VALUES order,
  // so returned rows are matched back to their input by identity. The dedup
  // classes above make each tag's key unique within toInsert.
  const insertKey = (row: {
    employee_id?: string | null;
    email?: string | null;
    first_name: string;
    last_name: string;
  }) =>
    row.employee_id
      ? `e\0${row.employee_id}`
      : row.email
        ? `m\0${row.email}`
        : `n\0${nameKey(row.first_name, row.last_name)}`;
  const INSERT_RETURNING = 'id, employee_id, email, first_name, last_name';
  const recordInserted = (
    items: typeof toInsert,
    returned: Parameters<typeof insertKey>[0][] & { id: number }[],
  ) => {
    const byKey = new Map(items.map((t) => [insertKey(t.row), t]));
    for (const r of returned) {
      recordWritten(r.id, byKey.get(insertKey(r))?.businessGroupNodeId);
    }
  };

  const insertBatches = groupByKeySignature(toInsert).flatMap((group) =>
    chunk(group, WRITE_CHUNK_SIZE),
  );

  for (const batch of insertBatches) {
    const { data, error } = await supabase
      .from('org_employees')
      .insert(batch.map((t) => t.row))
      .select(INSERT_RETURNING);

    if (!error) {
      result.inserted += data?.length ?? 0;
      recordInserted(batch, data ?? []);
      continue;
    }

    // Bulk insert failed — narrow down to smaller batches, then to single rows,
    // so one bad row costs a bounded number of retries rather than one round
    // trip per row in the whole file.
    logger.warn(
      { error: sanitizeForLogging(error), orgId, count: batch.length },
      'Bulk insert failed, falling back to smaller batches',
    );

    for (const subBatch of chunk(batch, INSERT_FALLBACK_CHUNK_SIZE)) {
      const retry = await supabase
        .from('org_employees')
        .insert(subBatch.map((t) => t.row))
        .select(INSERT_RETURNING);

      if (!retry.error) {
        result.inserted += retry.data?.length ?? 0;
        recordInserted(subBatch, retry.data ?? []);
        continue;
      }

      for (const { row, rowIndex, businessGroupNodeId } of subBatch) {
        const single = await supabase
          .from('org_employees')
          .insert(row)
          .select('id')
          .single();
        if (single.error) {
          result.errors.push({
            rowIndex,
            reason: friendlyPgErrorReason(
              single.error as { code?: string; message?: string },
            ),
          });
        } else {
          result.inserted += 1;
          recordWritten(single.data.id, businessGroupNodeId);
        }
      }
    }
  }

  // A full weekly snapshot puts nearly every row on the update path, so these
  // must be batched: one round trip per row would exceed the route's budget.
  const updatedAt = new Date().toISOString();
  const updateBatches = groupByKeySignature(toUpdate).flatMap((group) =>
    chunk(group, WRITE_CHUNK_SIZE),
  );

  for (const batch of updateBatches) {
    const { data, error } = await supabase
      .from('org_employees')
      .upsert(
        batch.map(({ id, row }) => ({ ...row, id, updated_at: updatedAt })),
        { onConflict: 'id' },
      )
      .select('id');

    if (!error) {
      // Count what the database actually wrote, not what was submitted.
      result.updated += data?.length ?? 0;
      const byId = new Map(batch.map((t) => [t.id, t.businessGroupNodeId]));
      for (const r of data ?? []) recordWritten(r.id, byId.get(r.id));
      continue;
    }

    logger.warn(
      { error: sanitizeForLogging(error), orgId, count: batch.length },
      'Bulk update failed, falling back to per-row',
    );

    for (const { id, row, rowIndex, businessGroupNodeId } of batch) {
      const single = await supabase
        .from('org_employees')
        .update({ ...row, updated_at: updatedAt })
        .eq('id', id)
        // The service client bypasses RLS, so scope every write explicitly.
        .eq('organization_id', orgId);
      if (single.error) {
        logger.error(
          { error: sanitizeForLogging(single.error), employeeId: id },
          'Failed to update existing employee during bulk import',
        );
        result.errors.push({
          rowIndex,
          reason: friendlyPgErrorReason(
            single.error as { code?: string; message?: string },
          ),
        });
      } else {
        result.updated += 1;
        recordWritten(id, businessGroupNodeId);
      }
    }
  }

  if (writtenIds.length > 0) {
    await syncOrgUnitsForEmployees(
      orgId,
      writtenIds,
      supabase,
      businessGroupOverrides,
    );
  }

  return result;
}

export async function updateOrgEmployee({
  employeeId,
  first_name,
  last_name,
  email,
  employee_id,
  region,
  country,
  division,
  department,
  cost_center,
  business_unit,
  entity,
  team,
  business_group_node_id,
  start_date,
  leave_date,
  status,
}: {
  employeeId: number;
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
  /** A business_group node id; null clears, undefined leaves it alone. */
  business_group_node_id?: number | null;
  start_date?: string | null;
  leave_date?: string | null;
  status?: 'active' | 'inactive' | 'on_leave';
}) {
  await assertCanManageEmployees();
  const organizationId = await assertEmployeeAccess(employeeId);

  const supabase = createClient();
  const { error } = await supabase
    .from('org_employees')
    .update({
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: normalizeEmail(email),
      employee_id: normalizeOptional(employee_id),
      region: normalizeOptional(region),
      country: normalizeOptional(country),
      division: normalizeOptional(division),
      department: normalizeOptional(department),
      cost_center: normalizeOptional(cost_center),
      business_unit: normalizeOptional(business_unit),
      entity: normalizeOptional(entity),
      team: normalizeOptional(team),
      start_date,
      leave_date,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', employeeId)
    // The service client bypasses RLS, so scope every write explicitly.
    .eq('organization_id', organizationId);

  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), employeeId },
      'Failed to update org employee',
    );
    throw error;
  }
  await syncOrgUnitsForEmployees(
    organizationId,
    [employeeId],
    supabase,
    business_group_node_id === undefined
      ? undefined
      : new Map([[employeeId, business_group_node_id]]),
  );
  return readOrgEmployee(supabase, organizationId, employeeId);
}

export async function deleteOrgEmployee(employeeId: number) {
  await assertCanManageEmployees();
  await assertEmployeeAccess(employeeId);

  const supabase = createClient();
  const { error } = await supabase
    .from('org_employees')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', employeeId)
    .is('deleted_at', null);

  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), employeeId },
      'Failed to delete org employee',
    );
    throw error;
  }
}
