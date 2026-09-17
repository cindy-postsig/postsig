import { useCallback } from 'react';
import logger from '@/utils/pino';
import {
  updateContractACL,
  updateFolderACL,
  updateBulkContractACL,
  type PermissionLevel,
  type User,
  type Group,
} from '@/app/lib/sharing/actions';
import { createOrganizationUser } from '@/app/lib/actions/organization-users';
import { MODULE_IDS } from '@/lib/settings/config';
import type {
  DialogAction,
  UserWithPerm,
  GroupWithPerm,
} from './useSharingDialogState';
import { VIEWER_ROLE } from '@/constants/data';

interface ToastOptions {
  title: string;
  description: string;
  variant?: 'default' | 'destructive';
}

interface BulkContracts {
  contractIds: number[];
  count: number;
  vendor?: string;
  vendorDomain?: string;
}

interface ContractACL {
  contractId: number;
  users: UserWithPerm[];
  groups: GroupWithPerm[];
}

interface FolderACL {
  folderId: number;
  folderName: string;
  folderPath: string;
  acl: { users: UserWithPerm[]; groups: GroupWithPerm[] };
}

interface ActionTarget {
  itemType: 'folder' | 'contract';
  numericId?: number;
  bulkContracts?: BulkContracts;
  individualContractACLs?: ContractACL[];
}

interface UseSharingDialogActionsParams {
  dispatch: (action: DialogAction) => void;
  toast: (options: ToastOptions) => void;
  target: ActionTarget;
  currentUsers: UserWithPerm[];
  currentGroups: GroupWithPerm[];
  individualContractACLs: ContractACL[];
  folderACLs: FolderACL[];
}

