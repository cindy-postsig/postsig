'use server';

import { createClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '@/data/users';
import {
  getFolderACL,
  addUserToFolder,
  removeUserFromFolder,
  addGroupToFolder,
  removeGroupFromFolder,
} from '@/data/superuser/folders';
import {
  getContractACL,
  addUserToContract,
  removeUserFromContract,
  addGroupToContract,
  removeGroupFromContract,
  getBulkContractACLs,
  bulkAddUserToContracts,
  bulkRemoveUserFromContracts,
  bulkAddGroupToContracts,
  bulkRemoveGroupFromContracts,
} from '@/data/superuser/contracts';
import {
  getOrgUsers,
  getOrgGroups,
  getGroupMembers,
} from '@/data/superuser/groups';
import {
  logContractShared,
  logContractUnshared,
  logFolderShared,
  logFolderUnshared,
} from '@/data/superuser/activities';
import { defineAbilitiesFor } from '@postsig/toolkit';
import logger from '@/utils/pino';
import { AUDIT_ACTIONS, auditLogger, getUserAuditContext } from '@/lib/audit';
import { clientAdminRoles } from '@/constants/data';
import { filterVisibleOrgUsers } from '@/lib/utils/users';
import { ValidationError } from '@/lib/errors/types';
import { AuthorizationError } from '@/lib/errors';

export type PermissionLevel = 'read' | 'write' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role?: number;
  perm?: PermissionLevel;
  signedUp?: boolean;
  permissionSources?: string[];
}

export interface Group {
  id: number;
  name: string;
  publicUuid?: string;
  memberCount?: number;
  perm?: PermissionLevel;
  members?: Array<{ id: string; name: string; email: string }>;
}

export interface ACL {
  users: User[];
  groups: Group[];
}

// ===== Permission Validation Helpers =====

async function validateFolderPermission(folderId: number): Promise<void> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    logger.error('User metadata not found during folder permission validation');
    throw new Error('Unauthorized: User not authenticated');
  }

  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole as 11 | 12 | 14,
    organizationId: userMetadata.organizationId,
  });

  // Check if user has 'share' permission for folders
  if (!ability.can('share', 'Folder')) {
    logger.warn(
      {
        userId: userMetadata.userId,
        userRole: userMetadata.userRole,
        folderId,
      },
      'User lacks share permission for folders',
    );
    throw new Error('Unauthorized: Cannot manage folder permissions');
  }

  // Verify user has admin access to this specific folder
  const supabase = createClient();
  const { data: folder, error: folderError } = await supabase
    .from('folders')
    .select('user_id')
    .eq('id', folderId)
    .single();

  if (folderError) {
    logger.error(
      { error: folderError, folderId },
      'Error fetching folder for permission check',
    );
    throw new Error('Error validating folder permissions');
  }

  const folderACL = await getFolderACL(folderId);
  const userAccess = folderACL.users.find((u) => u.id === userMetadata.userId);
  const isOwner = folder?.user_id === userMetadata.userId;
  const isAdmin = clientAdminRoles.includes(userMetadata.userRole);

  if (!isOwner && !isAdmin && userAccess?.perm !== 'admin') {
    logger.warn(
      {
        userId: userMetadata.userId,
        folderId,
        isOwner,
        isAdmin,
        userPerm: userAccess?.perm,
      },
      'User lacks admin access to folder',
    );
    throw new Error('Unauthorized: Must be folder owner or admin');
  }
}

