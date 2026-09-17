'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Users } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { createFolder } from '@/data/superuser/folders';
import { useRouter } from 'next/navigation';
import logger from '@/utils/pino';
import { useFolderContext } from '@/app/(app)/(cpm)/contracts/(views)/FolderContext';
import {
  updateFolderACL,
  type User,
  type Group,
} from '@/app/lib/sharing/actions';
import { UserItem } from '@/components/sharing/UserItem';
import { UserGroupSearchPicker } from '@/components/sharing/UserGroupSearchPicker';
import { GroupedAccessSection } from '@/components/sharing/GroupedAccessSection';
import { useSharingDialog } from '@/app/(app)/SharingDialogContext';
import { createOrganizationUser } from '@/app/lib/actions/organization-users';
import { MODULE_IDS } from '@/lib/settings/config';
import { useToast } from '@/components/ui/use-toast';

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFolderCreated?: (
    folderId: string,
    folderName: string,
    folderSlug: string,
  ) => void;
  description?: string;
  organizationId: string;
  userId: string;
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  onFolderCreated,
  description = '',
  organizationId,
  userId,
}: CreateFolderDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { folders, addFolder } = useFolderContext();
  const { orgData, isLoadingOrgData } = useSharingDialog();

  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);

  const availableUsers = orgData?.allUsers || [];
  const availableGroups = orgData?.groups || [];
  const adminsAndManagers = orgData?.adminsAndManagers || [];
  const organizationName = orgData?.organizationName || '';
  const isLoadingUsers = isLoadingOrgData;

  const handleAddUser = (user: User) => {
    setSelectedUsers((prev) => [...prev, user]);
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleAddGroup = (group: Group) => {
    setSelectedGroups((prev) => [...prev, group]);
  };

  const handleRemoveGroup = (groupId: number) => {
    setSelectedGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const handleInviteUser = async (email: string) => {
    try {
      const result = await createOrganizationUser({
        email,
        appRole: 'Viewer',
        moduleId: MODULE_IDS.cpm,
      });

      const newUser: User = {
        id: result.userId,
        name: email,
        email,
        perm: 'read',
      };

      setSelectedUsers((prev) => [...prev, newUser]);

      toast({
        title: 'Invitation sent',
        description: `${email} has been invited and added to the folder`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to invite user',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      });
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    // Check for duplicate folder name (case-insensitive)
    const duplicateFolder = folders.find(
      (folder) =>
        folder.name.toLowerCase() === newFolderName.trim().toLowerCase(),
    );

    if (duplicateFolder) {
      setError(
        'A folder with this name already exists. Please choose a different name.',
      );
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Create folder via server action
      const folder = await createFolder({
        name: newFolderName.trim(),
      });

      logger.info(
        { folderId: folder.id, name: folder.name, path: folder.path },
        'Folder created',
      );

      // If users or groups were selected, add them to the folder ACL
      if (selectedUsers.length > 0 || selectedGroups.length > 0) {
        try {
          await updateFolderACL(folder.id, {
            addUsers: selectedUsers.map((user) => ({
              userId: user.id,
              perm: 'read' as const,
              role: user.role,
            })),
            addGroups: selectedGroups.map((group) => ({
              groupId: group.id,
              perm: 'read' as const,
            })),
          });
          logger.info(
            {
              folderId: folder.id,
              userCount: selectedUsers.length,
              groupCount: selectedGroups.length,
            },
            'Folder ACL updated',
          );
        } catch (aclError) {
          logger.error(
            { error: aclError, folderId: folder.id },
            'Error updating folder ACL',
          );
          // Don't fail the whole operation if ACL update fails
        }
      }

      // Optimistically add folder to context for instant UI update
      addFolder(folder);

      // Reset form and close dialog
      setNewFolderName('');
      setSelectedUsers([]);
      setSelectedGroups([]);
      onOpenChange(false);

      if (onFolderCreated) {
        onFolderCreated(String(folder.id), folder.name, folder.path);
      }
    } catch (error) {
      logger.error({ error }, 'Error creating folder');
      setError('Failed to create folder. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDialogOpenChange = (isOpen: boolean) => {
    // Reset form when dialog closes
    if (!isOpen) {
      setNewFolderName('');
      setSelectedUsers([]);
      setSelectedGroups([]);
      setError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="flex max-w-xl flex-col gap-0"
        onContextMenu={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <Separator className="mt-6" />

        <div className="-mx-2 pt-6">
          <div className="flex flex-col space-y-6 px-2">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
            {/* Folder Name */}
            <div className="space-y-2">
              <Label className="font-medium text-sm">Folder name</Label>
              <Input
                placeholder="Enter folder name"
                className="h-10 text-sm"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateFolder();
                  }
                }}
              />
            </div>

            {/* Add People */}
            <UserGroupSearchPicker
              availableUsers={availableUsers}
              availableGroups={availableGroups}
              currentUsers={selectedUsers}
              currentGroups={selectedGroups}
              adminsAndManagers={adminsAndManagers}
              isLoadingOrgData={isLoadingUsers}
              onAddUser={handleAddUser}
              onAddGroup={handleAddGroup}
              onInviteUser={handleInviteUser}
            />

            {/* Who will have access */}
            <div className="space-y-2">
              <Label className="font-medium text-sm">
                Who will have access
              </Label>
              <div className="divide-y rounded-sm border">
                {isLoadingUsers ? (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      Loading access list...
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Selected Groups */}
                    {selectedGroups.map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center justify-between p-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center">
                            <Users className="h-4 w-4" strokeWidth={1.5} />
                          </div>
                          <div className="text-sm">
                            <span>{group.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {group.memberCount || 0} members
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => handleRemoveGroup(group.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}

                    {/* Selected Users */}
                    {selectedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-2"
                      >
                        <UserItem user={user} variant="search" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => handleRemoveUser(user.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}

                    {/* Role-Based Access (Admins) */}
                    <GroupedAccessSection
                      value="admins-managers"
                      icon={<Users className="h-4 w-4" strokeWidth={1.5} />}
                      title={
                        <span className="space-x-2">
                          <span className="font-medium">
                            {organizationName}
                          </span>
                          <span className="text-muted-foreground">Admins</span>
                        </span>
                      }
                      users={adminsAndManagers}
                      helpText="Admins have access by default"
                      className="w-full px-2"
                    />

                    {selectedUsers.length === 0 &&
                      selectedGroups.length === 0 &&
                      adminsAndManagers.length === 0 && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          No one will have access yet.
                        </p>
                      )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim() || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create Folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
