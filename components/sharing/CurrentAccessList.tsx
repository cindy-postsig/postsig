'use client';

import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { UserItem } from './UserItem';
import { type PermissionLevel } from '@/app/lib/sharing/actions';
import { userRoles } from '@/constants/data';
import { useAbility } from '@/components/providers/AbilityProvider';

interface UserWithPerm {
  id: string;
  name: string;
  email?: string;
  perm: PermissionLevel;
  role?: number;
  signedUp?: boolean;
}

interface Admin {
  id: string;
}

interface CurrentAccessListProps {
  currentUsers: UserWithPerm[];
  itemType: 'folder' | 'contract';
  uploaderId?: string;
  folderOwnerId?: string;
  currentUser?: {
    id: string;
    role?: number;
  };
  adminsAndManagers?: Admin[];
  onRemoveUser: (userId: string) => void;
  isLoadingACL?: boolean;
}

export function CurrentAccessList({
  currentUsers,
  itemType,
  uploaderId,
  folderOwnerId,
  currentUser,
  adminsAndManagers = [],
  onRemoveUser,
  isLoadingACL = false,
}: CurrentAccessListProps) {
  const ability = useAbility();
  const canManageFolders = ability.can('manage', 'Folder');

  const filteredUsers = currentUsers.filter(
    (user) => !adminsAndManagers.some((admin) => admin.id === user.id),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-1">
      <div className="flex items-center gap-2">
        <Label className="font-medium text-sm">Who has access</Label>
        {isLoadingACL && <Spinner className="size-3" />}
      </div>

      <div className="divide-y">
        {filteredUsers.map((user) => {
          const isUploader = itemType === 'contract' && uploaderId === user.id;
          const isOwner = itemType === 'folder' && folderOwnerId === user.id;
          const isCurrentUserManager =
            currentUser &&
            currentUser.id === user.id &&
            (currentUser.role === userRoles.clientSupervisor ||
              currentUser.role === userRoles.clientAdmin);
          const isSpecialUser = isUploader || isOwner || isCurrentUserManager;
          const badges = [];
          if (isUploader) {
            badges.push({ label: 'Uploader', variant: 'outline' as const });
          }
          if (isOwner) {
            badges.push({ label: 'Owner', variant: 'outline' as const });
          }

          const canRemove =
            !isSpecialUser && (itemType === 'contract' || canManageFolders);

          return (
            <UserItem
              key={user.id}
              user={user}
              badges={badges}
              onRemove={canRemove ? onRemoveUser : undefined}
              avatarSize="sm"
            />
          );
        })}
      </div>
    </div>
  );
}