async function validateContractPermission(contractId: number): Promise<void> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    logger.error(
      'User metadata not found during contract permission validation',
    );
    throw new Error('Unauthorized: User not authenticated');
  }

  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole as 11 | 12 | 14,
    organizationId: userMetadata.organizationId,
  });

  // Check if user has 'share' permission for contracts
  if (!ability.can('share', 'Contract')) {
    logger.warn(
      {
        userId: userMetadata.userId,
        userRole: userMetadata.userRole,
        contractId,
      },
      'User lacks share permission for contracts',
    );
    throw new Error('Unauthorized: Cannot manage contract permissions');
  }

  // Verify user has read access to this specific contract or owns it
  const supabase = createClient();
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('user_id')
    .eq('id', contractId)
    .single();

  if (contractError) {
    logger.error(
      { error: contractError, contractId },
      'Error fetching contract for permission check',
    );
    throw new Error('Error validating contract permissions');
  }

  const contractACL = await getContractACL(contractId);
  const userAccess = contractACL.users.find(
    (u) => u.id === userMetadata.userId,
  );
  const isOwner = contract?.user_id === userMetadata.userId;
  const isAdmin = clientAdminRoles.includes(userMetadata.userRole);
  const hasValidACLAccess =
    userAccess &&
    ['read', 'write', 'admin'].includes(userAccess.perm as PermissionLevel);

  if (!isOwner && !isAdmin && !hasValidACLAccess) {
    logger.warn(
      {
        userId: userMetadata.userId,
        contractId,
        isOwner,
        isAdmin,
        userPerm: userAccess?.perm,
      },
      'User lacks enough access to contract',
    );
    throw new ValidationError(
      'Must be contract owner or have read access',
      undefined,
      'VALIDATION_ERROR',
    );
  }
}

// ===== Fetch ACL =====

export async function fetchFolderACL(folderId: number): Promise<ACL> {
  return await getFolderACL(folderId);
}

/**
 * Fetch ACLs for one or more contracts in a single query
 * Handles both single and bulk cases efficiently
 * Returns: { [contractId]: { users: [], groups: [] } }
 */
export async function fetchBulkContractACLs(
  contractIds: number[],
): Promise<Record<number, ACL>> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    logger.error('User metadata not found during contract ACL fetch');
    throw new Error('Unauthorized: User not authenticated');
  }
  return getBulkContractACLs(contractIds, userMetadata.organizationId);
}

/**
 * Fetch ACL for a single contract
 * Uses the bulk endpoint under the hood for consistency
 */
export async function fetchContractACL(contractId: number): Promise<ACL> {
  const bulkResult = await fetchBulkContractACLs([contractId]);
  return bulkResult[contractId] || { users: [], groups: [] };
}

export async function fetchContractFolderACLs(contractIds: number[]): Promise<
  Array<{
    folderId: number;
    folderName: string;
    folderPath: string;
    acl: ACL;
  }>
> {
  if (contractIds.length === 0) {
    return [];
  }

  const supabase = createClient();

  try {
    // 1. Get contract-to-folder mappings from folder_contracts table
    const { data: mappings, error: mappingError } = await supabase
      .from('folder_contracts')
      .select('contract_id, folder_id')
      .in('contract_id', contractIds);

    if (mappingError) {
      logger.error(
        { error: mappingError, contractIds },
        'Error fetching contract-folder mappings',
      );
      return [];
    }

    if (!mappings || mappings.length === 0) {
      return [];
    }

    // 2. Get unique folder IDs
    let uniqueFolderIds = [...new Set(mappings.map((m) => m.folder_id))].filter(
      Boolean,
    ) as number[];

    if (uniqueFolderIds.length === 0) {
      return [];
    }

    // 3. Filter to only folders the user can see
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      logger.error('User metadata not found during contract folder ACL fetch');
      throw new Error('Unauthorized: User not authenticated');
    }

    const { data: visibleFolders } = await supabase.rpc('folders_visible_to', {
      p_organization_id: userMetadata.organizationId,
      p_user_id: userMetadata.userId,
    });

    if (visibleFolders) {
      const visibleFolderIds = new Set(
        visibleFolders.map((f: { id: number }) => f.id),
      );
      uniqueFolderIds = uniqueFolderIds.filter((id) =>
        visibleFolderIds.has(id),
      );
    }

    if (uniqueFolderIds.length === 0) {
      return [];
    }

    // 4. Fetch folder details
    const { data: folders, error: foldersError } = await supabase
      .from('folders')
      .select('id, name, path')
      .in('id', uniqueFolderIds);

    if (foldersError) {
      logger.error(
        { error: foldersError, uniqueFolderIds },
        'Error fetching folder details',
      );
      return [];
    }

    // 5. Fetch all folder ACLs in parallel
    const folderACLPromises = (folders || []).map(async (folder) => {
      try {
        const acl = await getFolderACL(folder.id);
        return {
          folderId: folder.id,
          folderName: folder.name,
          folderPath: folder.path,
          acl,
        };
      } catch (error) {
        logger.error(
          { error, folderId: folder.id },
          'Error fetching folder ACL in fetchContractFolderACLs',
        );
        return null;
      }
    });

    const folderACLs = (await Promise.all(folderACLPromises)).filter(
      Boolean,
    ) as Array<{
      folderId: number;
      folderName: string;
      folderPath: string;
      acl: ACL;
    }>;

    return folderACLs;
  } catch (error) {
    logger.error(
      { error, contractIds },
      'Failed to fetch contract folder ACLs',
    );
    return [];
  }
}

