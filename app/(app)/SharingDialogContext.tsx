'use client';

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  fetchAllOrgUsersWithRoles,
  fetchOrgGroups,
  type User,
  type Group,
} from '@/app/lib/sharing/actions';
import logger from '@/utils/pino';

export interface SharingDialogState {
  itemId: string | number;
  itemType: 'folder' | 'contract';
  folderName?: string;
  folderId?: number;
  folderOwnerId?: string;
  contract?: any;
  bulkContracts?: {
    contractIds: number[];
    vendor: string;
    vendorDomain?: string;
    count: number;
    contracts?: Array<{
      id: number;
      vendor: string;
      vendorDomain?: string;
      product?: string;
      products?: any[];
      uploadedBy?: any;
      type?: string;
    }>;
  };
  folderACLs?: Array<{
    folderId: number;
    folderName: string;
    folderPath: string;
    acl: { users: any[]; groups: any[] };
  }>;
}

interface OrgData {
  allUsers: User[];
  adminsAndManagers: User[];
  groups: Group[];
  organizationName: string;
  currentUser?: User;
}

interface SharingDialogContextType {
  openSharingDialog: (state: SharingDialogState) => void;
  closeSharingDialog: () => void;
  sharingDialogState: SharingDialogState | null;
  orgData: OrgData | null;
  isLoadingOrgData: boolean;
  refreshOrgData: () => void;
}

const SharingDialogContext = createContext<SharingDialogContextType>({
  openSharingDialog: () => {},
  closeSharingDialog: () => {},
  sharingDialogState: null,
  orgData: null,
  isLoadingOrgData: true,
  refreshOrgData: () => {},
});

export function SharingDialogProvider({
  children,
  initialOrgData,
  canLoadOrgData = true,
}: {
  children: ReactNode;
  initialOrgData?: OrgData;
  /**
   * False when the server withheld the roster because the account cannot share.
   * Without it the absent payload reads as a failed fetch and the client asks
   * for the same data again, which the server action now refuses.
   */
  canLoadOrgData?: boolean;
}) {
  const [sharingDialogState, setSharingDialogState] =
    useState<SharingDialogState | null>(null);
  const [orgData, setOrgData] = useState<OrgData | null>(
    initialOrgData || null,
  );
  const [isLoadingOrgData, setIsLoadingOrgData] = useState(
    !initialOrgData && canLoadOrgData,
  );

  const loadOrgData = async () => {
    setIsLoadingOrgData(true);
    try {
      const [usersData, groupsData] = await Promise.all([
        fetchAllOrgUsersWithRoles(),
        fetchOrgGroups().catch((error) => {
          logger.error({ error }, 'Failed to fetch org groups');
          return [];
        }),
      ]);

      setOrgData({
        allUsers: usersData.allUsers,
        adminsAndManagers: usersData.adminsAndManagers,
        groups: groupsData,
        organizationName: usersData.organizationName,
        currentUser: usersData.currentUser,
      });
    } catch (error) {
      logger.error(
        { error },
        'Failed to load org data in SharingDialogContext',
      );
    } finally {
      setIsLoadingOrgData(false);
    }
  };

  useEffect(() => {
    // Only fetch if no initial data was provided
    if (!initialOrgData && canLoadOrgData) {
      loadOrgData();
    }
  }, []);

  const openSharingDialog = useCallback((state: SharingDialogState) => {
    setSharingDialogState(state);
  }, []);

  const closeSharingDialog = useCallback(() => {
    setSharingDialogState(null);
  }, []);

  const refreshOrgData = useCallback(() => {
    loadOrgData();
  }, []);

  return (
    <SharingDialogContext.Provider
      value={{
        openSharingDialog,
        closeSharingDialog,
        sharingDialogState,
        orgData,
        isLoadingOrgData,
        refreshOrgData,
      }}
    >
      {children}
    </SharingDialogContext.Provider>
  );
}

export function useSharingDialog() {
  return useContext(SharingDialogContext);
}
