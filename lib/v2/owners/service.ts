import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { AuthorizationError, ValidationError } from '@/lib/errors';
import { logOwnerChanged } from '@/data/superuser/activities';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { employeeDisplayName } from './embed';
import {
  groupRefKey,
  normalizeGroupUnitIds,
  normalizeSponsorRefs,
  sponsorRefKey,
} from './refs';
import type { OwnerSponsorRef } from './types';

type ServiceClient = ReturnType<typeof createClient>;

const FOREIGN_KEY_VIOLATION = '23503';

export interface ReplaceContractOwnersInput {
  organizationId: string;
  contractId: number;
  sponsors: readonly OwnerSponsorRef[];
  groupUnitIds: readonly number[];
  actorUserId: string;
  actorName?: string;
}

export interface ReplaceContractOwnersResult {
  added: number;
  removed: number;
}

export interface SaveContractOwnersInput {
  organizationId: string;
  contractId: number;
  sponsors: readonly OwnerSponsorRef[];
  /** Omitted leaves the contract's groups as they are. */
  groupUnitIds?: readonly number[];
  justification?: string | null;
  order?: string | null;
  actorUserId: string;
  actorName?: string;
}

interface CurrentOwnerRow {
  id: number;
  role: string;
  user_id: string | null;
  org_employee_id: number | null;
  label: string | null;
  org_unit_id: number | null;
}

interface OwnerNames {
  users: Map<string, string>;
  employees: Map<number, string>;
  units: Map<number, string>;
}

function currentRowKey(row: CurrentOwnerRow): string | null {
  if (row.org_unit_id !== null) return groupRefKey(row.org_unit_id);
  if (row.user_id !== null)
    return sponsorRefKey({ kind: 'user', id: row.user_id });
  if (row.org_employee_id !== null) {
    return sponsorRefKey({ kind: 'employee', id: row.org_employee_id });
  }
  if (row.label !== null)
    return sponsorRefKey({ kind: 'label', name: row.label });
  return null;
}

async function readCurrentRows(
  client: ServiceClient,
  organizationId: string,
  contractId: number,
): Promise<CurrentOwnerRow[]> {
  const { data, error } = await client
    .from('contract_owners')
    .select('id, role, user_id, org_employee_id, label, org_unit_id')
    .eq('organization_id', organizationId)
    .eq('contract_id', contractId);
  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId, contractId },
      'Failed to read contract owners',
    );
    throw error;
  }
  return data ?? [];
}

async function loadNames(
  client: ServiceClient,
  organizationId: string,
  userIds: string[],
  employeeIds: number[],
  unitIds: number[],
): Promise<OwnerNames> {
  const names: OwnerNames = {
    users: new Map(),
    employees: new Map(),
    units: new Map(),
  };

  const [users, employees, units] = await Promise.all([
    userIds.length === 0
      ? null
      : client
          .from('users')
          .select('id, name, email')
          .eq('organization_id', organizationId)
          .in('id', userIds),
    employeeIds.length === 0
      ? null
      : client
          .from('org_employees')
          .select('id, first_name, last_name')
          .eq('organization_id', organizationId)
          .in('id', employeeIds),
    unitIds.length === 0
      ? null
      : client
          .from('org_units')
          .select('id, name')
          .eq('organization_id', organizationId)
          .in('id', unitIds),
  ]);

  for (const row of users?.data ?? []) {
    names.users.set(row.id, row.name?.trim() || row.email || '');
  }
  for (const row of employees?.data ?? []) {
    names.employees.set(row.id, employeeDisplayName(row));
  }
  for (const row of units?.data ?? []) {
    names.units.set(row.id, row.name);
  }
  return names;
}

function sponsorDisplayName(ref: OwnerSponsorRef, names: OwnerNames): string {
  if (ref.kind === 'label') return ref.name;
  if (ref.kind === 'user') return names.users.get(ref.id) ?? '';
  return names.employees.get(ref.id) ?? '';
}

function rowDisplayName(row: CurrentOwnerRow, names: OwnerNames): string {
  if (row.label !== null) return row.label;
  if (row.user_id !== null) return names.users.get(row.user_id) ?? '';
  if (row.org_employee_id !== null) {
    return names.employees.get(row.org_employee_id) ?? '';
  }
  return '';
}

/**
 * The single writer of `contract_owners` (psk-1975). Ownership only: it grants
 * no access and attributes no spend.
 *
 * The rows are diffed rather than replaced wholesale — a delete-all followed by
 * a failed insert would leave the contract ownerless — and the inserts run
 * first, so the org guard on the composite tenancy FKs fires before anything
 * is removed.
 */
