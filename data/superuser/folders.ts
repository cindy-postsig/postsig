'use server';
import { createClient } from '@/utils/supabase/service_server';
import { unstable_noStore as noStore } from 'next/cache';
import logger from '@/utils/pino';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { getUserMetadata } from '@/data/users';
import type { UserMetadata } from '@/constants/types';
import { extendFolderQueryByUserRole } from '@/data/utils';
import {
  AppAbility,
  RoleId,
  assertPermission,
  defineAbilitiesFor,
} from '@postsig/toolkit';
import { ValidationError } from '@/lib/errors/types';
import {
  logContractFolderAssignment,
  logFolderRenamed,
} from '@/data/superuser/activities';
interface CreateFolderParams {
  name: string;
  parentId?: number | null;
}

async function getAbilities(): Promise<{
  ability: AppAbility;
  userMetadata: UserMetadata;
}> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    logger.error('User metadata not found during abilities fetch');
    throw new Error('Unauthorized: User not authenticated');
  }
  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole as RoleId,
    organizationId: userMetadata.organizationId,
  });
  return { ability, userMetadata };
}

/**
 * Validates that the current user has permission to manage folders
 * Only supervisors (role 12) can create/manage folders
 * Returns the validated user metadata to avoid duplicate calls
 */
async function validateFolderManagePermission(): Promise<UserMetadata> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    logger.error(
      'User metadata not found during folder management permission validation',
    );
    throw new Error('Unauthorized: User not authenticated');
  }

  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole as 11 | 12 | 14,
    organizationId: userMetadata.organizationId,
  });

  // Check if user has 'manage' permission for folders
  if (!ability.can('manage', 'Folder')) {
    logger.warn(
      {
        userId: userMetadata.userId,
        userRole: userMetadata.userRole,
      },
      'User lacks manage permission for folders',
    );
    throw new Error('Unauthorized: Only supervisors can manage folders');
  }

  return userMetadata;
}

/**
 * Validates that the current user has permission to share folders
 * Both managers (role 11) and supervisors (role 12) can share folders
 * Returns the validated user metadata to avoid duplicate calls
 */
async function validateFolderSharePermission(): Promise<UserMetadata> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    logger.error(
      'User metadata not found during folder share permission validation',
    );
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
      },
      'User lacks share permission for folders',
    );
    throw new Error('Unauthorized: User cannot share folders');
  }

  return userMetadata;
}

export async function createFolder({
  name,
  parentId = null,
}: CreateFolderParams) {
  const supabase = createClient();
  noStore();

  // Validate permission and get user metadata
  const userMetadata = await validateFolderManagePermission();

  try {
    const { data, error } = await supabase
      .from('folders')
      .insert({
        name,
        parent_id: parentId,
        organization_id: userMetadata.organizationId,
        user_id: userMetadata.userId,
      } as any)
      .select('id, name, path, public_uuid, user_id')
      .single();

    if (error) {
      logger.error(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          name,
        },
        'Error creating folder',
      );
      throw error;
    }

    // Grant creator admin access to the folder
    const folderId = (data as any).id;
    const { error: aclError } = await supabase.from('folder_acl_user').insert({
      folder_id: folderId,
      user_id: userMetadata.userId,
      organization_id: userMetadata.organizationId,
      perm: 'admin',
    });

    if (aclError) {
      logger.error(
        {
          error: aclError.message,
          folderId,
          userId: userMetadata.userId,
        },
        'Error granting creator access to folder',
      );
      // Don't throw - folder was created successfully
    }

    logger.info(
      { folderId, name, userId: userMetadata.userId },
      'Folder created successfully with admin access',
    );
    return data as {
      id: number;
      name: string;
      path: string;
      public_uuid: string;
    };
  } catch (error: any) {
    logger.error(
      {
        error: error?.message || String(error),
        stack: error?.stack,
      },
      'Failed to create folder',
    );
    throw error;
  }
}

