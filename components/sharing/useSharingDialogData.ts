'use client';

import { useEffect, useReducer } from 'react';
import logger from '@/utils/pino';
import { toast } from '@/components/ui/use-toast';
import {
  fetchFolderACL,
  fetchCompleteContractSharing,
  fetchBulkContractACLs,
  fetchContractFolderACLs,
  type PermissionLevel,
} from '@/app/lib/sharing/actions';
import { ensureUploaderInACL, type UploaderInfo } from '@/lib/sharing/aclUtils';
import { type User } from '@/app/lib/sharing/actions';

type Mode = 'folder' | 'singleContract' | 'bulkSingle' | 'bulkMany' | 'idle';

interface Params {
  open: boolean;
  itemType: 'folder' | 'contract';
  itemId: string | number;
  folderId?: number;
  folderOwnerId?: string;
  contract?: {
    id?: number;
    uploaded_by?: { id: string; name: string; email?: string };
  };
  bulkContracts?: {
    contractIds: number[];
    count: number;
    contracts?: Array<{ id: number; uploadedBy?: UploaderInfo }>;
  };
  providedFolderACLs?: Array<{
    folderId: number;
    folderName: string;
    folderPath: string;
    acl: { users: any[]; groups: any[] };
  }>;
  orgUsers: User[];
}

interface ACLState {
  mode: Mode;
  isLoading: boolean;
  hasLoaded: boolean;
  currentUsers: Array<{
    id: string;
    name: string;
    email?: string;
    perm: PermissionLevel;
    signedUp?: boolean;
  }>;
  currentGroups: Array<{
    id: number;
    name: string;
    perm: PermissionLevel;
  }>;
  folderACLs: Params['providedFolderACLs'];
  individualContractACLs: Array<{
    contractId: number;
    users: any[];
    groups: any[];
  }>;
  error?: string;
}

type Action =
  | { type: 'RESET' }
  | { type: 'START_LOADING'; payload: { mode: Mode } }
  | { type: 'LOAD_SUCCESS'; payload: Partial<ACLState> }
  | { type: 'LOAD_ERROR'; payload: { message: string } };

const initialState: ACLState = {
  mode: 'idle',
  isLoading: false,
  hasLoaded: false,
  currentUsers: [],
  currentGroups: [],
  folderACLs: [],
  individualContractACLs: [],
};

function reducer(state: ACLState, action: Action): ACLState {
  switch (action.type) {
    case 'RESET':
      return initialState;
    case 'START_LOADING':
      return {
        ...state,
        mode: action.payload.mode,
        isLoading: true,
        error: undefined,
      };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        ...action.payload,
        isLoading: false,
        hasLoaded: true,
        error: undefined,
      };
    case 'LOAD_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload.message,
      };
    default:
      return state;
  }
}

function resolveMode(params: Params, numericId?: number): Mode {
  if (!params.open || !numericId) return 'idle';
  const { itemType, bulkContracts } = params;

  if (itemType === 'folder') return 'folder';
  if (bulkContracts) {
    if (bulkContracts.contractIds.length === 0) return 'idle';
    if (bulkContracts.contractIds.length === 1) return 'bulkSingle';
    return 'bulkMany';
  }
  return 'singleContract';
}

function filterDirectAccessOnly(users: any[]): any[] {
  return users.filter((user) => {
    const sources = user.permissionSources || [];

    // Only show users with direct ACL or contract ownership
    // Exclude: org_admin, folder_inheritance, folder_group_inheritance, group_membership
    const hasDirectAccess = sources.some(
      (source: string) =>
        source === 'direct_acl' || source === 'contract_owner',
    );

    const hasOnlySystemAccess = sources.every(
      (source: string) =>
        source === 'org_admin' ||
        source === 'folder_inheritance' ||
        source === 'folder_group_inheritance',
    );

    // Show if has direct access, or if no permissionSources data (backward compatibility)
    return !sources.length || (hasDirectAccess && !hasOnlySystemAccess);
  });
}