// ===== Combined Fetch for Single Contract (Performance Optimization) =====

export async function fetchCompleteContractSharing(contractId: number) {
  try {
    const [contractACL, folderACLs] = await Promise.all([
      fetchContractACL(contractId),
      fetchContractFolderACLs([contractId]),
    ]);

    return {
      contractACL,
      folderACLs,
    };
  } catch (error) {
    logger.error(
      { error, contractId },
      'Failed to fetch complete contract sharing data',
    );
    throw error;
  }
}

// ===== Update Folder ACL =====

export async function updateFolderACL(
  folderId: number,
  updates: {
    addUsers?: Array<{ userId: string; perm: PermissionLevel; role?: number }>;
    removeUsers?: Array<{ userId: string; role?: number }>;
    addGroups?: Array<{ groupId: number; perm: PermissionLevel }>;
    removeGroups?: number[];
  },
) {
  // Validate permission before proceeding
  await validateFolderPermission(folderId);

  const {
    addUsers = [],
    removeUsers = [],
    addGroups = [],
    removeGroups = [],
  } = updates;

  // Get current ACL state before changes
  const oldACL = await getFolderACL(folderId);

  // Fetch folder details for logging
  const supabase = createClient();
  const { data: folder } = await supabase
    .from('folders')
    .select('name')
    .eq('id', folderId)
    .single();

  const folderName = folder?.name || 'Unknown Folder';

  await Promise.all([
    ...addUsers.map(({ userId, perm, role }) =>
      addUserToFolder(folderId, userId, perm, role),
    ),
    ...removeUsers.map(({ userId, role }) =>
      removeUserFromFolder(folderId, userId, role),
    ),
    ...addGroups.map(({ groupId, perm }) =>
      addGroupToFolder(folderId, groupId, perm),
    ),
    ...removeGroups.map((groupId) => removeGroupFromFolder(folderId, groupId)),
  ]);

  // Get new ACL state
  const newACL = await getFolderACL(folderId);

  try {
    // Log folder sharing events in activities table
    const userMetadata = await getUserMetadata();
    const changedBy = userMetadata?.userProfile?.name || undefined;

    // Log shared users
    if (addUsers.length > 0) {
      const sharedWith = addUsers.map(({ userId, perm }) => {
        const user = newACL.users.find((u) => u.id === userId);
        return {
          type: 'user' as const,
          id: userId,
          name: user?.name || 'Unknown User',
          email: user?.email || undefined,
          permissionLevel: perm,
        };
      });

      await logFolderShared({
        folderId,
        folderName,
        sharedWith,
        changedBy,
        userId: userMetadata?.userId,
      });
    }

    // Log shared groups
    if (addGroups.length > 0) {
      const sharedWith = addGroups.map(({ groupId, perm }) => {
        const group = newACL.groups.find((g: Group) => g.id === groupId);
        return {
          type: 'group' as const,
          id: groupId,
          name: (group as Group | undefined)?.name || 'Unknown Group',
          permissionLevel: perm,
        };
      });

      await logFolderShared({
        folderId,
        folderName,
        sharedWith,
        changedBy,
        userId: userMetadata?.userId,
      });
    }

    // Log unshared users
    if (removeUsers.length > 0) {
      const unsharedFrom = removeUsers.map(({ userId }) => {
        const user = oldACL.users.find((u) => u.id === userId);
        return {
          type: 'user' as const,
          id: userId,
          name: user?.name || 'Unknown User',
          email: user?.email || undefined,
        };
      });

      await logFolderUnshared({
        folderId,
        folderName,
        unsharedFrom,
        changedBy,
        userId: userMetadata?.userId,
      });
    }

    // Log unshared groups
    if (removeGroups.length > 0) {
      const unsharedFrom = removeGroups.map((groupId) => {
        const group = oldACL.groups.find((g: Group) => g.id === groupId);
        return {
          type: 'group' as const,
          id: groupId,
          name: (group as Group | undefined)?.name || 'Unknown Group',
        };
      });

      await logFolderUnshared({
        folderId,
        folderName,
        unsharedFrom,
        changedBy,
        userId: userMetadata?.userId,
      });
    }
  } catch (error) {
    logger.error({ error, folderId }, 'Failed to log folder sharing events');
  }
}