export async function getAllFolders() {
  const supabase = createClient();
  noStore();

  try {
    // Get user metadata for permissions
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      throw new Error('User metadata not found');
    }

    // Build the query with ACL-based filtering
    let query = supabase
      .from('folders')
      .select('id, name, path, parent_id, created_at, public_uuid, user_id')
      .order('path', { ascending: true });

    // Apply role-based filtering (this returns the filtered query)
    query = await extendFolderQueryByUserRole(
      supabase,
      query,
      userMetadata.userId,
      userMetadata.userRole,
      userMetadata.organizationId,
    );

    const { data, error } = await query;

    if (error) {
      logger.error(
        { error, userId: userMetadata.userId, userRole: userMetadata.userRole },
        'Error fetching folders',
      );
      throw error;
    }

    logger.info(
      {
        userId: userMetadata.userId,
        userRole: userMetadata.userRole,
        folderCount: data?.length || 0,
      },
      'Fetched folders for user',
    );

    return (data || []) as Array<{
      id: number;
      name: string;
      path: string;
      parent_id: number | null;
      created_at: string;
      public_uuid: string;
      user_id?: string;
    }>;
  } catch (error) {
    logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to fetch folders',
    );
    throw error;
  }
}

// Helper to get folder by public_uuid (used in URLs)
export async function getFolderByPublicUuid(publicUuid: string) {
  const supabase = createClient();
  noStore();

  try {
    const { data, error } = await supabase
      .from('folders')
      .select('id, name, path, parent_id, created_at, public_uuid')
      .eq('public_uuid', publicUuid)
      .single();

    if (error) {
      logger.error(
        { error, publicUuid },
        'Error fetching folder by public_uuid',
      );
      throw error;
    }

    return data as {
      id: number;
      name: string;
      path: string;
      parent_id: number | null;
      created_at: string;
      public_uuid: string;
    };
  } catch (error) {
    logger.error({ error }, 'Failed to fetch folder by public_uuid');
    throw new Error('Failed to fetch folder by public_uuid');
  }
}

export async function deleteFolder(folderId: number) {
  const supabase = createClient();
  noStore();

  // Validate permission before proceeding
  await validateFolderManagePermission();

  try {
    const { error } = await supabase
      .from('folders')
      .delete()
      .eq('id', folderId);

    if (error) {
      logger.error({ error, folderId }, 'Error deleting folder');
      throw error;
    }

    logger.info({ folderId }, 'Folder deleted successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to delete folder');
    throw new Error('Failed to delete folder');
  }
}

// Wrapper action that can be called from client components
export async function deleteFolderAction(folderId: number) {
  await deleteFolder(folderId);
}

export async function addContractToFolder(
  contractId: number,
  folderId: number,
) {
  const supabase = createClient();
  noStore();

  // Validate permission and get user metadata
  const userMetadata = await validateFolderManagePermission();

  try {
    const { error } = await supabase.from('folder_contracts').insert({
      folder_id: folderId,
      contract_id: contractId,
      organization_id: userMetadata.organizationId,
    });

    if (error) {
      // Ignore duplicate errors (contract already in folder)
      if (error.code === '23505') {
        logger.info({ contractId, folderId }, 'Contract already in folder');
        return;
      }
      logger.error(
        {
          error,
          contractId,
          folderId,
        },
        'Error adding contract to folder',
      );
      throw error;
    }

    logger.info(
      {
        contractId,
        folderId,
      },
      'Contract added to folder successfully',
    );
  } catch (error) {
    logger.error({ error }, 'Failed to add contract to folder');
    throw new Error('Failed to add contract to folder');
  }
}

