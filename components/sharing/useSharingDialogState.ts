import { useReducer } from 'react';
import type { PermissionLevel } from '@/app/lib/sharing/actions';

interface UserWithPerm {
  id: string;
  name: string;
  email: string;
  perm: PermissionLevel;
  signedUp?: boolean;
  role?: number;
}

interface GroupWithPerm {
  id: number;
  name: string;
  perm: PermissionLevel;
  memberCount?: number;
  members?: Array<{ id: string; name: string; email: string }>;
}

interface FolderACL {
  folderId: number;
  folderName: string;
  folderPath: string;
  acl: { users: UserWithPerm[]; groups: GroupWithPerm[] };
}

interface ContractACL {
  contractId: number;
  users: UserWithPerm[];
  groups: GroupWithPerm[];
}

interface DialogState {
  currentUsers: UserWithPerm[];
  currentGroups: GroupWithPerm[];
  folderACLs: FolderACL[];
  individualContractACLs: ContractACL[];
  isUpdating: boolean;
}

type DialogAction =
  | {
      type: 'HYDRATE';
      payload: {
        users: UserWithPerm[];
        groups: GroupWithPerm[];
        folderACLs: FolderACL[];
        individualContractACLs: ContractACL[];
      };
    }
  | { type: 'RESET' }
  | {
      type: 'ADD_USER_OPTIMISTIC';
      payload: { user: UserWithPerm; isBulk: boolean };
    }
  | {
      type: 'ROLLBACK_USER';
      payload: { userId?: string; email?: string };
    }
  | {
      type: 'REMOVE_USER_OPTIMISTIC';
      payload: { userId: string; contractId?: number };
    }
  | {
      type: 'RESTORE_USER';
      payload: { user: UserWithPerm; contractId?: number };
    }
  | {
      type: 'ADD_GROUP_OPTIMISTIC';
      payload: { group: GroupWithPerm; isBulk: boolean };
    }
  | { type: 'ROLLBACK_GROUP'; payload: { groupId: number } }
  | {
      type: 'REMOVE_GROUP_OPTIMISTIC';
      payload: { groupId: number; contractId?: number };
    }
  | {
      type: 'RESTORE_GROUP';
      payload: { group: GroupWithPerm; contractId?: number };
    }
  | {
      type: 'UPDATE_USER_PERMISSION';
      payload: { userId: string; perm: PermissionLevel };
    }
  | {
      type: 'UPDATE_GROUP_PERMISSION';
      payload: { groupId: number; perm: PermissionLevel };
    }
  | {
      type: 'REMOVE_USER_FROM_FOLDER_OPTIMISTIC';
      payload: { userId: string; folderId: number };
    }
  | {
      type: 'RESTORE_USER_TO_FOLDER';
      payload: { user: UserWithPerm; folderId: number };
    }
  | {
      type: 'REMOVE_GROUP_FROM_FOLDER_OPTIMISTIC';
      payload: { groupId: number; folderId: number };
    }
  | {
      type: 'RESTORE_GROUP_TO_FOLDER';
      payload: { group: GroupWithPerm; folderId: number };
    }
  | { type: 'SET_UPDATING'; payload: boolean };

const initialState: DialogState = {
  currentUsers: [],
  currentGroups: [],
  folderACLs: [],
  individualContractACLs: [],
  isUpdating: false,
};

function reducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'HYDRATE':
      return {
        currentUsers: action.payload.users,
        currentGroups: action.payload.groups,
        folderACLs: action.payload.folderACLs,
        individualContractACLs: action.payload.individualContractACLs,
        isUpdating: false,
      };

    case 'SET_UPDATING':
      return {
        ...state,
        isUpdating: action.payload,
      };

    case 'RESET':
      return initialState;

    case 'ADD_USER_OPTIMISTIC': {
      const { user, isBulk } = action.payload;
      return {
        ...state,
        currentUsers: [...state.currentUsers, user],
        individualContractACLs: isBulk
          ? state.individualContractACLs.map((contractACL) => ({
              ...contractACL,
              users: [
                ...contractACL.users,
                {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  perm: user.perm,
                },
              ],
            }))
          : state.individualContractACLs,
      };
    }

    case 'ROLLBACK_USER': {
      const { userId, email } = action.payload;
      if (email) {
        return {
          ...state,
          currentUsers: state.currentUsers.filter((u) => u.email !== email),
          individualContractACLs: state.individualContractACLs.map(
            (contractACL) => ({
              ...contractACL,
              users: contractACL.users.filter((u) => u.email !== email),
            }),
          ),
        };
      } else {
        return {
          ...state,
          currentUsers: state.currentUsers.filter((u) => u.id !== userId),
          individualContractACLs: state.individualContractACLs.map(
            (contractACL) => ({
              ...contractACL,
              users: contractACL.users.filter((u) => u.id !== userId),
            }),
          ),
        };
      }
    }

    case 'REMOVE_USER_OPTIMISTIC': {
      const { userId, contractId } = action.payload;

      if (contractId) {
        // Remove from specific contract only (bulk view)
        return {
          ...state,
          individualContractACLs: state.individualContractACLs.map((acl) =>
            acl.contractId === contractId
              ? { ...acl, users: acl.users.filter((u) => u.id !== userId) }
              : acl,
          ),
        };
      }

      // Remove from all
      return {
        ...state,
        currentUsers: state.currentUsers.filter((u) => u.id !== userId),
        individualContractACLs: state.individualContractACLs.map(
          (contractACL) => ({
            ...contractACL,
            users: contractACL.users.filter((u) => u.id !== userId),
          }),
        ),
      };
    }

    case 'RESTORE_USER': {
      const { user, contractId } = action.payload;

      if (contractId) {
        // Restore to specific contract only (bulk view)
        return {
          ...state,
          individualContractACLs: state.individualContractACLs.map((acl) =>
            acl.contractId === contractId
              ? { ...acl, users: [...acl.users, user] }
              : acl,
          ),
        };
      }

      // Restore to all
      return {
        ...state,
        currentUsers: [...state.currentUsers, user],
        individualContractACLs: state.individualContractACLs.map((acl) => ({
          ...acl,
          users: [...acl.users, user],
        })),
      };
    }

    case 'ADD_GROUP_OPTIMISTIC': {
      const { group, isBulk } = action.payload;
      return {
        ...state,
        currentGroups: [...state.currentGroups, group],
        individualContractACLs: isBulk
          ? state.individualContractACLs.map((contractACL) => ({
              ...contractACL,
              groups: [
                ...contractACL.groups,
                {
                  id: group.id,
                  name: group.name,
                  perm: group.perm,
                  memberCount: group.memberCount,
                  members: group.members,
                },
              ],
            }))
          : state.individualContractACLs,
      };
    }

    case 'ROLLBACK_GROUP': {
      const { groupId } = action.payload;
      return {
        ...state,
        currentGroups: state.currentGroups.filter((g) => g.id !== groupId),
        individualContractACLs: state.individualContractACLs.map(
          (contractACL) => ({
            ...contractACL,
            groups: contractACL.groups.filter((g) => g.id !== groupId),
          }),
        ),
      };
    }

    case 'REMOVE_GROUP_OPTIMISTIC': {
      const { groupId, contractId } = action.payload;

      if (contractId) {
        // Remove from specific contract only (bulk view)
        return {
          ...state,
          individualContractACLs: state.individualContractACLs.map((acl) =>
            acl.contractId === contractId
              ? { ...acl, groups: acl.groups.filter((g) => g.id !== groupId) }
              : acl,
          ),
        };
      }

      // Remove from all
      return {
        ...state,
        currentGroups: state.currentGroups.filter((g) => g.id !== groupId),
        individualContractACLs: state.individualContractACLs.map(
          (contractACL) => ({
            ...contractACL,
            groups: contractACL.groups.filter((g) => g.id !== groupId),
          }),
        ),
      };
    }

    case 'RESTORE_GROUP': {
      const { group, contractId } = action.payload;

      if (contractId) {
        // Restore to specific contract only (bulk view)
        return {
          ...state,
          individualContractACLs: state.individualContractACLs.map((acl) =>
            acl.contractId === contractId
              ? { ...acl, groups: [...acl.groups, group] }
              : acl,
          ),
        };
      }

      // Restore to all
      return {
        ...state,
        currentGroups: [...state.currentGroups, group],
        individualContractACLs: state.individualContractACLs.map((acl) => ({
          ...acl,
          groups: [...acl.groups, group],
        })),
      };
    }

    case 'UPDATE_USER_PERMISSION': {
      const { userId, perm } = action.payload;
      return {
        ...state,
        currentUsers: state.currentUsers.map((u) =>
          u.id === userId ? { ...u, perm } : u,
        ),
        individualContractACLs: state.individualContractACLs.map(
          (contractACL) => ({
            ...contractACL,
            users: contractACL.users.map((u) =>
              u.id === userId ? { ...u, perm } : u,
            ),
          }),
        ),
      };
    }

    case 'UPDATE_GROUP_PERMISSION': {
      const { groupId, perm } = action.payload;
      return {
        ...state,
        currentGroups: state.currentGroups.map((g) =>
          g.id === groupId ? { ...g, perm } : g,
        ),
        individualContractACLs: state.individualContractACLs.map(
          (contractACL) => ({
            ...contractACL,
            groups: contractACL.groups.map((g) =>
              g.id === groupId ? { ...g, perm } : g,
            ),
          }),
        ),
      };
    }

    case 'REMOVE_USER_FROM_FOLDER_OPTIMISTIC': {
      const { userId, folderId } = action.payload;
      return {
        ...state,
        folderACLs: state.folderACLs.map((folderACL) =>
          folderACL.folderId === folderId
            ? {
                ...folderACL,
                acl: {
                  ...folderACL.acl,
                  users: folderACL.acl.users.filter((u) => u.id !== userId),
                },
              }
            : folderACL,
        ),
      };
    }

    case 'RESTORE_USER_TO_FOLDER': {
      const { user, folderId } = action.payload;
      return {
        ...state,
        folderACLs: state.folderACLs.map((folderACL) =>
          folderACL.folderId === folderId
            ? {
                ...folderACL,
                acl: {
                  ...folderACL.acl,
                  users: [...folderACL.acl.users, user],
                },
              }
            : folderACL,
        ),
      };
    }

    case 'REMOVE_GROUP_FROM_FOLDER_OPTIMISTIC': {
      const { groupId, folderId } = action.payload;
      return {
        ...state,
        folderACLs: state.folderACLs.map((folderACL) =>
          folderACL.folderId === folderId
            ? {
                ...folderACL,
                acl: {
                  ...folderACL.acl,
                  groups: folderACL.acl.groups.filter((g) => g.id !== groupId),
                },
              }
            : folderACL,
        ),
      };
    }

    case 'RESTORE_GROUP_TO_FOLDER': {
      const { group, folderId } = action.payload;
      return {
        ...state,
        folderACLs: state.folderACLs.map((folderACL) =>
          folderACL.folderId === folderId
            ? {
                ...folderACL,
                acl: {
                  ...folderACL.acl,
                  groups: [...folderACL.acl.groups, group],
                },
              }
            : folderACL,
        ),
      };
    }

    default:
      return state;
  }
}

export function useSharingDialogState() {
  return useReducer(reducer, initialState);
}

export type { DialogState, DialogAction, UserWithPerm, GroupWithPerm };
