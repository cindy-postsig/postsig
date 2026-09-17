'use server';

import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { verifyAbility } from '@/data/user-permissions';
import {
  AuthorizationError,
  DatabaseError,
  ValidationError,
} from '@/lib/errors';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import {
  auditLogger,
  getUserAuditContext,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '@/lib/audit';
import { updateFolderACL } from '@/app/lib/sharing/actions';
import {
  userRoles,
  ADMIN,
  MANAGER,
  VIEWER,
  POSTSIG_ADMIN,
  POSTSIG_REVIEWER,
  POSTSIG_EXTRACTOR,
} from '@/constants/data';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { getUserMetadata } from '@/data/users';
import { revalidatePath } from 'next/cache';

interface CreateGroupInput {
  name: string;
  userIds?: string[];
}

interface CreateGroupResult {
  success: boolean;
  groupId?: number;
  group?: {
    id: number;
    name: string;
    publicUuid: string;
  };
  message?: string;
  error?: string;
}

export async function createGroup(
  input: CreateGroupInput,
): Promise<CreateGroupResult> {
  try {
    // Verify user has permission to manage organization
    const { userId: actorId, organizationId } = await verifyAbility(
      'manage',
      'Organization',
    );

    // Validate input
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('Group name is required');
    }

    const supabase = createServiceClient();
    const userIds = input.userIds || [];

    // Verify all users belong to this organization (prevent cross-tenant attacks)
    if (userIds.length > 0) {
      const { data: validUsers, error: userCheckError } = await supabase
        .from('users')
        .select('id')
        .in('id', userIds)
        .eq('organization_id', organizationId);

      if (userCheckError) {
        logger.error(
          { error: sanitizeForLogging(userCheckError), organizationId },
          'Error validating user membership',
        );
        throw new DatabaseError(
          'Failed to validate user membership',
          userCheckError,
        );
      }

      if (!validUsers || validUsers.length !== userIds.length) {
        throw new ValidationError(
          'One or more users do not belong to this organization',
        );
      }
    }

    // Check if group name already exists in organization (case-insensitive)
    const { data: existingGroup, error: checkError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('organization_id', organizationId)
      .ilike('name', input.name.trim())
      .maybeSingle();

    if (checkError) {
      logger.error(
        { error: sanitizeForLogging(checkError), organizationId },
        'Error checking for existing group',
      );
      throw new DatabaseError('Failed to check for existing group', checkError);
    }

    if (existingGroup) {
      throw new ValidationError(
        `A group with this name already exists: "${existingGroup.name}"`,
      );
    }

    // Create the group
    const { data: newGroup, error: createError } = await supabase
      .from('groups')
      .insert({
        name: input.name.trim(),
        organization_id: organizationId,
      })
      .select('id, name, public_uuid')
      .single();

    if (createError || !newGroup) {
      // Handle unique constraint violation (in case of race condition)
      if (createError?.code === '23505') {
        throw new ValidationError('A group with this name already exists');
      }
      logger.error(
        { error: sanitizeForLogging(createError), organizationId },
        'Error creating group',
      );
      throw new DatabaseError('Failed to create group', createError);
    }

    // Add members to the group (if any)
    if (userIds.length > 0) {
      const groupMembers = userIds.map((userId) => ({
        group_id: newGroup.id,
        organization_id: organizationId,
        user_id: userId,
      }));

      const { error: membersError } = await supabase
        .from('group_members')
        .insert(groupMembers);

      if (membersError) {
        // Rollback: delete the group if adding members failed
        await supabase.from('groups').delete().eq('id', newGroup.id);

        logger.error(
          {
            error: sanitizeForLogging(membersError),
            groupId: newGroup.id,
            organizationId,
          },
          'Error adding members to group',
        );
        throw new DatabaseError('Failed to add members to group', membersError);
      }
    }

    // Audit log (don't fail the operation if audit logging fails)
    try {
      const auditContext = await getUserAuditContext();
      await auditLogger.logEvent({
        action: AUDIT_ACTIONS.GROUP_CREATED,
        resourceType: AUDIT_RESOURCE_TYPES.GROUPS,
        resourceId: newGroup.public_uuid,
        newData: {
          name: newGroup.name,
          memberCount: userIds.length,
        },
        context: auditContext,
      });
    } catch (auditError) {
      // Log audit error but don't fail the operation
      logger.warn(
        {
          error: sanitizeForLogging(auditError),
          groupId: newGroup.id,
        },
        'Failed to create audit log entry for group creation',
      );
    }

    logger.info(
      {
        groupId: newGroup.id,
        groupName: newGroup.name,
        memberCount: userIds.length,
        organizationId,
        actorId,
      },
      'Group created successfully',
    );

    // Revalidate all routes to refresh groups data
    revalidatePath('/', 'layout');

    return {
      success: true,
      groupId: newGroup.id,
      group: {
        id: newGroup.id,
        name: newGroup.name,
        publicUuid: newGroup.public_uuid,
      },
      message: 'Group created successfully',
    };
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof AuthorizationError
    ) {
      return {
        success: false,
        error: error.message,
      };
    }

    logger.error(
      { error: sanitizeForLogging(error), input },
      'Unexpected error creating group',
    );

    return {
      success: false,
      error: 'An unexpected error occurred while creating the group',
    };
  }
}