// ===== Update Contract ACL =====

export async function updateContractACL(
  contractId: number,
  updates: {
    addUsers?: Array<{ userId: string; perm: PermissionLevel; role?: number }>;
    removeUsers?: Array<{ userId: string; role?: number }>;
    addGroups?: Array<{ groupId: number; perm: PermissionLevel }>;
    removeGroups?: number[];
  },
) {
  await validateContractPermission(contractId);

  const context = await getUserAuditContext();
  const {
    addUsers = [],
    removeUsers = [],
    addGroups = [],
    removeGroups = [],
  } = updates;

  // Get current ACL state before changes
  const oldACL = await getContractACL(contractId);

  // Perform updates
  await Promise.all([
    ...addUsers.map(({ userId, perm, role }) =>
      addUserToContract(contractId, userId, perm, role),
    ),
    ...removeUsers.map(({ userId, role }) =>
      removeUserFromContract(contractId, userId, role),
    ),
    ...addGroups.map(({ groupId, perm }) =>
      addGroupToContract(contractId, groupId, perm),
    ),
    ...removeGroups.map((groupId) =>
      removeGroupFromContract(contractId, groupId),
    ),
  ]);

  // Get new ACL state
  const newACL = await getContractACL(contractId);

  // Log the bulk update
  await auditLogger.logEvent({
    action: AUDIT_ACTIONS.CONTRACT_SHARED,
    resourceType: 'contract_acl',
    resourceId: contractId.toString(),
    oldData: {
      acl: oldACL,
      changeCount: {
        addUsers: addUsers.length,
        removeUsers: removeUsers.length,
        addGroups: addGroups.length,
        removeGroups: removeGroups.length,
      },
    },
    newData: { acl: newACL },
    context: {
      ...context,
      metadata: {
        contractId,
        changesApplied: updates,
        timestamp: new Date().toISOString(),
      },
    },
  });

  // Log individual grants/revokes for detailed tracking
  for (const { userId, perm } of addUsers) {
    await auditLogger.logContractAccessEvent(
      AUDIT_ACTIONS.CONTRACT_ACCESS_GRANTED,
      contractId.toString(),
      context,
      { userId, permission: perm, grantedAt: new Date().toISOString() },
    );
  }

  for (const { userId } of removeUsers) {
    await auditLogger.logContractAccessEvent(
      AUDIT_ACTIONS.CONTRACT_ACCESS_REVOKED,
      contractId.toString(),
      context,
      { userId },
    );
  }

  // Log contract sharing events in activities table
  try {
    const userMetadata = await getUserMetadata();
    const changedBy = userMetadata?.userProfile?.name || undefined;

    // Log shared users
    if (addUsers.length > 0) {
      const sharedWith = addUsers.map(({ userId, perm }) => {
        const user = newACL.users.find((u) => u.id === userId);
        return {
          type: 'user' as const,
          id: userId,
          name: user?.name || 'Unknown User',
          email: user?.email || undefined,
          permissionLevel: perm,
        };
      });

      await logContractShared({
        contractId,
        sharedWith,
        changedBy,
        userId: userMetadata?.userId,
      });
    }

    // Log shared groups
    if (addGroups.length > 0) {
      const sharedWith = addGroups.map(({ groupId, perm }) => {
        const group = newACL.groups.find((g: Group) => g.id === groupId);
        return {
          type: 'group' as const,
          id: groupId,
          name: (group as Group | undefined)?.name || 'Unknown Group',
          permissionLevel: perm,
        };
      });

      await logContractShared({
        contractId,
        sharedWith,
        changedBy,
        userId: userMetadata?.userId,
      });
    }

    // Log unshared users
    if (removeUsers.length > 0) {
      const unsharedFrom = removeUsers.map(({ userId }) => {
        const user = oldACL.users.find((u) => u.id === userId);
        return {
          type: 'user' as const,
          id: userId,
          name: user?.name || 'Unknown User',
          email: user?.email || undefined,
        };
      });

      await logContractUnshared({
        contractId,
        unsharedFrom,
        changedBy,
        userId: userMetadata?.userId,
      });
    }

    // Log unshared groups
    if (removeGroups.length > 0) {
      const unsharedFrom = removeGroups.map((groupId) => {
        const group = oldACL.groups.find((g: Group) => g.id === groupId);
        return {
          type: 'group' as const,
          id: groupId,
          name: (group as Group | undefined)?.name || 'Unknown Group',
        };
      });

      await logContractUnshared({
        contractId,
        unsharedFrom,
        changedBy,
        userId: userMetadata?.userId,
      });
    }
  } catch (error) {
    logger.error(
      { error, contractId },
      'Failed to log contract sharing events',
    );
  }
}