function ensureDefaultAccess({
  acl,
  users,
  params,
  numericId,
}: {
  acl: { users: any[]; groups: any[] };
  users: User[];
  params: Params;
  numericId?: number;
}) {
  let userToEnsure: UploaderInfo | undefined;

  if (params.itemType === 'contract') {
    if (params.contract?.uploaded_by) {
      userToEnsure = {
        id: params.contract.uploaded_by.id,
        name: params.contract.uploaded_by.name,
        email: params.contract.uploaded_by.email || '',
      };
    } else if (
      params.bulkContracts &&
      params.bulkContracts.count === 1 &&
      params.bulkContracts.contracts?.[0]?.uploadedBy
    ) {
      const uploader = params.bulkContracts.contracts[0].uploadedBy;
      userToEnsure = {
        id: uploader.id,
        name: uploader.name,
        email: uploader.email || '',
      };
    }
  } else if (params.itemType === 'folder' && params.folderOwnerId) {
    const ownerInfo = users.find((u) => u.id === params.folderOwnerId);
    if (ownerInfo) {
      userToEnsure = {
        id: ownerInfo.id,
        name: ownerInfo.name,
        email: ownerInfo.email || '',
      };
    }
  }

  return ensureUploaderInACL(acl, userToEnsure);
}

export function useSharingDialogData(params: Params) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const {
    open,
    itemType,
    itemId,
    folderId,
    folderOwnerId,
    contract,
    bulkContracts,
    providedFolderACLs,
    orgUsers,
  } = params;

  const numericId =
    itemType === 'folder'
      ? folderId
      : typeof itemId === 'number'
        ? itemId
        : contract?.id;

  const mode = resolveMode(params, numericId);
  const contractIds = bulkContracts?.contractIds;
  const bulkCount = bulkContracts?.count;

  useEffect(() => {
    if (!open) {
      dispatch({ type: 'RESET' });
      return;
    }

    if (!numericId || mode === 'idle') return;
    if (state.hasLoaded) return;

    dispatch({ type: 'START_LOADING', payload: { mode } });

    const load = async () => {
      try {
        if (mode === 'bulkMany') {
          // Fetch ACLs for all contracts to determine who already has access
          const aclMap = await fetchBulkContractACLs(contractIds || []);

          // Build individual contract ACLs from the fetched data
          const individualContractACLs = (contractIds || []).map(
            (contractId) => {
              const acl = aclMap[contractId] || { users: [], groups: [] };
              return {
                contractId,
                users: acl.users.map((u: any) => ({
                  ...u,
                  perm: (u.perm || 'read') as PermissionLevel,
                })),
                groups: acl.groups.map((g: any) => ({
                  ...g,
                  perm: (g.perm || 'read') as PermissionLevel,
                })),
              };
            },
          );

          // Find users who have access to ALL contracts (intersection)
          // These should be excluded from "Add People"
          const totalContracts = contractIds?.length || 0;
          const userAccessCounts = new Map<string, number>();
          const userDataMap = new Map<string, any>();

          individualContractACLs.forEach((contractACL) => {
            contractACL.users.forEach((user) => {
              userAccessCounts.set(
                user.id,
                (userAccessCounts.get(user.id) || 0) + 1,
              );
              // Keep the most recent user data
              userDataMap.set(user.id, user);
            });
          });

          // Users with access to ALL contracts
          const usersWithFullAccess: any[] = [];
          userAccessCounts.forEach((count, userId) => {
            if (count === totalContracts) {
              usersWithFullAccess.push(userDataMap.get(userId));
            }
          });

          // Find groups who have access to ALL contracts (intersection)
          const groupAccessCounts = new Map<number, number>();
          const groupDataMap = new Map<number, any>();

          individualContractACLs.forEach((contractACL) => {
            contractACL.groups.forEach((group) => {
              groupAccessCounts.set(
                group.id,
                (groupAccessCounts.get(group.id) || 0) + 1,
              );
              // Keep the most recent group data
              groupDataMap.set(group.id, group);
            });
          });

          // Groups with access to ALL contracts
          const groupsWithFullAccess: any[] = [];
          groupAccessCounts.forEach((count, groupId) => {
            if (count === totalContracts) {
              groupsWithFullAccess.push(groupDataMap.get(groupId));
            }
          });

          dispatch({
            type: 'LOAD_SUCCESS',
            payload: {
              individualContractACLs,
              folderACLs: [],
              currentUsers: usersWithFullAccess,
              currentGroups: groupsWithFullAccess,
            },
          });
          return;
        }

        if (mode === 'bulkSingle') {
          const [aclMap, folderACLs] = await Promise.all([
            fetchBulkContractACLs(params.bulkContracts!.contractIds),
            params.providedFolderACLs
              ? Promise.resolve(params.providedFolderACLs)
              : fetchContractFolderACLs(params.bulkContracts!.contractIds),
          ]);

          const contractId = params.bulkContracts!.contractIds[0];
          const acl = aclMap[contractId] || { users: [], groups: [] };

          const normalizedACL = {
            users: acl.users.map((u: any) => ({
              ...u,
              perm: (u.perm || 'read') as PermissionLevel,
            })),
            groups: acl.groups.map((g: any) => ({
              ...g,
              perm: (g.perm || 'read') as PermissionLevel,
            })),
          };

          const ensuredACL = ensureDefaultAccess({
            acl: normalizedACL,
            users: params.orgUsers,
            params,
            numericId,
          });

          // Filter to show only direct access (direct ACL + owners)
          const filteredUsers = filterDirectAccessOnly(ensuredACL.users);

          dispatch({
            type: 'LOAD_SUCCESS',
            payload: {
              currentUsers: filteredUsers,
              currentGroups: ensuredACL.groups,
              individualContractACLs: [
                {
                  contractId,
                  users: filteredUsers,
                  groups: ensuredACL.groups,
                },
              ],
              folderACLs,
            },
          });
          return;
        }

        if (mode === 'folder') {
          const acl = await fetchFolderACL(numericId);

          const normalizedACL = {
            users: acl.users.map((u: any) => ({
              ...u,
              perm: (u.perm || 'read') as PermissionLevel,
            })),
            groups: acl.groups.map((g: any) => ({
              ...g,
              perm: (g.perm || 'read') as PermissionLevel,
            })),
          };

          const ensuredACL = ensureDefaultAccess({
            acl: normalizedACL,
            users: params.orgUsers,
            params,
            numericId,
          });

          // Folders don't have permissionSources yet, so no filtering needed
          dispatch({
            type: 'LOAD_SUCCESS',
            payload: {
              currentUsers: ensuredACL.users,
              currentGroups: ensuredACL.groups,
              folderACLs: [],
            },
          });
          return;
        }

        // single contract
        const data = await fetchCompleteContractSharing(numericId);

        const normalizedACL = {
          users: data.contractACL.users.map((u: any) => ({
            ...u,
            perm: (u.perm || 'read') as PermissionLevel,
          })),
          groups: data.contractACL.groups.map((g: any) => ({
            ...g,
            perm: (g.perm || 'read') as PermissionLevel,
          })),
        };

        const ensuredACL = ensureDefaultAccess({
          acl: normalizedACL,
          users: params.orgUsers,
          params,
          numericId,
        });

        // Filter to show only direct access (direct ACL + owners)
        const filteredUsers = filterDirectAccessOnly(ensuredACL.users);

        const folderACLs = params.providedFolderACLs ?? data.folderACLs ?? [];

        dispatch({
          type: 'LOAD_SUCCESS',
          payload: {
            currentUsers: filteredUsers,
            currentGroups: ensuredACL.groups,
            folderACLs,
          },
        });
      } catch (error: any) {
        logger.error(
          {
            error,
            itemType: params.itemType,
            itemId: numericId,
            bulkCount: params.bulkContracts?.count,
          },
          'Error loading sharing dialog data',
        );
        toast({
          title: 'Error',
          description: 'Failed to load sharing settings',
          variant: 'destructive',
        });
        dispatch({
          type: 'LOAD_ERROR',
          payload: { message: error?.message ?? 'Failed to load data' },
        });
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    numericId,
    mode,
    state.hasLoaded,
    itemType,
    contractIds,
    bulkCount,
  ]);

  return {
    ...state,
    mode,
    reload: () => dispatch({ type: 'RESET' }),
  };
}
