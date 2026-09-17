'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type User, fetchBulkContractACLs } from '@/app/lib/sharing/actions';
import type {
  ContractACLData,
  SharingUser,
  SharingGroup,
  SharingProduct,
} from '@/types/sharing';
import VendorIcon from '@/components/vendors/VendorIcon';
import { UserItem } from './UserItem';
import { GroupedAccessSection } from './GroupedAccessSection';
import { Users, MoreHorizontal } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import ContractLabel from '@/components/contracts/ContractLabel';
import logger from '@/utils/pino';
import { ensureUploaderInACL } from '@/lib/sharing/aclUtils';
import { userRoles } from '@/constants/data';
import { useAbility } from '@/components/providers/AbilityProvider';

interface VendorGroup {
  vendor: string;
  vendorDomain?: string;
  contractIds: number[];
  contracts: Array<{
    id: number;
    vendor: string;
    vendorDomain?: string;
    product?: string;
    products?: SharingProduct[];
    uploadedBy?: SharingUser;
    type?: string;
  }>;
}

interface BulkContractAccessListProps {
  contractACLs: ContractACLData[];
  adminsAndManagers: User[];
  currentUser?: {
    id: string;
    role?: number;
  };
  bulkContracts: {
    contractIds: number[];
    vendor: string;
    vendorDomain?: string;
    count: number;
    contracts?: Array<{
      id: number;
      vendor: string;
      vendorDomain?: string;
      product?: string;
      products?: SharingProduct[];
      uploadedBy?: SharingUser;
      type?: string;
    }>;
  };
  onRemoveUser?: (userId: string, contractId: number) => void;
  onRemoveGroup?: (groupId: number, contractId: number) => void;
  isUpdating?: boolean;
}