export async function replaceContractOwners({
  organizationId,
  contractId,
  sponsors,
  groupUnitIds,
  actorUserId,
  actorName,
}: ReplaceContractOwnersInput): Promise<ReplaceContractOwnersResult> {
  const client = createClient();
  const targetSponsors = normalizeSponsorRefs(sponsors);
  const targetUnitIds = normalizeGroupUnitIds(groupUnitIds);

  const currentRows = await readCurrentRows(client, organizationId, contractId);
  const currentKeys = new Set(
    currentRows.map(currentRowKey).filter((key): key is string => key !== null),
  );

  const addedSponsors = targetSponsors.filter(
    (ref) => !currentKeys.has(sponsorRefKey(ref)),
  );
  const addedUnitIds = targetUnitIds.filter(
    (unitId) => !currentKeys.has(groupRefKey(unitId)),
  );

  const targetKeys = new Set([
    ...targetSponsors.map(sponsorRefKey),
    ...targetUnitIds.map(groupRefKey),
  ]);
  const removedRows = currentRows.filter((row) => {
    const key = currentRowKey(row);
    return key === null || !targetKeys.has(key);
  });

  if (
    addedSponsors.length === 0 &&
    addedUnitIds.length === 0 &&
    removedRows.length === 0
  ) {
    return { added: 0, removed: 0 };
  }

  const insertRows = [
    ...addedSponsors.map((ref) => ({
      organization_id: organizationId,
      contract_id: contractId,
      role: 'sponsor',
      user_id: ref.kind === 'user' ? ref.id : null,
      org_employee_id: ref.kind === 'employee' ? ref.id : null,
      label: ref.kind === 'label' ? ref.name : null,
      org_unit_id: null,
      created_by: actorUserId,
    })),
    ...addedUnitIds.map((unitId) => ({
      organization_id: organizationId,
      contract_id: contractId,
      role: 'group',
      user_id: null,
      org_employee_id: null,
      label: null,
      org_unit_id: unitId,
      created_by: actorUserId,
    })),
  ];

  if (insertRows.length > 0) {
    const { error } = await client.from('contract_owners').insert(insertRows);
    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId, contractId },
        'Failed to insert contract owners',
      );
      if (error.code === FOREIGN_KEY_VIOLATION) {
        throw new ValidationError(
          'An owner references a user, employee or group outside this organization',
        );
      }
      throw error;
    }
  }

  if (removedRows.length > 0) {
    const { error } = await client
      .from('contract_owners')
      .delete()
      .eq('organization_id', organizationId)
      .eq('contract_id', contractId)
      .in(
        'id',
        removedRows.map((row) => row.id),
      );
    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId, contractId },
        'Failed to delete contract owners',
      );
      throw error;
    }
  }

  // Owners ride the contract embed inside the org's cached contract set, so an
  // edit has to bust it (psk-1975 decision 9). The rows are committed by here,
  // so neither this nor the activity logging below may fail the save — and the
  // bust runs first so a logging outage cannot leave the cache stale.
  try {
    const cacheService = await getCacheService();
    await cacheService.invalidateContractSetForOrg({ organizationId });
  } catch (error) {
    logger.warn(
      { error: sanitizeForLogging(error), organizationId, contractId },
      'Failed to invalidate the contract cache after an owner change',
    );
  }

  const changedBy = actorName ?? actorUserId;
  try {
    const names = await loadNames(
      client,
      organizationId,
      [
        ...addedSponsors.flatMap((ref) =>
          ref.kind === 'user' ? [ref.id] : [],
        ),
        ...removedRows.flatMap((row) =>
          row.user_id !== null ? [row.user_id] : [],
        ),
      ],
      [
        ...addedSponsors.flatMap((ref) =>
          ref.kind === 'employee' ? [ref.id] : [],
        ),
        ...removedRows.flatMap((row) =>
          row.org_employee_id !== null ? [row.org_employee_id] : [],
        ),
      ],
      [
        ...addedUnitIds,
        ...removedRows.flatMap((row) =>
          row.org_unit_id !== null ? [row.org_unit_id] : [],
        ),
      ],
    );

    for (const ref of addedSponsors) {
      await logOwnerChanged({
        contractId,
        action: 'added',
        ownerName: sponsorDisplayName(ref, names),
        changedBy,
        userId: actorUserId,
      });
    }
    for (const unitId of addedUnitIds) {
      await logOwnerChanged({
        contractId,
        action: 'added',
        ownerGroup: names.units.get(unitId) ?? '',
        changedBy,
        userId: actorUserId,
      });
    }
    for (const row of removedRows) {
      if (row.org_unit_id !== null) {
        await logOwnerChanged({
          contractId,
          action: 'removed',
          ownerGroup: names.units.get(row.org_unit_id) ?? '',
          changedBy,
          userId: actorUserId,
        });
      } else {
        await logOwnerChanged({
          contractId,
          action: 'removed',
          ownerName: rowDisplayName(row, names),
          changedBy,
          userId: actorUserId,
        });
      }
    }
  } catch (error) {
    logger.warn(
      { error: sanitizeForLogging(error), organizationId, contractId },
      'Failed to record the activity for an owner change',
    );
  }

  return {
    added: addedSponsors.length + addedUnitIds.length,
    removed: removedRows.length,
  };
}

