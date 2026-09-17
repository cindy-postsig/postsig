'use client';

import { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '../ui/separator';
import { toast } from '@/components/ui/use-toast';
import VendorIcon from '@/components/vendors/VendorIcon';
import { UserGroupSearchPicker } from './UserGroupSearchPicker';
import { CurrentAccessList } from './CurrentAccessList';
import { AdminsManagersSection } from './AdminsManagersSection';
import { InheritedAccessSection } from './InheritedAccessSection';
import { GroupAccessSection } from './GroupAccessSection';
import { BulkContractAccessList } from './BulkContractAccessList';
import { useSharingDialog } from '@/app/(app)/SharingDialogContext';
import { useSharingDialogData } from './useSharingDialogData';
import { useSharingDialogState } from './useSharingDialogState';
import type { UserWithPerm, GroupWithPerm } from './useSharingDialogState';
import { useSharingDialogActions } from './useSharingDialogActions';

interface SharingDialogProps {
  itemId: string | number;
  itemType: 'folder' | 'contract';
  folderName?: string;
  folderId?: number;
  folderOwnerId?: string;
  contract?: {
    id?: number;
    vendors?: { name: string; domain?: string };
    contract_types?: { id?: number; name: string };
    uploaded_by?: { id: string; name: string; email?: string };
  };
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
    }>;
  };
  folderACLs?: Array<{
    folderId: number;
    folderName: string;
    folderPath: string;
    acl: { users: any[]; groups: any[] };
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SharingDialog({
  itemId,
  itemType,
  folderName,
  folderId,
  folderOwnerId,
  contract,
  bulkContracts,
  folderACLs: folderACLsProp,
  open,
  onOpenChange,
}: SharingDialogProps) {
  const {
    orgData,
    isLoadingOrgData: contextLoadingOrgData,
    refreshOrgData,
  } = useSharingDialog();
  const availableUsers = orgData?.allUsers || [];
  const availableGroups = orgData?.groups || [];
  const adminsAndManagers = orgData?.adminsAndManagers || [];
  const organizationName = orgData?.organizationName || '';
  const currentUser = orgData?.currentUser;
  const isLoadingOrgData = contextLoadingOrgData || !orgData;

  const {
    mode,
    isLoading: aclLoading,
    hasLoaded: aclLoaded,
    currentUsers: loadedUsers,
    currentGroups: loadedGroups,
    folderACLs: loadedFolderACLs,
    individualContractACLs: loadedContractACLs,
  } = useSharingDialogData({
    open,
    itemType,
    itemId,
    folderId,
    folderOwnerId,
    contract,
    bulkContracts,
    providedFolderACLs: folderACLsProp,
    orgUsers: availableUsers,
  });

  const [state, dispatch] = useSharingDialogState();
  const {
    currentUsers,
    currentGroups,
    folderACLs: internalFolderACLs,
    individualContractACLs,
    isUpdating,
  } = state;

  const hasHydratedRef = useRef(false);

  const numericId =
    itemType === 'folder'
      ? folderId
      : typeof itemId === 'number'
        ? itemId
        : contract?.id;

  useEffect(() => {
    if (!open || !aclLoaded) {
      hasHydratedRef.current = false;
      return;
    }

    if (hasHydratedRef.current) return;

    const normalizedUsers = (loadedUsers ?? []).map((user) => ({
      ...user,
      email: user.email ?? '',
    }));

    dispatch({
      type: 'HYDRATE',
      payload: {
        users: normalizedUsers as UserWithPerm[],
        groups: (loadedGroups ?? []) as GroupWithPerm[],
        folderACLs: loadedFolderACLs ?? [],
        individualContractACLs: loadedContractACLs ?? [],
      },
    });

    hasHydratedRef.current = true;
  }, [
    open,
    aclLoaded,
    loadedUsers,
    loadedGroups,
    loadedFolderACLs,
    loadedContractACLs,
    dispatch,
  ]);

  useEffect(() => {
    if (!open) {
      hasHydratedRef.current = false;
      dispatch({ type: 'RESET' });
    }
  }, [open, dispatch]);

  const actions = useSharingDialogActions({
    dispatch,
    toast,
    target: { itemType, numericId, bulkContracts, individualContractACLs },
    currentUsers,
    currentGroups,
    individualContractACLs,
    folderACLs: internalFolderACLs,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-w-xl flex-col gap-0"
        onContextMenu={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {itemType === 'folder'
              ? `Share "${folderName || 'Folder'}"`
              : bulkContracts && bulkContracts.count > 1
                ? `Share ${bulkContracts.count} Contracts`
                : 'Share Contract'}
          </DialogTitle>
          {itemType === 'contract' &&
            ((contract && !bulkContracts) ||
              (bulkContracts && bulkContracts.count === 1)) && (
              <DialogDescription>
                <div className="flex items-center gap-1.5">
                  {contract?.vendors ? (
                    <>
                      <VendorIcon
                        name={contract.vendors.name}
                        domain={contract.vendors.domain}
                        width={18}
                        height={18}
                      />
                      <div className="flex flex-col items-start justify-start text-left text-sm text-foreground sm:flex-row sm:items-center sm:gap-2">
                        <span>
                          {contract?.vendors?.name || 'Unknown Vendor'}
                        </span>
                        {contract?.contract_types?.name && (
                          <span className="text-muted-foreground">
                            {contract.contract_types.name}
                          </span>
                        )}
                      </div>
                    </>
                  ) : bulkContracts &&
                    bulkContracts.count === 1 &&
                    bulkContracts.contracts?.[0] ? (
                    <>
                      <VendorIcon
                        name={bulkContracts.contracts[0].vendor}
                        domain={bulkContracts.contracts[0].vendorDomain}
                        width={18}
                        height={18}
                      />
                      <div className="flex flex-col items-start justify-start text-left text-sm text-foreground sm:flex-row sm:items-center sm:gap-2">
                        <span>{bulkContracts.contracts[0].vendor}</span>
                        {bulkContracts.contracts[0].products?.[0]
                          ?.vendor_products?.name && (
                          <span className="text-muted-foreground">
                            {
                              bulkContracts.contracts[0].products[0]
                                .vendor_products.name
                            }
                          </span>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              </DialogDescription>
            )}
        </DialogHeader>

        <Separator className="mt-6" />

        <div className="-mx-2 pt-6">
          <div className="flex flex-col space-y-7 px-2">
            <UserGroupSearchPicker
              availableUsers={availableUsers}
              availableGroups={availableGroups}
              currentUsers={currentUsers}
              currentGroups={currentGroups}
              adminsAndManagers={adminsAndManagers}
              isLoadingOrgData={isLoadingOrgData}
              onAddUser={actions.addUser}
              onAddGroup={actions.addGroup}
              onInviteUser={actions.inviteUser}
            />

            <div className="flex min-h-0 flex-1 flex-col divide-y">
              {bulkContracts && bulkContracts.count > 1 ? (
                <BulkContractAccessList
                  contractACLs={individualContractACLs}
                  adminsAndManagers={adminsAndManagers}
                  currentUser={currentUser}
                  bulkContracts={bulkContracts}
                  onRemoveUser={actions.removeUser}
                  onRemoveGroup={actions.removeGroup}
                  isUpdating={isUpdating}
                />
              ) : (
                <>
                  <CurrentAccessList
                    currentUsers={currentUsers}
                    itemType={itemType}
                    uploaderId={
                      contract?.uploaded_by?.id ||
                      (bulkContracts &&
                      bulkContracts.count === 1 &&
                      bulkContracts.contracts?.[0]?.uploadedBy
                        ? bulkContracts.contracts[0].uploadedBy.id
                        : undefined)
                    }
                    folderOwnerId={folderOwnerId}
                    currentUser={currentUser}
                    adminsAndManagers={adminsAndManagers}
                    onRemoveUser={actions.removeUser}
                    isLoadingACL={aclLoading || isUpdating}
                  />

                  <div className="divide-y">
                    <GroupAccessSection
                      groups={currentGroups}
                      onRemoveGroup={actions.removeGroup}
                    />

                    <AdminsManagersSection
                      organizationName={organizationName}
                      adminsAndManagers={adminsAndManagers}
                    />

                    <InheritedAccessSection
                      itemType={itemType}
                      folderACLs={internalFolderACLs}
                      adminsAndManagers={adminsAndManagers}
                      onRemoveUserFromFolder={actions.removeUserFromFolder}
                      onRemoveGroupFromFolder={actions.removeGroupFromFolder}
                    />

                    {!aclLoading &&
                      currentUsers.length === 0 &&
                      currentGroups.length === 0 &&
                      adminsAndManagers.length === 0 &&
                      (!internalFolderACLs ||
                        internalFolderACLs.length === 0) && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          No one has been given access yet.
                        </p>
                      )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