export function BulkContractAccessList({
  contractACLs,
  adminsAndManagers,
  currentUser,
  bulkContracts,
  onRemoveUser,
  onRemoveGroup,
  isUpdating = false,
}: BulkContractAccessListProps) {
  const ability = useAbility();
  const canManageGroups = ability.can('manage', 'Group');

  const vendorGroups: Record<string, VendorGroup> = {};

  bulkContracts.contracts?.forEach((contract) => {
    const vendorKey = contract.vendor;
    if (!vendorGroups[vendorKey]) {
      vendorGroups[vendorKey] = {
        vendor: contract.vendor,
        vendorDomain: contract.vendorDomain,
        contractIds: [],
        contracts: [],
      };
    }
    vendorGroups[vendorKey].contractIds.push(contract.id);
    vendorGroups[vendorKey].contracts.push(contract);
  });

  const vendors = Object.values(vendorGroups);

  // Track which vendors have loaded ACLs
  const [loadedVendorACLs, setLoadedVendorACLs] = useState<
    Record<string, ContractACLData[]>
  >({});
  const [loadingVendors, setLoadingVendors] = useState<Record<string, boolean>>(
    {},
  );

  const handleVendorExpand = async (vendorKey: string) => {
    // If already loaded, skip
    if (loadedVendorACLs[vendorKey]) return;

    // If already loading, skip
    if (loadingVendors[vendorKey]) return;

    const vendorGroup = vendorGroups[vendorKey];
    if (!vendorGroup) return;

    setLoadingVendors((prev) => ({ ...prev, [vendorKey]: true }));

    try {
      const bulkACLs = await fetchBulkContractACLs(vendorGroup.contractIds);

      // Convert to ContractACLData format and ensure uploader is included
      const aclsArray: ContractACLData[] = Object.entries(bulkACLs).map(
        ([contractId, acl]) => {
          const contractIdNum = parseInt(contractId);

          // Find the contract details to get uploader info
          const contractDetails = vendorGroup.contracts.find(
            (c) => c.id === contractIdNum,
          );

          // Normalize ACL and ensure uploader is included
          const normalizedACL = {
            users: acl.users.map((u) => ({
              ...u,
              perm: (u.perm || 'read') as 'read' | 'write' | 'admin',
              signedUp: u.signedUp,
            })),
            groups: acl.groups.map((g) => ({
              ...g,
              perm: (g.perm || 'read') as 'read' | 'write' | 'admin',
            })),
          };

          const aclWithUploader = ensureUploaderInACL(
            normalizedACL,
            contractDetails?.uploadedBy,
          );

          return {
            contractId: contractIdNum,
            users: aclWithUploader.users,
            groups: aclWithUploader.groups,
          };
        },
      );

      setLoadedVendorACLs((prev) => ({ ...prev, [vendorKey]: aclsArray }));
    } catch (error) {
      logger.error(
        { error, vendorKey, contractIds: vendorGroup.contractIds },
        'Failed to load vendor ACLs',
      );
    } finally {
      setLoadingVendors((prev) => ({ ...prev, [vendorKey]: false }));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="font-medium text-sm">Who has access</Label>
        {isUpdating && <Spinner className="size-3" />}
      </div>

      {/* Outer accordion: vendors */}
      <Accordion
        type="multiple"
        className="space-y-1.5"
        onValueChange={(values) => {
          // When a vendor is expanded, lazy load its ACLs
          values.forEach((vendorKey) => {
            handleVendorExpand(vendorKey);
          });
        }}
      >
        {vendors.map((vendorGroup) => {
          const vendorKey = vendorGroup.vendor;

          const serverACLs = loadedVendorACLs[vendorKey] || [];

          // Get optimistic ACLs for this vendor's contracts
          const optimisticACLsMap = new Map(
            contractACLs
              .filter((acl) => vendorGroup.contractIds.includes(acl.contractId))
              .map((acl) => [acl.contractId, acl]),
          );

          // Merge: server data takes precedence, but add optimistic additions not yet in server
          const finalACLs = serverACLs.map((serverACL) => {
            const optimisticACL = optimisticACLsMap.get(serverACL.contractId);
            if (!optimisticACL) return serverACL;

            // Merge users/groups: keep server data + add optimistic items not yet persisted
            const mergedUsers = [...serverACL.users];
            const mergedGroups = [...serverACL.groups];

            optimisticACL.users.forEach((optUser) => {
              if (!mergedUsers.some((u) => u.id === optUser.id)) {
                mergedUsers.push(optUser);
              }
            });

            optimisticACL.groups.forEach((optGroup) => {
              if (!mergedGroups.some((g) => g.id === optGroup.id)) {
                mergedGroups.push(optGroup);
              }
            });

            return {
              ...serverACL,
              users: mergedUsers,
              groups: mergedGroups,
            };
          });

          const isLoading = loadingVendors[vendorKey];

          return (
            <AccordionItem
              key={vendorKey}
              value={vendorKey}
              className="rounded-sm border"
            >
              <AccordionTrigger className="font-normal px-2 py-2 hover:no-underline">
                <div className="flex w-full items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <VendorIcon
                      name={vendorGroup.vendor}
                      domain={vendorGroup.vendorDomain}
                      width={24}
                      height={24}
                    />
                    <div className="font-medium">{vendorGroup.vendor}</div>
                  </div>
                  <span className="min-w-28 px-4 text-xs text-muted-foreground">
                    {vendorGroup.contracts.length}{' '}
                    {vendorGroup.contracts.length === 1
                      ? 'contract'
                      : 'contracts'}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="bg-muted px-2 pb-0">
                {isLoading ? (
                  <div
                    className="flex items-center justify-center py-4"
                    style={{
                      minHeight: `${vendorGroup.contracts.length * 40 + (vendorGroup.contracts.length - 1)}px`,
                    }}
                  >
                    <Spinner className="size-4" />
                  </div>
                ) : (
                  <Accordion
                    type="multiple"
                    className="divide-y divide-foreground/10"
                  >
                    {finalACLs.map((contractACL) => {
                      // Find contract details
                      const contractDetails = bulkContracts.contracts?.find(
                        (c) => c.id === contractACL.contractId,
                      );

                      // Determine product display
                      let productName = '';
                      if (contractDetails) {
                        if (
                          contractDetails.products &&
                          Array.isArray(contractDetails.products)
                        ) {
                          const productCount = contractDetails.products.length;
                          if (productCount > 0) {
                            productName =
                              contractDetails.products[0]?.vendor_products
                                ?.name || '';
                            if (productCount > 1) {
                              productName += '...';
                            }
                          }
                        } else if (contractDetails.product) {
                          productName = contractDetails.product;
                        }
                      }

                      const uploaderId = contractDetails?.uploadedBy?.id;
                      const filteredUsers = contractACL.users.filter(
                        (user) =>
                          !adminsAndManagers.some(
                            (admin) => admin.id === user.id,
                          ),
                      );
                      const totalAccessCount =
                        filteredUsers.length + contractACL.groups.length;

                      return (
                        <AccordionItem
                          key={contractACL.contractId}
                          value={contractACL.contractId.toString()}
                          className="border-0"
                        >
                          <AccordionTrigger className="font-normal ml-8 py-2 hover:no-underline">
                            <div className="flex flex-1 items-center justify-between gap-2 text-sm">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div className="font-medium flex-shrink-0 truncate text-left">
                                  {contractDetails?.vendor ||
                                    bulkContracts.vendor}
                                </div>
                                {productName && (
                                  <div className="min-w-0 flex-1 truncate text-wrap text-left">
                                    {productName}
                                  </div>
                                )}
                                {contractDetails?.type && (
                                  <ContractLabel
                                    name={contractDetails.type}
                                    shorten={true}
                                    size="xs"
                                  />
                                )}
                                <Badge
                                  variant={'secondary'}
                                  className="ml-2 mr-4 h-5 w-5 flex-shrink-0 items-center justify-center p-0 text-[0.7rem] leading-[normal]"
                                >
                                  {totalAccessCount}
                                </Badge>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="mb-2 ml-[26px] pb-0">
                            <div className="">
                              {/* Individual Users */}
                              {filteredUsers.length > 0 && (
                                <div className="space-y-0.5">
                                  {filteredUsers.map((user: SharingUser) => {
                                    const isUploader =
                                      uploaderId && user.id === uploaderId;
                                    const isCurrentUserManager =
                                      currentUser &&
                                      currentUser.id === user.id &&
                                      (currentUser.role ===
                                        userRoles.clientSupervisor ||
                                        currentUser.role ===
                                          userRoles.clientAdmin);

                                    const badges = isUploader
                                      ? [
                                          {
                                            label: 'Uploader',
                                            variant: 'outline' as const,
                                          },
                                        ]
                                      : [];

                                    return (
                                      <UserItem
                                        key={user.id}
                                        user={user}
                                        avatarSize="xs"
                                        className="text-[0.825rem]"
                                        variant="compact"
                                        badges={badges}
                                        onRemove={
                                          !isUploader &&
                                          !isCurrentUserManager &&
                                          onRemoveUser
                                            ? (userId) =>
                                                onRemoveUser(
                                                  userId,
                                                  contractACL.contractId,
                                                )
                                            : undefined
                                        }
                                      />
                                    );
                                  })}
                                </div>
                              )}

                              {/* Groups */}
                              {contractACL.groups.length > 0 && (
                                <div className="space-y-0.5">
                                  {contractACL.groups.map(
                                    (group: SharingGroup) => (
                                      <div
                                        key={group.id}
                                        className="relative px-1 text-[0.825rem]"
                                      >
                                        <GroupedAccessSection
                                          value={`group-${group.id}-${contractACL.contractId}`}
                                          icon={
                                            <Users
                                              className="h-4 w-4"
                                              strokeWidth={1.5}
                                            />
                                          }
                                          title={group.name}
                                          users={group.members || []}
                                          className="w-full py-1 pr-8 text-[0.825rem] hover:bg-hover [&>svg]:hidden"
                                        />
                                        {onRemoveGroup && canManageGroups && (
                                          <div className="absolute right-1 top-1">
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-6 w-6"
                                                >
                                                  <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                  className="text-destructive"
                                                  onClick={() =>
                                                    onRemoveGroup(
                                                      group.id,
                                                      contractACL.contractId,
                                                    )
                                                  }
                                                >
                                                  Remove Access
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </div>
                                        )}
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