export function useSharingDialogActions({
  dispatch,
  toast,
  target,
  currentUsers,
  currentGroups,
  individualContractACLs,
  folderACLs,
}: UseSharingDialogActionsParams) {
  const { itemType, numericId, bulkContracts } = target;

  const addUser = useCallback(
    async (user: User) => {
      if (!numericId && !bulkContracts) return;

      const isBulk = Boolean(bulkContracts && bulkContracts.count > 1);

      if (isBulk && bulkContracts) {
        dispatch({ type: 'SET_UPDATING', payload: true });

        try {
          const contractIdsToUpdate = bulkContracts.contractIds.filter(
            (contractId) => {
              if (!target.individualContractACLs) return true;
              const contractACL = target.individualContractACLs.find(
                (acl) => acl.contractId === contractId,
              );
              if (!contractACL) return true;
              return !contractACL.users.some((u) => u.id === user.id);
            },
          );

          if (contractIdsToUpdate.length > 0) {
            await updateBulkContractACL({
              contractIds: contractIdsToUpdate,
              addUsers: [{ userId: user.id, perm: 'read', role: user.role }],
            });
          }

          dispatch({
            type: 'ADD_USER_OPTIMISTIC',
            payload: {
              user: { ...user, perm: 'read', email: user.email || '' },
              isBulk: true,
            },
          });

          toast({
            title: 'Success',
            description: `Shared ${bulkContracts.count} contracts with ${user.name}`,
          });
        } catch (error) {
          logger.error(
            { error, userId: user.id, target },
            'Failed to bulk add user',
          );
          toast({
            title: 'Error',
            description: 'Failed to share with the user. Please try again.',
            variant: 'destructive',
          });
        } finally {
          dispatch({ type: 'SET_UPDATING', payload: false });
        }
        return;
      }

      dispatch({
        type: 'ADD_USER_OPTIMISTIC',
        payload: {
          user: { ...user, perm: 'read', email: user.email || '' },
          isBulk: false,
        },
      });

      try {
        if (itemType === 'folder') {
          await updateFolderACL(numericId!, {
            addUsers: [{ userId: user.id, perm: 'read', role: user.role }],
          });
        } else {
          await updateContractACL(numericId!, {
            addUsers: [{ userId: user.id, perm: 'read', role: user.role }],
          });
        }

        toast({
          title: 'Success',
          description: `Shared with ${user.name}`,
        });
      } catch (error) {
        logger.error({ error, userId: user.id, target }, 'Failed to add user');
        dispatch({
          type: 'ROLLBACK_USER',
          payload: { userId: user.id },
        });
        toast({
          title: 'Error',
          description: 'Failed to share with the user. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [dispatch, toast, itemType, numericId, bulkContracts, target],
  );

  const addGroup = useCallback(
    async (group: Group) => {
      if (!numericId && !bulkContracts) return;

      const isBulk = Boolean(bulkContracts && bulkContracts.count > 1);

      if (isBulk && bulkContracts) {
        dispatch({ type: 'SET_UPDATING', payload: true });

        try {
          const contractIdsToUpdate = bulkContracts.contractIds.filter(
            (contractId) => {
              if (!target.individualContractACLs) return true;
              const contractACL = target.individualContractACLs.find(
                (acl) => acl.contractId === contractId,
              );
              if (!contractACL) return true;
              return !contractACL.groups.some((g) => g.id === group.id);
            },
          );

          if (contractIdsToUpdate.length > 0) {
            await updateBulkContractACL({
              contractIds: contractIdsToUpdate,
              addGroups: [{ groupId: group.id, perm: 'read' }],
            });
          }

          dispatch({
            type: 'ADD_GROUP_OPTIMISTIC',
            payload: {
              group: { ...group, perm: 'read' as PermissionLevel },
              isBulk: true,
            },
          });

          toast({
            title: 'Success',
            description: `Shared ${bulkContracts.count} contracts with ${group.name} group`,
          });
        } catch (error) {
          logger.error(
            { error, groupId: group.id, groupName: group.name },
            'Failed to bulk add group',
          );
          toast({
            title: 'Error',
            description: 'Failed to share with the group. Please try again.',
            variant: 'destructive',
          });
        } finally {
          dispatch({ type: 'SET_UPDATING', payload: false });
        }
        return;
      }

      dispatch({
        type: 'ADD_GROUP_OPTIMISTIC',
        payload: {
          group: { ...group, perm: 'read' as PermissionLevel },
          isBulk: false,
        },
      });

      try {
        if (itemType === 'folder') {
          await updateFolderACL(numericId!, {
            addGroups: [{ groupId: group.id, perm: 'read' }],
          });
        } else {
          await updateContractACL(numericId!, {
            addGroups: [{ groupId: group.id, perm: 'read' }],
          });
        }

        toast({
          title: 'Success',
          description: `Shared with ${group.name} group`,
        });
      } catch (error) {
        logger.error(
          { error, groupId: group.id, groupName: group.name },
          'Failed to add group',
        );
        dispatch({
          type: 'ROLLBACK_GROUP',
          payload: { groupId: group.id },
        });
        toast({
          title: 'Error',
          description: 'Failed to share with the group. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [dispatch, toast, itemType, numericId, bulkContracts, target],
  );

  const removeUser = useCallback(
    async (userId: string, contractId?: number) => {
      if (!numericId && !bulkContracts) return;

      let user = currentUsers.find((u) => u.id === userId);
      if (!user && contractId) {
        const contractACL = individualContractACLs.find(
          (acl) => acl.contractId === contractId,
        );
        user = contractACL?.users.find((u) => u.id === userId);
      }
      if (!user) return;

      const isBulkRemoveAll =
        bulkContracts && bulkContracts.count > 1 && !contractId;

      if (isBulkRemoveAll) {
        dispatch({ type: 'SET_UPDATING', payload: true });

        try {
          await updateBulkContractACL({
            contractIds: bulkContracts.contractIds,
            removeUsers: [{ userId, role: user.role }],
          });

          dispatch({
            type: 'REMOVE_USER_OPTIMISTIC',
            payload: { userId },
          });

          toast({
            title: 'Success',
            description: `Removed ${user.name} from ${bulkContracts.count} contracts`,
          });
        } catch (error) {
          toast({
            title: 'Error',
            description: 'Failed to remove access',
            variant: 'destructive',
          });
        } finally {
          dispatch({ type: 'SET_UPDATING', payload: false });
        }
        return;
      }

      try {
        dispatch({
          type: 'REMOVE_USER_OPTIMISTIC',
          payload: { userId, contractId },
        });

        if (itemType === 'folder') {
          await updateFolderACL(numericId!, {
            removeUsers: [{ userId, role: user.role }],
          });
        } else if (bulkContracts && contractId) {
          await updateContractACL(contractId, {
            removeUsers: [{ userId, role: user.role }],
          });
        } else {
          await updateContractACL(numericId!, {
            removeUsers: [{ userId, role: user.role }],
          });
        }

        toast({
          title: 'Success',
          description:
            bulkContracts && contractId
              ? `Removed ${user.name} from contract`
              : `Removed ${user.name}`,
        });
      } catch (error) {
        dispatch({
          type: 'RESTORE_USER',
          payload: { user, contractId },
        });
        toast({
          title: 'Error',
          description: 'Failed to remove access',
          variant: 'destructive',
        });
      }
    },
    [
      dispatch,
      toast,
      itemType,
      numericId,
      bulkContracts,
      currentUsers,
      individualContractACLs,
    ],
  );

  const removeGroup = useCallback(
    async (groupId: number, contractId?: number) => {
      if (!numericId && !bulkContracts) return;

      let group = currentGroups.find((g) => g.id === groupId);
      if (!group && contractId) {
        const contractACL = individualContractACLs.find(
          (acl) => acl.contractId === contractId,
        );
        group = contractACL?.groups.find((g) => g.id === groupId);
      }
      if (!group) return;

      const isBulkRemoveAll =
        bulkContracts && bulkContracts.count > 1 && !contractId;

      if (isBulkRemoveAll) {
        dispatch({ type: 'SET_UPDATING', payload: true });

        try {
          await updateBulkContractACL({
            contractIds: bulkContracts.contractIds,
            removeGroups: [groupId],
          });

          dispatch({
            type: 'REMOVE_GROUP_OPTIMISTIC',
            payload: { groupId },
          });

          toast({
            title: 'Success',
            description: `Removed ${group.name} group from ${bulkContracts.count} contracts`,
          });
        } catch (error) {
          toast({
            title: 'Error',
            description: 'Failed to remove access',
            variant: 'destructive',
          });
        } finally {
          dispatch({ type: 'SET_UPDATING', payload: false });
        }
        return;
      }

      try {
        dispatch({
          type: 'REMOVE_GROUP_OPTIMISTIC',
          payload: { groupId, contractId },
        });

        if (itemType === 'folder') {
          await updateFolderACL(numericId!, {
            removeGroups: [groupId],
          });
        } else if (bulkContracts && contractId) {
          await updateContractACL(contractId, {
            removeGroups: [groupId],
          });
        } else {
          await updateContractACL(numericId!, {
            removeGroups: [groupId],
          });
        }

        toast({
          title: 'Success',
          description:
            bulkContracts && contractId
              ? `Removed ${group.name} group from contract`
              : `Removed ${group.name} group`,
        });
      } catch (error) {
        dispatch({
          type: 'RESTORE_GROUP',
          payload: { group, contractId },
        });
        toast({
          title: 'Error',
          description: 'Failed to remove access',
          variant: 'destructive',
        });
      }
    },
    [
      dispatch,
      toast,
      itemType,
      numericId,
      bulkContracts,
      currentGroups,
      individualContractACLs,
    ],
  );

  const removeUserFromFolder = useCallback(
    async (userId: string, folderId: number) => {
      const user = folderACLs
        .find((f) => f.folderId === folderId)
        ?.acl.users.find((u) => u.id === userId);
      if (!user) return;

      try {
        dispatch({
          type: 'REMOVE_USER_FROM_FOLDER_OPTIMISTIC',
          payload: { userId, folderId },
        });

        await updateFolderACL(folderId, {
          removeUsers: [{ userId, role: user.role }],
        });

        toast({
          title: 'Success',
          description: `Removed ${user.name} from folder`,
        });
      } catch (error) {
        dispatch({
          type: 'RESTORE_USER_TO_FOLDER',
          payload: { user, folderId },
        });
        toast({
          title: 'Error',
          description: 'Failed to remove access from folder',
          variant: 'destructive',
        });
      }
    },
    [dispatch, toast, folderACLs],
  );

  const removeGroupFromFolder = useCallback(
    async (groupId: number, folderId: number) => {
      const group = folderACLs
        .find((f) => f.folderId === folderId)
        ?.acl.groups.find((g) => g.id === groupId);
      if (!group) return;

      try {
        dispatch({
          type: 'REMOVE_GROUP_FROM_FOLDER_OPTIMISTIC',
          payload: { groupId, folderId },
        });

        await updateFolderACL(folderId, {
          removeGroups: [groupId],
        });

        toast({
          title: 'Success',
          description: `Removed ${group.name} group from folder`,
        });
      } catch (error) {
        dispatch({
          type: 'RESTORE_GROUP_TO_FOLDER',
          payload: { group, folderId },
        });
        toast({
          title: 'Error',
          description: 'Failed to remove access from folder',
          variant: 'destructive',
        });
      }
    },
    [dispatch, toast, folderACLs],
  );

  const inviteUser = useCallback(
    async (email: string) => {
      const isBulk = Boolean(bulkContracts && bulkContracts.count > 1);

      if (isBulk) {
        dispatch({ type: 'SET_UPDATING', payload: true });
      }

      try {
        const result = await createOrganizationUser({
          email,
          appRole: 'Viewer',
          moduleId: MODULE_IDS.cpm,
        });

        const newUser: UserWithPerm = {
          id: result.userId,
          name: email,
          email,
          perm: 'read',
          signedUp: false,
          role: VIEWER_ROLE,
        };

        if (itemType === 'folder') {
          await updateFolderACL(numericId!, {
            addUsers: [{ userId: newUser.id, perm: 'read', role: VIEWER_ROLE }],
          });
        } else if (bulkContracts && bulkContracts.count > 1) {
          await updateBulkContractACL({
            contractIds: bulkContracts.contractIds,
            addUsers: [{ userId: newUser.id, perm: 'read', role: VIEWER_ROLE }],
          });
        } else if (bulkContracts) {
          await updateContractACL(bulkContracts.contractIds[0], {
            addUsers: [{ userId: newUser.id, perm: 'read', role: VIEWER_ROLE }],
          });
        } else {
          await updateContractACL(numericId!, {
            addUsers: [{ userId: newUser.id, perm: 'read', role: VIEWER_ROLE }],
          });
        }

        dispatch({
          type: 'ADD_USER_OPTIMISTIC',
          payload: { user: newUser, isBulk },
        });

        toast({
          title: 'Success',
          description: bulkContracts
            ? `Invited ${email} and granted access to ${bulkContracts.count} contracts`
            : `Invited ${email} and granted access`,
        });
      } catch (error: any) {
        logger.error({ error, email }, 'Failed to invite user');
        dispatch({
          type: 'ROLLBACK_USER',
          payload: { email },
        });
        toast({
          title: 'Error',
          description:
            error instanceof Error ? error.message : 'Failed to invite user',
          variant: 'destructive',
        });
      } finally {
        if (isBulk) {
          dispatch({ type: 'SET_UPDATING', payload: false });
        }
      }
    },
    [dispatch, toast, itemType, numericId, bulkContracts],
  );

  const removeInvitedUser = useCallback(
    async (user: UserWithPerm) => {
      const { id: userId } = user;
      const isBulk = Boolean(bulkContracts && bulkContracts.count > 1);

      // For bulk operations, show loading state
      if (isBulk) {
        dispatch({ type: 'SET_UPDATING', payload: true });
      }

      try {
        if (itemType === 'folder') {
          await updateFolderACL(numericId!, {
            removeUsers: [{ userId, role: VIEWER_ROLE }],
          });
        } else if (bulkContracts && bulkContracts.count > 1) {
          await updateBulkContractACL({
            contractIds: bulkContracts.contractIds,
            removeUsers: [{ userId, role: VIEWER_ROLE }],
          });
        } else if (bulkContracts) {
          await updateContractACL(bulkContracts.contractIds[0], {
            removeUsers: [{ userId, role: VIEWER_ROLE }],
          });
        } else {
          await updateContractACL(numericId!, {
            removeUsers: [{ userId, role: VIEWER_ROLE }],
          });
        }

        dispatch({
          type: 'REMOVE_USER_OPTIMISTIC',
          payload: { userId },
        });

        toast({
          title: 'Success',
          description: bulkContracts
            ? `Removed ${user.name || user.email} from ${bulkContracts.count} contracts`
            : `Removed ${user.name || user.email}`,
        });
      } catch (error) {
        logger.error({ error, userId }, 'Failed to remove invited user');
        toast({
          title: 'Error',
          description: 'Failed to remove invited user',
          variant: 'destructive',
        });
      } finally {
        if (isBulk) {
          dispatch({ type: 'SET_UPDATING', payload: false });
        }
      }
    },
    [dispatch, toast, itemType, numericId, bulkContracts],
  );

  return {
    addUser,
    addGroup,
    removeUser,
    removeGroup,
    removeUserFromFolder,
    removeGroupFromFolder,
    inviteUser,
    removeInvitedUser,
  };
}