export async function deleteGroup(groupId: number): Promise<CreateGroupResult> {
  try {
    // Verify user has permission to manage groups
    const { organizationId } = await verifyAbility('manage', 'Group');

    const supabase = createServiceClient();

    // Verify the group belongs to the organization
    const { data: group, error: fetchError } = await supabase
      .from('groups')
      .select('id, name, public_uuid')
      .eq('id', groupId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (fetchError) {
      logger.error(
        { error: sanitizeForLogging(fetchError), groupId, organizationId },
        'Error fetching group',
      );
      throw new DatabaseError('Failed to fetch group', fetchError);
    }

    if (!group) {
      throw new ValidationError('Group not found');
    }

    // Delete the group (group_members will be deleted via cascade)
    const { error: deleteError } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId)
      .eq('organization_id', organizationId);

    if (deleteError) {
      logger.error(
        { error: sanitizeForLogging(deleteError), groupId, organizationId },
        'Error deleting group',
      );
      throw new DatabaseError('Failed to delete group', deleteError);
    }

    // Invalidate contract cache for entire organization
    // Group members may have lost access to contracts/folders that were shared with the group
    try {
      const userMetadata = await getUserMetadata();
      if (userMetadata) {
        const cacheService = await getCacheService();
        await cacheService.invalidateContractSetForOrg(userMetadata);
        logger.info(
          { organizationId: userMetadata.organizationId },
          'Invalidated all contract caches for org after deleting group',
        );
      }
    } catch (cacheError) {
      logger.warn(
        { error: sanitizeForLogging(cacheError) },
        'Failed to invalidate cache after deleting group',
      );
    }

    // Audit log (don't fail the operation if audit logging fails)
    try {
      const auditContext = await getUserAuditContext();
      await auditLogger.logEvent({
        action: AUDIT_ACTIONS.GROUP_DELETED,
        resourceType: AUDIT_RESOURCE_TYPES.GROUPS,
        resourceId: group.public_uuid,
        oldData: {
          name: group.name,
        },
        context: auditContext,
      });
    } catch (auditError) {
      // Log audit error but don't fail the operation
      logger.warn(
        {
          error: sanitizeForLogging(auditError),
          groupId,
        },
        'Failed to create audit log entry for group deletion',
      );
    }

    logger.info(
      {
        groupId,
        groupName: group.name,
        organizationId,
      },
      'Group deleted successfully',
    );

    return {
      success: true,
      message: 'Group deleted successfully',
    };
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof AuthorizationError
    ) {
      return {
        success: false,
        error: error.message,
      };
    }

    logger.error(
      { error: sanitizeForLogging(error), groupId },
      'Unexpected error deleting group',
    );

    return {
      success: false,
      error: 'An unexpected error occurred while deleting the group',
    };
  }
}

