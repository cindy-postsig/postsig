import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '@/data/users';
import logger from '@/utils/pino';
import {
  getGroupsWithContracts as getGroupsWithContractsData,
  getContractIdsForGroup as getContractIdsForGroupData,
} from '@/data/superuser/contracts';
import { resolveVisibleContractIds } from '@/data/utils';
import { isReadOnlyRole } from '@/lib/auth/roles';
import type { UserMetadata } from '@/constants/types';
import type { ContractGroup } from '@/app/api/v2/types/api';

export type { ContractGroup };

/**
 * The contract ids a read-only caller may see, or null when no narrowing
 * applies. Group membership is org-wide by construction, so an unnarrowed
 * contract list — or just its length — reports how much sits outside the
 * caller's own contracts.
 */
async function visibleContractIds(
  userMetadata: UserMetadata,
): Promise<Set<number> | null> {
  if (!isReadOnlyRole(userMetadata.userRole)) return null;

  const visible = await resolveVisibleContractIds(createServiceClient(), {
    organizationId: userMetadata.organizationId,
    userId: userMetadata.userId,
    userRole: userMetadata.userRole,
  });
  return visible === 'all' ? null : visible;
}

/**
 * Get business groups for a specific contract (from contract_acl_group)
 */
export async function getContractBusinessGroups(
  contractId: number,
): Promise<ContractGroup[]> {
  const supabase = await createClient();
  const userMetadata = await getUserMetadata();

  if (!userMetadata) {
    return [];
  }

  const { data, error } = await supabase
    .from('contract_acl_group')
    .select(
      `
      group_id,
      groups (
        id,
        name,
        public_uuid
      )
    `,
    )
    .eq('contract_id', contractId)
    .eq('organization_id', userMetadata.organizationId);

  if (error) {
    logger.error(
      { error, contractId },
      'Failed to fetch contract business groups',
    );
    throw error;
  }

  return (data || []).map((item: any) => ({
    id: item.groups?.id || item.group_id,
    name: item.groups?.name || '',
    publicUuid: item.groups?.public_uuid || '',
  }));
}

/**
 * Get all groups that have contracts shared with them (for filter dropdowns)
 * Returns groups from both contract_acl_group and folder_acl_group
 */
export async function getGroupsWithContracts(): Promise<ContractGroup[]> {
  const userMetadata = await getUserMetadata();

  if (!userMetadata) {
    return [];
  }

  return scopeGroupsToCaller(
    await getGroupsWithContractsData(userMetadata.organizationId),
  );
}

/**
 * Get all contract IDs that belong to a specific group
 * Includes both direct and folder-inherited assignments
 */
export async function getContractIdsForGroup(
  groupId: number,
): Promise<number[]> {
  const userMetadata = await getUserMetadata();

  if (!userMetadata) {
    return [];
  }

  const [contractIds, visible] = await Promise.all([
    getContractIdsForGroupData(groupId, userMetadata.organizationId),
    visibleContractIds(userMetadata),
  ]);

  return visible === null
    ? contractIds
    : contractIds.filter((id) => visible.has(id));
}

/** Keeps `.in(...)` filters inside PostgREST's URL length limit. */
const ID_FILTER_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * Group ids reachable from the caller's own contracts and folders. A read-only
 * account is scoped to these, so group names elsewhere in the organization stay
 * out of every surface that lists groups.
 */
async function reachableGroupIds(
  userMetadata: UserMetadata,
  visible: Set<number>,
): Promise<Set<number>> {
  const supabase = createServiceClient();
  const { organizationId, userId, userRole } = userMetadata;
  const groupIds = new Set<number>();

  for (const ids of chunk([...visible], ID_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('contract_acl_group')
      .select('group_id')
      .eq('organization_id', organizationId)
      .in('contract_id', ids);
    if (error) throw error;
    for (const row of data ?? []) groupIds.add(row.group_id);
  }

  const { data: folders, error: foldersError } = await supabase.rpc(
    'folders_visible_to',
    { p_organization_id: organizationId, p_user_id: userId },
  );
  if (foldersError) {
    logger.error(
      { error: foldersError, organizationId, userId, userRole },
      'Failed to resolve visible folders for group scoping',
    );
    throw foldersError;
  }

  const folderIds = (folders ?? []).map((row: { id: number }) => row.id);
  for (const ids of chunk(folderIds, ID_FILTER_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('folder_acl_group')
      .select('group_id')
      .eq('organization_id', organizationId)
      .in('folder_id', ids);
    if (error) throw error;
    for (const row of data ?? []) groupIds.add(row.group_id);
  }

  return groupIds;
}

async function scopeGroupsToCaller(
  groups: ContractGroup[],
): Promise<ContractGroup[]> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) return [];

  const visible = await visibleContractIds(userMetadata);
  if (visible === null) return groups;

  const reachable = await reachableGroupIds(userMetadata, visible);
  return groups.filter((group) => reachable.has(group.id));
}

export async function getOrgBusinessGroups(
  organizationId: string,
): Promise<ContractGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('groups')
    .select(`id, name, public_uuid`)
    .eq('organization_id', organizationId);

  if (error) {
    logger.error(
      { error, organizationId },
      'Failed to fetch org business groups',
    );
    throw error;
  }

  return scopeGroupsToCaller(
    (data || []).map((item: any) => ({
      id: item.id,
      name: item.name || '',
      publicUuid: item.public_uuid || '',
    })),
  );
}