/**
 * The service client bypasses RLS, so the contract and every employee sponsor
 * are pinned to the caller's organization before anything is written.
 */
async function assertContractInOrg(
  client: ServiceClient,
  organizationId: string,
  contractId: number,
): Promise<void> {
  const { data, error } = await client
    .from('contracts')
    .select('id, organization_id')
    .eq('id', contractId);
  if (error) throw error;
  const contract = data?.[0];
  if (!contract) {
    throw new AuthorizationError('Contract not found');
  }
  if (contract.organization_id !== organizationId) {
    throw new AuthorizationError('Cross-organization contract access denied');
  }
}

async function assertEmployeesInOrg(
  client: ServiceClient,
  organizationId: string,
  employeeIds: readonly number[],
): Promise<void> {
  if (employeeIds.length === 0) return;
  const { data, error } = await client
    .from('org_employees')
    .select('id, organization_id')
    .in('id', employeeIds);
  if (error) throw error;
  const employees = data ?? [];
  if (employees.length !== employeeIds.length) {
    throw new AuthorizationError('Employee not found');
  }
  if (employees.some((row) => row.organization_id !== organizationId)) {
    throw new AuthorizationError('Cross-organization employee access denied');
  }
}

export async function readGroupUnitIds(
  client: ServiceClient,
  organizationId: string,
  contractId: number,
): Promise<number[]> {
  const { data, error } = await client
    .from('contract_owners')
    .select('org_unit_id')
    .eq('organization_id', organizationId)
    .eq('contract_id', contractId)
    .eq('role', 'group');
  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId, contractId },
      'Failed to read contract owner groups',
    );
    throw error;
  }
  return (data ?? []).flatMap((row) =>
    row.org_unit_id === null ? [] : [row.org_unit_id],
  );
}

/**
 * The Owner tab's save (psk-1975). Sponsors and groups become `contract_owners`
 * rows; `contracts.business_sponsor` is frozen at its pre-migration value and
 * has no writer left. `justification` and `order` are left untouched when
 * omitted, so a caller that edits owners only cannot blank them, and omitted
 * groups are read back and passed through so a caller without group rights
 * cannot clear them either.
 */
export async function saveContractOwners({
  organizationId,
  contractId,
  sponsors,
  groupUnitIds,
  justification,
  order,
  actorUserId,
  actorName,
}: SaveContractOwnersInput): Promise<void> {
  const client = createClient();
  await assertContractInOrg(client, organizationId, contractId);
  await assertEmployeesInOrg(client, organizationId, [
    ...new Set(
      sponsors.flatMap((sponsor) =>
        sponsor.kind === 'employee' ? [sponsor.id] : [],
      ),
    ),
  ]);

  if (justification !== undefined || order !== undefined) {
    const { error } = await client
      .from('contracts')
      .update({
        ...(justification !== undefined
          ? { business_justification: justification }
          : {}),
        ...(order !== undefined ? { business_order: order } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contractId)
      .eq('organization_id', organizationId);
    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId, contractId },
        'Failed to update contract owner',
      );
      throw error;
    }
  }

  const { added, removed } = await replaceContractOwners({
    organizationId,
    contractId,
    sponsors,
    groupUnitIds:
      groupUnitIds ??
      (await readGroupUnitIds(client, organizationId, contractId)),
    actorUserId,
    actorName,
  });

  // replaceContractOwners busts the org cache only when an owner row changed;
  // a save that edited just the columns still needs the cached rows refreshed.
  const columnsChanged = justification !== undefined || order !== undefined;
  if (columnsChanged && added === 0 && removed === 0) {
    try {
      const cacheService = await getCacheService();
      await cacheService.invalidateContractSetForOrg({ organizationId });
    } catch (error) {
      logger.warn(
        { error: sanitizeForLogging(error), organizationId, contractId },
        'Failed to invalidate the contract cache after an owner change',
      );
    }
  }
}