export async function removeUserFromGroup(
  groupPublicUuid: string,
  userId: string,
): Promise<CreateGroupResult> {
  try {
    const { organizationId } = await verifyAbility('manage', 'Group');

    const supabase = createServiceClient();

    // Get the group by public_uuid
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('public_uuid', groupPublicUuid)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (groupError) {
      logger.error(
        { error: sanitizeForLogging(groupError), groupPublicUuid },
        'Error fetching group',
      );
      throw new DatabaseError('Failed to fetch group', groupError);
    }

    if (!group) {
      throw new ValidationError('Group not found');
    }

    // Delete the group member
    const { error: deleteError } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', userId)
      .eq('organization_id', organizationId);

    if (deleteError) {
      logger.error(
        { error: sanitizeForLogging(deleteError), groupPublicUuid, userId },
        'Error removing user from group',
      );
      throw new DatabaseError('Failed to remove user from group', deleteError);
    }

    logger.info({ groupId: group.id, userId }, 'Removed user from group');

    // Audit log (don't fail the operation if audit logging fails)
    try {
      const auditContext = await getUserAuditContext();
      await auditLogger.logEvent({
        action: AUDIT_ACTIONS.GROUP_MEMBER_REMOVED,
        resourceType: AUDIT_RESOURCE_TYPES.GROUP_MEMBERS,
        resourceId: groupPublicUuid,
        newData: {
          groupId: group.id,
          groupName: group.name,
          removedUserId: userId,
          organizationId,
        },
        context: auditContext,
      });
    } catch (auditError) {
      // Log audit error but don't fail the operation
      logger.warn(
        {
          error: sanitizeForLogging(auditError),
          groupId: group.id,
          userId,
        },
        'Failed to create audit log entry for group member removal',
      );
    }

    return {
      success: true,
      groupId: group.id,
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DatabaseError) {
      return {
        success: false,
        error: error.message,
      };
    }

    logger.error(
      { error: sanitizeForLogging(error) },
      'Unexpected error removing user from group',
    );

    return {
      success: false,
      error:
        'An unexpected error occurred while removing the user from the group',
    };
  }
}

export async function revokeGroupAccessFromFolder(
  groupPublicUuid: string,
  folderPublicUuid: string,
): Promise<CreateGroupResult> {
  try {
    const { organizationId } = await verifyAbility('manage', 'Group');

    const supabase = createServiceClient();

    // Get the group by public_uuid
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('public_uuid', groupPublicUuid)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (groupError) {
      logger.error(
        { error: sanitizeForLogging(groupError), groupPublicUuid },
        'Error fetching group',
      );
      throw new DatabaseError('Failed to fetch group', groupError);
    }

    if (!group) {
      throw new ValidationError('Group not found');
    }

    // Get the folder by public_uuid to get numeric id
    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .select('id, name')
      .eq('public_uuid', folderPublicUuid)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (folderError) {
      logger.error(
        { error: sanitizeForLogging(folderError), folderPublicUuid },
        'Error fetching folder',
      );
      throw new DatabaseError('Failed to fetch folder', folderError);
    }

    if (!folder) {
      throw new ValidationError('Folder not found');
    }

    // Use the shared updateFolderACL action to remove the group
    await updateFolderACL(folder.id, {
      removeGroups: [group.id],
    });

    logger.info(
      { groupId: group.id, folderId: folder.id },
      'Revoked group access from folder',
    );

    return {
      success: true,
      groupId: group.id,
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DatabaseError) {
      return {
        success: false,
        error: error.message,
      };
    }

    logger.error(
      { error: sanitizeForLogging(error) },
      'Unexpected error revoking group access from folder',
    );

    return {
      success: false,
      error: 'An unexpected error occurred while revoking access',
    };
  }
}