// ===== Fetch Users and Groups =====

/**
 * The org-wide roster and group list exist to populate the sharing, folder and
 * group dialogs. Gating them on the ability those dialogs need keeps the data
 * out of accounts that can only read, whichever entry point asks for it — the
 * page payload, the client fallback, or a direct server-action call.
 */
async function assertCanSeeOrgDirectory() {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new Error('Unauthorized: User not authenticated');
  }
  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole as 11 | 12 | 14,
    organizationId: userMetadata.organizationId,
  });
  if (!ability.can('share', 'Contract')) {
    throw new AuthorizationError(
      'Unauthorized: Cannot list organization users',
    );
  }
  return userMetadata;
}

export async function fetchOrgUsers(): Promise<User[]> {
  await assertCanSeeOrgDirectory();
  return await getOrgUsers();
}

export async function fetchOrgGroups(): Promise<Group[]> {
  await assertCanSeeOrgDirectory();
  return await getOrgGroups();
}

export async function fetchGroupMembers(groupId: number): Promise<User[]> {
  return await getGroupMembers(groupId);
}

// ===== Fetch All Org Users with Roles =====

export async function fetchAllOrgUsersWithRoles(
  organizationId?: string,
  organizationName?: string,
  options?: {
    includePostsigUsers?: boolean;
  },
): Promise<{
  allUsers: User[];
  adminsAndManagers: User[];
  organizationName: string;
  currentUser?: User;
}> {
  const caller = await assertCanSeeOrgDirectory();

  // The org id is a caller-supplied argument, so `share` in one organization
  // would otherwise buy the roster of any other.
  if (organizationId && organizationId !== caller.organizationId) {
    throw new AuthorizationError('Unauthorized: Invalid organization');
  }

  // If organizationId is provided, use it; otherwise fetch from metadata
  let orgId = organizationId;
  let orgName = organizationName || 'Organization';

  // Always fetch user metadata to get current user info
  const userMetadata = await getUserMetadata();
  const currentUser = userMetadata
    ? {
        id: userMetadata.userId,
        name: userMetadata.userProfile?.name || '',
        email: userMetadata.userProfile?.email || '',
        role: userMetadata.userRole,
      }
    : undefined;

  if (!orgId) {
    if (!userMetadata) {
      throw new Error('User metadata not found');
    }
    orgId = userMetadata.organizationId;
    orgName = userMetadata.organizationName || 'Organization';
  }

  const supabase = createClient();

  try {
    // Fetch organization domain
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('domain')
      .eq('id', orgId)
      .single();

    if (orgError) {
      logger.error(
        { error: orgError, organizationId: orgId },
        'Failed to fetch organization domain',
      );
    }

    const orgDomain = orgData?.domain;

    const { data, error } = await supabase
      .from('users')
      .select(
        `
        id,
        name,
        email,
        user_roles2!user_roles2_user_id_fkey(role_id)
      `,
      )
      .eq('organization_id', orgId)
      .order('name');

    if (error) throw error;

    let allUsers = (data || []).map((user: any) => ({
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      role: user.user_roles2?.[0]?.role_id,
    }));

    // Filter users by organization domain if domain is set
    if (orgDomain) {
      allUsers = allUsers.filter((user) => {
        const emailDomain = user.email?.split('@')[1];
        return emailDomain === orgDomain;
      });
    }

    allUsers = filterVisibleOrgUsers(allUsers, {
      currentUserEmail: currentUser?.email,
      includePostsigUsers: options?.includePostsigUsers,
    });

    const adminsAndManagers = allUsers.filter((user) => {
      return clientAdminRoles.includes(user.role);
    });

    if (currentUser) {
      allUsers = allUsers.filter((user) => user.id !== currentUser.id);
    }

    return {
      allUsers,
      adminsAndManagers,
      organizationName: orgName,
      currentUser,
    };
  } catch (error) {
    logger.error(
      {
        error,
        userId: (await getUserMetadata())?.userId,
        organizationId: (await getUserMetadata())?.organizationId,
      },
      'Failed to fetch org users with roles',
    );
    throw error;
  }
}