export async function removeContractFromFolder(
  contractId: number,
  folderId: number,
) {
  const supabase = createClient();
  noStore();

  // Validate permission before proceeding
  await validateFolderManagePermission();

  try {
    // Fetch folder name before removing
    const { data: folder } = await supabase
      .from('folders')
      .select('name')
      .eq('id', folderId)
      .single();

    const folderName = folder?.name || 'Unknown Folder';

    const { error } = await supabase
      .from('folder_contracts')
      .delete()
      .eq('folder_id', folderId)
      .eq('contract_id', contractId);

    if (error) {
      logger.error(
        {
          error,
          contractId,
          folderId,
        },
        'Error removing contract from folder',
      );
      throw error;
    }

    logger.info(
      {
        contractId,
        folderId,
      },
      'Contract removed from folder successfully',
    );

    // Log the folder assignment change
    const userMetadata = await getUserMetadata();
    const changedBy = userMetadata?.userProfile?.name || undefined;

    await logContractFolderAssignment({
      contractId,
      action: 'removed',
      folderId,
      folderName,
      changedBy,
      userId: userMetadata?.userId,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to remove contract from folder');
    throw new Error('Failed to remove contract from folder');
  }
}

// Assign contract(s) to folder - handles both single and bulk operations
export async function assignContractToFolder(
  contractIdOrIds: number | number[],
  folderId: number | null,
) {
  const supabase = createClient();
  noStore();

  // Normalize to array for consistent handling
  const contractIds = Array.isArray(contractIdOrIds)
    ? contractIdOrIds
    : [contractIdOrIds];

  try {
    const { ability, userMetadata } = await getAbilities();
    assertPermission(ability, 'update', 'Folder');

    // Fetch existing folder assignments before making changes
    const { data: existingAssignments } = await supabase
      .from('folder_contracts')
      .select('contract_id, folder_id, folders(id, name)')
      .in('contract_id', contractIds);

    // Fetch target folder name if folderId is provided
    let targetFolderName: string | undefined;
    if (folderId) {
      const { data: targetFolder } = await supabase
        .from('folders')
        .select('name')
        .eq('id', folderId)
        .single();
      targetFolderName = targetFolder?.name || 'Unknown Folder';
    }

    // Remove contracts from all folders first
    const { error: deleteError } = await supabase
      .from('folder_contracts')
      .delete()
      .in('contract_id', contractIds);

    if (deleteError) {
      logger.error(
        {
          error: deleteError,
          contractIds,
        },
        'Error removing contracts from folders',
      );
      throw deleteError;
    }

    // If folderId is provided, add contracts to the new folder
    if (folderId) {
      const inserts = contractIds.map((contractId) => ({
        folder_id: folderId,
        contract_id: contractId,
        organization_id: userMetadata.organizationId,
      }));

      const { error: insertError } = await supabase
        .from('folder_contracts')
        .insert(inserts as any);

      if (insertError) {
        logger.error(
          {
            error: insertError,
            contractIds,
            folderId,
          },
          'Error assigning contracts to folder',
        );
        throw insertError;
      }
    }

    logger.info(
      {
        contractIds,
        folderId,
        count: contractIds.length,
      },
      `${contractIds.length} contract(s) assigned to folder successfully`,
    );

    // Log folder assignment changes for each contract
    const changedBy = userMetadata?.userProfile?.name || undefined;

    for (const contractId of contractIds) {
      const existingAssignment = existingAssignments?.find(
        (a: any) => a.contract_id === contractId,
      );

      if (folderId) {
        if (existingAssignment) {
          // Contract was moved from one folder to another (reassigned)
          const oldFolderData = existingAssignment.folders as any;
          await logContractFolderAssignment({
            contractId,
            action: 'reassigned',
            oldFolderId: existingAssignment.folder_id,
            oldFolderName: oldFolderData?.name || 'Unknown Folder',
            newFolderId: folderId,
            newFolderName: targetFolderName,
            changedBy,
            userId: userMetadata.userId,
          });
        } else {
          // Contract was added to a folder for the first time
          await logContractFolderAssignment({
            contractId,
            action: 'added',
            folderId,
            folderName: targetFolderName,
            changedBy,
            userId: userMetadata.userId,
          });
        }
      } else if (existingAssignment) {
        // Contract was removed from folder (folderId is null)
        const oldFolderData = existingAssignment.folders as any;
        await logContractFolderAssignment({
          contractId,
          action: 'removed',
          folderId: existingAssignment.folder_id,
          folderName: oldFolderData?.name || 'Unknown Folder',
          changedBy,
          userId: userMetadata.userId,
        });
      }
    }

    // Invalidate the contract cache for the entire organization
    // This ensures all users (including those with shared folder access) see the changes
    try {
      const cacheService = await getCacheService();
      await cacheService.invalidateContractSetForOrg(userMetadata);
      logger.info(
        {
          organizationId: userMetadata.organizationId,
        },
        'Invalidated contract cache for organization after folder assignment',
      );
    } catch (cacheError) {
      // Don't fail the whole operation if cache invalidation fails
      logger.warn(
        {
          error: cacheError,
        },
        'Failed to invalidate cache after folder assignment',
      );
    }
  } catch (error: any) {
    logger.error(
      { error, contractIds },
      'Failed to assign contract(s) to folder',
    );
    throw new ValidationError(
      'Failed to assign contract(s) to folder: ' + error.message,
      'FAILED_TO_ASSIGN_CONTRACTS_TO_FOLDER',
    );
  }
}

export async function getContractFolders(contractId: number) {
  const supabase = createClient();
  noStore();

  try {
    const { data, error } = await supabase
      .from('folder_contracts')
      .select(
        `
        folder_id,
        folders (
          id,
          name,
          path
        )
      `,
      )
      .eq('contract_id', contractId);

    if (error) {
      logger.error({ error, contractId }, 'Error fetching contract folders');
      throw error;
    }

    return (data || []).map((item: any) => item.folders);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch contract folders');
    throw new Error('Failed to fetch contract folders');
  }
}

export async function updateFolderName(folderId: number, newName: string) {
  const supabase = createClient();
  noStore();

  // Validate permission before proceeding
  await validateFolderManagePermission();

  try {
    // Fetch old name before updating
    const { data: oldFolderData } = await supabase
      .from('folders')
      .select('name')
      .eq('id', folderId)
      .single();

    const oldName = oldFolderData?.name || 'Unknown Folder';

    const { error } = await supabase
      .from('folders')
      // @ts-ignore - Supabase type issue with update operation
      .update({
        name: newName,
      } as any)
      .eq('id', folderId);

    if (error) {
      logger.error({ error, folderId, newName }, 'Error updating folder name');
      throw error;
    }

    logger.info({ folderId, newName }, 'Folder name updated successfully');

    // Log folder rename event
    // Note: This logs to activities table without a specific contractId
    // Folder rename events may not appear in contract-specific audit logs
    const userMetadata = await getUserMetadata();
    const changedBy = userMetadata?.userProfile?.name || undefined;

    await logFolderRenamed({
      folderId,
      oldName,
      newName,
      changedBy,
      userId: userMetadata?.userId,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update folder name');
    throw new Error('Failed to update folder name');
  }
}

interface FetchContractIdsByFolderParams {
  folderId: string; // This is the public_uuid from the URL
  userMetadata: {
    organizationId: string;
    userId: string;
    userRole: number;
  };
}

export async function fetchContractIdsByFolderByUserRoles({
  folderId: folderPublicUuid,
  userMetadata,
}: FetchContractIdsByFolderParams): Promise<number[]> {
  const supabase = createClient();
  noStore();

  try {
    // Get folder by public_uuid to get the numeric ID
    const folder = await getFolderByPublicUuid(folderPublicUuid);

    // Check if user has access to this folder using ACL
    const folderAccessQuery = supabase
      .from('folders')
      .select('id')
      .eq('id', folder.id);

    const { data: folderAccessCheck } = await extendFolderQueryByUserRole(
      supabase,
      folderAccessQuery,
      userMetadata.userId,
      userMetadata.userRole,
      userMetadata.organizationId,
    );

    // If user doesn't have access to the folder, return empty array
    if (!folderAccessCheck || folderAccessCheck.length === 0) {
      logger.warn(
        {
          folderPublicUuid,
          folderId: folder.id,
          userId: userMetadata.userId,
          userRole: userMetadata.userRole,
        },
        'User attempted to access folder without permission',
      );
      return [];
    }

    // User has access, fetch contract IDs in this folder
    const { data, error } = await supabase
      .from('folder_contracts')
      .select('contract_id')
      .eq('folder_id', folder.id);

    if (error) {
      logger.error(
        {
          error,
          folderPublicUuid,
          folderId: folder.id,
        },
        'Error fetching contract IDs by folder',
      );
      throw error;
    }

    return (data || []).map((item: any) => item.contract_id);
  } catch (error) {
    logger.error(
      { error, folderPublicUuid },
      'Failed to fetch contract IDs by folder',
    );
    throw new Error('Failed to fetch contract IDs by folder');
  }
}

// ===== Folder ACL Functions =====

export async function getFolderACL(folderId: number) {
  const supabase = createClient();
  noStore();

  try {
    const usersResult = await supabase
      .from('folder_acl_user')
      .select(
        `
        user_id,
        perm,
        users (
          id,
          name,
          email,
          signed_up
        )
      `,
      )
      .eq('folder_id', folderId);

    const groupsResult = await supabase
      .from('folder_acl_group')
      .select(
        `
        group_id,
        perm,
        groups (
          id,
          name,
          public_uuid,
          group_members (
            user_id,
            users (
              id,
              name,
              email
            )
          )
        )
      `,
      )
      .eq('folder_id', folderId);

    if (usersResult.error) throw usersResult.error;
    if (groupsResult.error) throw groupsResult.error;

    const users = (usersResult.data || []).map((item: any) => ({
      id: item.user_id,
      name: item.users?.name || '',
      email: item.users?.email || '',
      perm: item.perm,
      signedUp: item.users?.signed_up,
    }));

    const groups = (groupsResult.data || []).map((item: any) => ({
      id: item.group_id,
      name: item.groups?.name || '',
      publicUuid: item.groups?.public_uuid || '',
      memberCount: item.groups?.group_members?.length || 0,
      perm: item.perm,
      members: (item.groups?.group_members || []).map((m: any) => ({
        id: m.users?.id || m.user_id,
        name: m.users?.name || '',
        email: m.users?.email || '',
      })),
    }));

    return {
      users,
      groups,
    };
  } catch (error) {
    logger.error({ error, folderId }, 'Failed to fetch folder ACL');
    throw error;
  }
}

export async function addUserToFolder(
  folderId: number,
  userId: string,
  perm: 'read' | 'write' | 'admin' = 'read',
  userRole?: number,
) {
  const supabase = createClient();
  noStore();

  // Validate permission and get user metadata
  const userMetadata = await validateFolderSharePermission();

  try {
    const { error } = await supabase.from('folder_acl_user').insert({
      folder_id: folderId,
      user_id: userId,
      organization_id: userMetadata.organizationId,
      perm,
    });

    if (error) {
      // Ignore duplicate errors
      if (error.code === '23505') {
        logger.info({ folderId, userId }, 'User already has folder access');
        return;
      }
      throw error;
    }

    logger.info({ folderId, userId, perm }, 'Added user to folder');
  } catch (error) {
    logger.error({ error, folderId, userId }, 'Failed to add user to folder');
    throw error;
  }
}

export async function removeUserFromFolder(
  folderId: number,
  userId: string,
  userRole?: number,
) {
  const supabase = createClient();
  noStore();

  await validateFolderSharePermission();

  try {
    const { error } = await supabase
      .from('folder_acl_user')
      .delete()
      .eq('folder_id', folderId)
      .eq('user_id', userId);

    if (error) throw error;

    logger.info({ folderId, userId }, 'Removed user from folder');
  } catch (error) {
    logger.error(
      { error, folderId, userId },
      'Failed to remove user from folder',
    );
    throw error;
  }
}

export async function addGroupToFolder(
  folderId: number,
  groupId: number,
  perm: 'read' | 'write' | 'admin' = 'read',
) {
  const supabase = createClient();
  noStore();

  // Validate permission and get user metadata
  const userMetadata = await validateFolderSharePermission();

  try {
    const { error } = await supabase.from('folder_acl_group').insert({
      folder_id: folderId,
      group_id: groupId,
      organization_id: userMetadata.organizationId,
      perm,
    });

    if (error) {
      // Ignore duplicate errors
      if (error.code === '23505') {
        logger.info({ folderId, groupId }, 'Group already has folder access');
        return;
      }
      throw error;
    }

    logger.info({ folderId, groupId, perm }, 'Added group to folder');

    // Invalidate contract cache for entire organization
    try {
      const cacheService = await getCacheService();
      await cacheService.invalidateContractSetForOrg(userMetadata);
      logger.info(
        { organizationId: userMetadata.organizationId },
        'Invalidated all contract caches for org after adding group to folder',
      );
    } catch (cacheError) {
      logger.warn(
        { error: cacheError },
        'Failed to invalidate cache after adding group to folder',
      );
    }
  } catch (error) {
    logger.error({ error, folderId, groupId }, 'Failed to add group to folder');
    throw error;
  }
}

export async function removeGroupFromFolder(folderId: number, groupId: number) {
  const supabase = createClient();
  noStore();

  // Validate permission and get user metadata
  const userMetadata = await validateFolderSharePermission();

  try {
    const { error } = await supabase
      .from('folder_acl_group')
      .delete()
      .eq('folder_id', folderId)
      .eq('group_id', groupId);

    if (error) throw error;

    logger.info({ folderId, groupId }, 'Removed group from folder');

    // Invalidate contract cache for entire organization
    try {
      const cacheService = await getCacheService();
      await cacheService.invalidateContractSetForOrg(userMetadata);
      logger.info(
        { organizationId: userMetadata.organizationId },
        'Invalidated all contract caches for org after removing group from folder',
      );
    } catch (cacheError) {
      logger.warn(
        { error: cacheError },
        'Failed to invalidate cache after removing group from folder',
      );
    }
  } catch (error) {
    logger.error(
      { error, folderId, groupId },
      'Failed to remove group from folder',
    );
    throw error;
  }
}