export async function addUsersToGroup(
  groupPublicUuid: string,
  userIds: string[],
): Promise<CreateGroupResult> {
  try {
    const { organizationId } = await verifyAbility('manage', 'Group');

    if (!userIds || userIds.length === 0) {
      throw new ValidationError('At least one user must be selected');
    }

    const supabase = createServiceClient();

    // Verify all users belong to this organization (prevent cross-tenant attacks)
    const { data: validUsers, error: userCheckError } = await supabase
      .from('users')
      .select('id')
      .in('id', userIds)
      .eq('organization_id', organizationId);

    if (userCheckError) {
      logger.error(
        { error: sanitizeForLogging(userCheckError), organizationId },
        'Error validating user membership',
      );
      throw new DatabaseError(
        'Failed to validate user membership',
        userCheckError,
      );
    }

    if (!validUsers || validUsers.length !== userIds.length) {
      throw new ValidationError(
        'One or more users do not belong to this organization',
      );
    }

    // Get the group by public_uuid
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('public_uuid', groupPublicUuid)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (groupError) {
      logger.error(
        { error: sanitizeForLogging(groupError), groupPublicUuid },
        'Error fetching group',
      );
      throw new DatabaseError('Failed to fetch group', groupError);
    }

    if (!group) {
      throw new ValidationError('Group not found');
    }

    // Insert group members using upsert to handle duplicates
    // This ensures new members are added while existing ones are skipped
    const memberInserts = userIds.map((userId) => ({
      organization_id: organizationId,
      group_id: group.id,
      user_id: userId,
    }));

    const { error: insertError } = await supabase
      .from('group_members')
      .upsert(memberInserts, {
        onConflict: 'organization_id,group_id,user_id',
        ignoreDuplicates: true,
      });

    if (insertError) {
      logger.error(
        { error: sanitizeForLogging(insertError), groupPublicUuid, userIds },
        'Error adding users to group',
      );
      throw new DatabaseError('Failed to add users to group', insertError);
    }

    logger.info(
      { groupId: group.id, userCount: userIds.length },
      'Added users to group',
    );

    // Audit log (don't fail the operation if audit logging fails)
    try {
      const auditContext = await getUserAuditContext();
      await auditLogger.logEvent({
        action: AUDIT_ACTIONS.GROUP_MEMBER_ADDED,
        resourceType: AUDIT_RESOURCE_TYPES.GROUP_MEMBERS,
        resourceId: groupPublicUuid,
        newData: {
          groupId: group.id,
          groupName: group.name,
          addedUserIds: userIds,
          userCount: userIds.length,
          organizationId,
        },
        context: auditContext,
      });
    } catch (auditError) {
      // Log audit error but don't fail the operation
      logger.warn(
        {
          error: sanitizeForLogging(auditError),
          groupId: group.id,
          userIds,
        },
        'Failed to create audit log entry for group member addition',
      );
    }

    return {
      success: true,
      groupId: group.id,
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DatabaseError) {
      return {
        success: false,
        error: error.message,
      };
    }

    logger.error(
      { error: sanitizeForLogging(error) },
      'Unexpected error adding users to group',
    );

    return {
      success: false,
      error: 'An unexpected error occurred while adding users to the group',
    };
  }
}