// ===== Bulk Contract ACL Updates =====

interface BulkContractACLUpdate {
  contractIds: number[];
  addUsers?: Array<{ userId: string; perm: PermissionLevel; role?: number }>;
  removeUsers?: Array<{ userId: string; role?: number }>;
  addGroups?: Array<{ groupId: number; perm: PermissionLevel }>;
  removeGroups?: number[];
}

interface BulkUpdateResult {
  success: boolean;
  contractsUpdated: number;
  errors?: string[];
}

/**
 * Validates that the user has permission to share all specified contracts
 * Returns the list of contract IDs the user can actually share
 */
async function validateBulkContractPermissions(
  contractIds: number[],
): Promise<{ validContractIds: number[]; skippedCount: number }> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new Error('Unauthorized: User not authenticated');
  }

  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole as 11 | 12 | 14,
    organizationId: userMetadata.organizationId,
  });

  // Check if user has general 'share' permission for contracts
  if (!ability.can('share', 'Contract')) {
    throw new Error('Unauthorized: Cannot manage contract permissions');
  }

  // For admins, allow all contracts
  const isAdmin = clientAdminRoles.includes(userMetadata.userRole);
  if (isAdmin) {
    return { validContractIds: contractIds, skippedCount: 0 };
  }

  // For non-admins, verify access to each contract
  // Fetch ownership and ACL info for all contracts in bulk
  const supabase = createClient();
  const { data: contracts, error: contractsError } = await supabase
    .from('contracts')
    .select('id, user_id')
    .in('id', contractIds);

  if (contractsError) {
    logger.error(
      { error: contractsError, contractIds },
      'Error fetching contracts for bulk permission check',
    );
    throw new Error('Error validating contract permissions');
  }

  // Get bulk ACLs
  const bulkACLs = await getBulkContractACLs(
    contractIds,
    userMetadata.organizationId,
  );

  const validContractIds: number[] = [];

  for (const contractId of contractIds) {
    const contract = contracts?.find((c) => c.id === contractId);
    const acl = bulkACLs[contractId];
    const userAccess = acl?.users?.find((u) => u.id === userMetadata.userId);
    const isOwner = contract?.user_id === userMetadata.userId;
    const hasValidACLAccess =
      userAccess &&
      ['read', 'write', 'admin'].includes(userAccess.perm as PermissionLevel);

    if (isOwner || hasValidACLAccess) {
      validContractIds.push(contractId);
    }
  }

  return {
    validContractIds,
    skippedCount: contractIds.length - validContractIds.length,
  };
}

/**
 * Bulk update ACLs for multiple contracts in a single operation
 * Much more efficient than calling updateContractACL for each contract
 */
