'use client';

import { Button } from '@/components/ui/button';
import { useSharingDialog } from '@/app/(app)/SharingDialogContext';
import { useAbility } from '@/components/providers/AbilityProvider';

interface ShareButtonProps {
  folderId: number;
  folderPublicUuid: string;
  folderName: string;
  folderOwnerId?: string;
}

export function ShareButton({
  folderId,
  folderPublicUuid,
  folderName,
  folderOwnerId,
}: ShareButtonProps) {
  const { openSharingDialog } = useSharingDialog();
  const ability = useAbility();
  const canManageFolders = ability.can('manage', 'Folder');

  return (
    <div className="absolute right-6 top-14 z-20 flex h-20 items-center">
      <Button
        size="sm"
        onClick={() =>
          openSharingDialog({
            itemId: folderPublicUuid,
            itemType: 'folder',
            folderName,
            folderId,
            folderOwnerId,
            folderACLs: [],
          })
        }
        className="gap-1"
        disabled={!canManageFolders}
      >
        Share
      </Button>
    </div>
  );
}