export async function updateGroupName(
  groupId: number,
  newName: string,
): Promise<CreateGroupResult> {
  try {
    const { organizationId } = await verifyAbility('manage', 'Group');

    if (!newName || newName.trim().length === 0) {
      throw new ValidationError('Group name is required');
    }

    const supabase = createServiceClient();

    // Verify the group belongs to the organization
    const { data: group, error: fetchError } = await supabase
      .from('groups')
      .select('id, name, public_uuid')
      .eq('id', groupId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (fetchError) {
      logger.error(
        { error: sanitizeForLogging(fetchError), groupId, organizationId },
        'Error fetching group',
      );
      throw new DatabaseError('Failed to fetch group', fetchError);
    }

    if (!group) {
      throw new ValidationError('Group not found');
    }

    // Check if new name already exists in organization (case-insensitive)
    const { data: existingGroup, error: checkError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('organization_id', organizationId)
      .ilike('name', newName.trim())
      .neq('id', groupId)
      .maybeSingle();

    if (checkError) {
      logger.error(
        { error: sanitizeForLogging(checkError), organizationId },
        'Error checking for existing group name',
      );
      throw new DatabaseError('Failed to check for existing group', checkError);
    }

    if (existingGroup) {
      throw new ValidationError(
        `A group with this name already exists: "${existingGroup.name}"`,
      );
    }

    // Update the group name
    const { error: updateError } = await supabase
      .from('groups')
      .update({ name: newName.trim() })
      .eq('id', groupId)
      .eq('organization_id', organizationId);

    if (updateError) {
      // Handle unique constraint violation (in case of race condition)
      if (updateError.code === '23505') {
        throw new ValidationError('A group with this name already exists');
      }
      logger.error(
        { error: sanitizeForLogging(updateError), groupId, organizationId },
        'Error updating group name',
      );
      throw new DatabaseError('Failed to update group name', updateError);
    }

    // Audit log
    try {
      const auditContext = await getUserAuditContext();
      await auditLogger.logEvent({
        action: AUDIT_ACTIONS.GROUP_UPDATED,
        resourceType: AUDIT_RESOURCE_TYPES.GROUPS,
        resourceId: group.public_uuid,
        oldData: { name: group.name },
        newData: { name: newName.trim() },
        context: auditContext,
      });
    } catch (auditError) {
      logger.warn(
        { error: sanitizeForLogging(auditError), groupId },
        'Failed to create audit log entry for group name update',
      );
    }

    logger.info(
      { groupId, oldName: group.name, newName: newName.trim(), organizationId },
      'Group name updated successfully',
    );

    return {
      success: true,
      groupId,
      message: 'Group name updated successfully',
    };
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof AuthorizationError
    ) {
      return {
        success: false,
        error: error.message,
      };
    }

    logger.error(
      { error: sanitizeForLogging(error), groupId, newName },
      'Unexpected error updating group name',
    );

    return {
      success: false,
      error: 'An unexpected error occurred while updating the group name',
    };
  }
}

export async function getOrganizationGroups() {
  try {
    const { organizationId } = await verifyAbility('manage', 'Organization');

    const supabase = createServiceClient();

    // Fetch groups with member counts
    const { data: groups, error } = await supabase
      .from('groups')
      .select(
        `
        id,
        name,
        created_at,
        public_uuid,
        group_members(count)
      `,
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId },
        'Error fetching organization groups',
      );
      throw new DatabaseError('Failed to fetch groups', error);
    }

    // Transform the data to include member count
    return (
      groups?.map((group) => ({
        id: group.id,
        publicUuid: group.public_uuid,
        name: group.name,
        createdAt: group.created_at || new Date().toISOString(),
        memberCount: group.group_members?.[0]?.count ?? 0,
        description: '', // Can be added to the database schema later
        folders: [],
        contracts: [],
        users: [],
      })) || []
    );
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error) },
      'Error in getOrganizationGroups',
    );
    throw error;
  }
}

