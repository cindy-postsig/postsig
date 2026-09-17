'use client';

import { FolderIcon } from '@heroicons/react/24/outline';
import { Users, MoreHorizontal } from 'lucide-react';
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
import { UserItem } from './UserItem';
import { type User } from '@/app/lib/sharing/actions';
import {
  type FolderACLData,
  type SharingUser,
  type SharingGroup,
  type GroupMember,
} from '@/types/sharing';
import { useAbility } from '@/components/providers/AbilityProvider';

interface InheritedAccessSectionProps {
  itemType: 'folder' | 'contract';
  folderACLs: FolderACLData[];
  adminsAndManagers: User[];
  onRemoveUserFromFolder?: (userId: string, folderId: number) => void;
  onRemoveGroupFromFolder?: (groupId: number, folderId: number) => void;
}

export function InheritedAccessSection({
  itemType,
  folderACLs,
  adminsAndManagers,
  onRemoveUserFromFolder,
  onRemoveGroupFromFolder,
}: InheritedAccessSectionProps) {
  const ability = useAbility();
  const canManageFolders = ability.can('manage', 'Folder');

  if (itemType !== 'contract' || !folderACLs || folderACLs.length === 0) {
    return null;
  }

  return (
    <>
      {folderACLs.map((folderACL) => {
        const folderUsers = folderACL.acl.users.filter(
          (user: SharingUser) =>
            !adminsAndManagers.some((admin) => admin.id === user.id),
        );
        const folderGroups = folderACL.acl.groups || [];
        const totalCount = folderUsers.length + folderGroups.length;

        if (totalCount === 0) return null;

        return (
          <Accordion type="multiple" key={folderACL.folderId}>
            <AccordionItem
              value={`folder-${folderACL.folderId}`}
              className="border-0"
            >
              <AccordionTrigger className="font-normal py-2 pr-2 hover:no-underline">
                <div className="flex flex-1 items-center gap-2">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
                    <FolderIcon className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span>
                      <span>People with access to </span>
                      <span className="font-medium">
                        {folderACL.folderName}
                      </span>
                    </span>
                    <Badge
                      variant="secondary"
                      className="h-5 w-5 items-center justify-center p-0 text-[0.7rem] leading-[normal]"
                    >
                      {totalCount}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <div className="mb-2 ml-6 space-y-0.5">
                  {/* Individual users */}
                  {folderUsers.map((user: SharingUser) => (
                    <UserItem
                      key={user.id}
                      user={user}
                      avatarSize="xs"
                      className="text-[0.825rem]"
                      variant="compact"
                      onRemove={
                        onRemoveUserFromFolder && canManageFolders
                          ? () =>
                              onRemoveUserFromFolder(
                                user.id,
                                folderACL.folderId,
                              )
                          : undefined
                      }
                    />
                  ))}

                  {/* Groups */}
                  {folderGroups.map((group: SharingGroup) => (
                    <Accordion type="multiple" key={group.id}>
                      <AccordionItem
                        value={`folder-${folderACL.folderId}-group-${group.id}`}
                        className="border-0"
                      >
                        <div className="relative">
                          <AccordionTrigger className="font-normal px-1.5 py-1.5 pr-8 hover:bg-hover hover:no-underline [&>svg]:hidden">
                            <div className="flex flex-1 items-center gap-2">
                              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                                <Users className="h-4 w-4" strokeWidth={1.5} />
                              </div>
                              <div className="flex items-center gap-2 text-[0.825rem]">
                                <span>{group.name}</span>
                                <Badge
                                  variant="secondary"
                                  className="h-5 w-5 items-center justify-center p-0 text-[0.7rem] leading-[normal]"
                                >
                                  {group.memberCount ||
                                    group.members?.length ||
                                    0}
                                </Badge>
                              </div>
                            </div>
                          </AccordionTrigger>
                          {onRemoveGroupFromFolder && canManageFolders && (
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
                                      onRemoveGroupFromFolder(
                                        group.id,
                                        folderACL.folderId,
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
                        <AccordionContent className="pb-0">
                          <div className="mb-2 ml-6 space-y-0.5">
                            {(group.members || []).map(
                              (member: GroupMember) => (
                                <UserItem
                                  key={member.id}
                                  user={member}
                                  avatarSize="xs"
                                  className="text-[0.825rem]"
                                  variant="compact"
                                />
                              ),
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        );
      })}
    </>
  );
}