export async function updateBulkContractACL(
  updates: BulkContractACLUpdate,
): Promise<BulkUpdateResult> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new Error('Unauthorized: User not authenticated');
  }

  const {
    contractIds,
    addUsers = [],
    removeUsers = [],
    addGroups = [],
    removeGroups = [],
  } = updates;

  if (contractIds.length === 0) {
    return { success: true, contractsUpdated: 0 };
  }

  // Validate permissions for all contracts
  const { validContractIds, skippedCount } =
    await validateBulkContractPermissions(contractIds);

  if (validContractIds.length === 0) {
    throw new Error('No contracts to update - permission denied for all');
  }

  const context = await getUserAuditContext();
  const errors: string[] = [];

  try {
    // Perform bulk operations
    const operations: Promise<any>[] = [];

    // Add users in bulk
    for (const { userId, perm, role } of addUsers) {
      operations.push(
        bulkAddUserToContracts(
          validContractIds,
          userId,
          userMetadata.organizationId,
          perm,
          role,
        ),
      );
    }

    // Remove users in bulk
    for (const { userId, role } of removeUsers) {
      operations.push(
        bulkRemoveUserFromContracts(
          validContractIds,
          userId,
          userMetadata.organizationId,
          role,
        ),
      );
    }

    // Add groups in bulk
    for (const { groupId, perm } of addGroups) {
      operations.push(
        bulkAddGroupToContracts(
          validContractIds,
          groupId,
          userMetadata.organizationId,
          perm,
        ),
      );
    }

    // Remove groups in bulk
    for (const groupId of removeGroups) {
      operations.push(
        bulkRemoveGroupFromContracts(
          validContractIds,
          groupId,
          userMetadata.organizationId,
        ),
      );
    }

    await Promise.all(operations);

    // Log bulk audit event
    await auditLogger.logEvent({
      action: AUDIT_ACTIONS.CONTRACT_SHARED,
      resourceType: 'contract_acl',
      resourceId: `bulk_${validContractIds.length}_contracts`,
      oldData: undefined,
      newData: {
        contractCount: validContractIds.length,
        contractIds: validContractIds,
        addUsers: addUsers.length,
        removeUsers: removeUsers.length,
        addGroups: addGroups.length,
        removeGroups: removeGroups.length,
        bulkOperation: true,
        skippedCount,
      },
      context,
    });

    // Log activity events for sharing
    const changedBy = userMetadata.userProfile?.name || undefined;

    if (addUsers.length > 0) {
      // Get user names for logging (we don't have them in the input)
      const sharedWith = addUsers.map(({ userId, perm }) => ({
        type: 'user' as const,
        id: userId,
        name: userId, // Will be resolved by activity display
        permissionLevel: perm,
      }));

      // Log one activity per contract would be too many, log a summary for first contract
      await logContractShared({
        contractId: validContractIds[0],
        sharedWith,
        changedBy,
        userId: userMetadata.userId,
        reason: `Bulk share to ${validContractIds.length} contracts`,
      });
    }

    if (addGroups.length > 0) {
      const sharedWith = addGroups.map(({ groupId, perm }) => ({
        type: 'group' as const,
        id: groupId,
        name: `Group ${groupId}`,
        permissionLevel: perm,
      }));

      await logContractShared({
        contractId: validContractIds[0],
        sharedWith,
        changedBy,
        userId: userMetadata.userId,
        reason: `Bulk share to ${validContractIds.length} contracts`,
      });
    }

    if (removeUsers.length > 0) {
      const unsharedFrom = removeUsers.map(({ userId }) => ({
        type: 'user' as const,
        id: userId,
        name: userId,
      }));

      await logContractUnshared({
        contractId: validContractIds[0],
        unsharedFrom,
        changedBy,
        userId: userMetadata.userId,
        reason: `Bulk unshare from ${validContractIds.length} contracts`,
      });
    }

    if (removeGroups.length > 0) {
      const unsharedFrom = removeGroups.map((groupId) => ({
        type: 'group' as const,
        id: groupId,
        name: `Group ${groupId}`,
      }));

      await logContractUnshared({
        contractId: validContractIds[0],
        unsharedFrom,
        changedBy,
        userId: userMetadata.userId,
        reason: `Bulk unshare from ${validContractIds.length} contracts`,
      });
    }

    if (skippedCount > 0) {
      errors.push(
        `Skipped ${skippedCount} contracts due to insufficient permissions`,
      );
    }

    logger.info(
      {
        contractCount: validContractIds.length,
        addUsers: addUsers.length,
        removeUsers: removeUsers.length,
        addGroups: addGroups.length,
        removeGroups: removeGroups.length,
        skippedCount,
      },
      'Bulk contract ACL update completed',
    );

    return {
      success: true,
      contractsUpdated: validContractIds.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    logger.error(
      { error, contractIds: validContractIds },
      'Failed to update bulk contract ACLs',
    );
    throw error;
  }
}