export async function getGroupById(groupId: string) {
  try {
    // Verify user has permission to view groups
    const { organizationId } = await verifyAbility('manage', 'Group');

    const supabase = createServiceClient();

    // Fetch group with members
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select(
        `
        id,
        name,
        created_at,
        public_uuid,
        group_members(
          user_id,
          users(
            id,
            name,
            email,
            user_roles2!user_roles2_user_id_fkey(
              role_id
            )
          )
        )
      `,
      )
      .eq('public_uuid', groupId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (groupError) {
      logger.error(
        { error: sanitizeForLogging(groupError), groupId, organizationId },
        'Error fetching group by ID',
      );
      throw new DatabaseError('Failed to fetch group', groupError);
    }

    if (!group) {
      return null;
    }

    // Transform group members data
    const users =
      group.group_members?.map((member: any) => {
        const roleId = member.users.user_roles2?.[0]?.role_id;
        let appRole: string;

        if (roleId === userRoles.clientSupervisor) {
          appRole = ADMIN;
        } else if (roleId === userRoles.clientAdmin) {
          appRole = MANAGER;
        } else if (roleId === userRoles.postsigAdmin) {
          appRole = POSTSIG_ADMIN;
        } else if (roleId === userRoles.postsigReviewer) {
          appRole = POSTSIG_REVIEWER;
        } else if (roleId === userRoles.postsigExtractor) {
          appRole = POSTSIG_EXTRACTOR;
        } else {
          appRole = VIEWER;
        }

        return {
          id: member.users.id,
          name: member.users.name,
          email: member.users.email,
          role: appRole,
        };
      }) || [];

    // Fetch folders shared with the group
    const { data: folderAclData, error: folderError } = await supabase
      .from('folder_acl_group')
      .select(
        `
        folder_id,
        perm,
        folders (
          id,
          name,
          public_uuid
        )
      `,
      )
      .eq('group_id', group.id)
      .eq('organization_id', organizationId);

    if (folderError) {
      logger.error(
        { error: sanitizeForLogging(folderError), groupId },
        'Error fetching folders for group',
      );
    }

    // Get contract counts for each folder
    const folderIds = (folderAclData || []).map((f: any) => f.folder_id);
    let folderContractCounts: Record<number, number> = {};

    if (folderIds.length > 0) {
      const { data: folderContractsData, error: fcError } = await supabase
        .from('folder_contracts')
        .select('folder_id')
        .in('folder_id', folderIds)
        .eq('organization_id', organizationId);

      if (fcError) {
        logger.error(
          { error: sanitizeForLogging(fcError), organizationId, folderIds },
          'Error fetching folder contract counts for group',
        );
      } else if (folderContractsData) {
        folderContractCounts = folderContractsData.reduce(
          (acc: Record<number, number>, fc: any) => {
            acc[fc.folder_id] = (acc[fc.folder_id] || 0) + 1;
            return acc;
          },
          {},
        );
      }
    }

    const folders = (folderAclData || []).map((item: any) => ({
      id: item.folders?.public_uuid || '',
      name: item.folders?.name || 'Unknown Folder',
      contractCount: folderContractCounts[item.folder_id] || 0,
    }));

    // Fetch contracts directly shared with the group
    const { data: contractAclData, error: contractError } = await supabase
      .from('contract_acl_group')
      .select('*')
      .eq('group_id', group.id)
      .eq('organization_id', organizationId);

    if (contractError) {
      logger.error(
        { error: sanitizeForLogging(contractError), groupId },
        'Error fetching contracts for group',
      );
    }

    // Fetch contract details for each contract
    const contractIds = (contractAclData || []).map(
      (item: any) => item.contract_id,
    );
    let contracts: Array<{
      id: string;
      vendorName: string;
      vendorDomain?: string;
      product: string;
    }> = [];

    if (contractIds.length > 0) {
      const { data: contractDetails, error: detailsError } = await supabase
        .from('contracts')
        .select(
          `
          id,
          vendors (
            name,
            domain
          ),
          vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
            vendor_products (
              name
            )
          )
        `,
        )
        .in('id', contractIds);

      if (detailsError) {
        logger.error(
          { error: sanitizeForLogging(detailsError), groupId },
          'Error fetching contract details for group',
        );
      }

      contracts = (contractDetails || []).map((contract: any) => {
        const productDetail = contract?.vendor_products_details?.[0];
        const product = productDetail?.vendor_products?.name || '';

        return {
          id: contract.id.toString(),
          vendorName: contract?.vendors?.name || 'Unknown Vendor',
          vendorDomain: contract?.vendors?.domain,
          product,
        };
      });
    }

    return {
      id: group.id,
      publicUuid: group.public_uuid,
      name: group.name,
      description: '', // Can be added to the database schema later
      memberCount: users.length,
      createdAt: group.created_at || new Date().toISOString(),
      folders,
      contracts,
      users,
    };
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error), groupId },
      'Error in getGroupById',
    );
    throw error;
  }
}
