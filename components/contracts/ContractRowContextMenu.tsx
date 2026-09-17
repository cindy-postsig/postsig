'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuPortal,
} from '@/components/ui/context-menu';
import {
  UserPlus,
  FolderPlus,
  FolderEdit,
  Folder,
  FolderMinus,
} from 'lucide-react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { CheckIcon, MinusCircledIcon } from '@radix-ui/react-icons';
import { cn } from '@/lib/utils';
import { useAbility } from '@/components/providers/AbilityProvider';
import { useFolderAssignment } from '@/hooks/useFolderAssignment';

interface Folder {
  id: number;
  name: string;
  path?: string;
  public_uuid?: string;
}

interface ContractRowContextMenuProps {
  children: React.ReactNode;
  row: any;
  folders: Folder[];
  onShareClick: () => void;
}

export function ContractRowContextMenu({
  children,
  row,
  folders,
  onShareClick,
}: ContractRowContextMenuProps) {
  const router = useRouter();
  const ability = useAbility();
  const canManageFolder = ability.can('manage', 'Folder');
  const canShareContract = ability.can('share', 'Contract');
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);
  const { assignToFolder } = useFolderAssignment();

  // If user has no permissions for any context menu actions, don't show the menu
  const hasAnyPermission = canShareContract || canManageFolder;
  if (!hasAnyPermission) {
    return <>{children}</>;
  }

  // Folder management logic
  const isGroupedRow =
    row.original.isGroup &&
    row.original.subRows &&
    row.original.subRows.length > 0;
  let groupFolderStatus: 'single' | 'multiple' | 'none' = 'none';
  let groupFolderId: number | null = null;

  if (isGroupedRow && row.original.subRows) {
    const folderIds = row.original.subRows
      .map((subRow: any) => subRow.folderId)
      .filter((id: any) => id !== null && id !== undefined);
    const uniqueFolderIds = Array.from(new Set(folderIds));

    if (uniqueFolderIds.length === 0) {
      groupFolderStatus = 'none';
    } else if (uniqueFolderIds.length === 1) {
      groupFolderStatus = 'single';
      groupFolderId = uniqueFolderIds[0] as number;
    } else {
      groupFolderStatus = 'multiple';
    }
  }

  const currentFolderId = isGroupedRow ? groupFolderId : row.original.folderId;
  const currentFolderObj = currentFolderId
    ? folders.find((f) => f.id === currentFolderId)
    : null;

  const isInFolder = Boolean(currentFolderObj);

  const handleFolderAssignment = async (folderId: number | null) => {
    // Get contract IDs to assign
    const contractIds =
      isGroupedRow && row.original.subRows
        ? row.original.subRows.map((subRow: any) => Number(subRow.id))
        : [Number(row.original.id)];

    // Use the hook which handles error handling, toasts, and router refresh
    await assignToFolder(contractIds, folderId);
  };

  const folderMenuLabel = isGroupedRow
    ? groupFolderStatus === 'single' && currentFolderObj
      ? 'Update Folder'
      : groupFolderStatus === 'multiple'
        ? 'Update Folder'
        : 'Add to Folder'
    : currentFolderObj
      ? 'Update Folder'
      : 'Add to Folder';

  const folderMenuIcon = isGroupedRow
    ? groupFolderStatus === 'none'
      ? FolderPlus
      : FolderEdit
    : currentFolderObj
      ? FolderEdit
      : FolderPlus;

  const FolderMenuIcon = folderMenuIcon;

  return (
    <ContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild>
        {React.cloneElement(
          children as React.ReactElement<{ className?: string }>,
          {
            className: cn(
              (children as React.ReactElement<{ className?: string }>).props
                .className,
              isContextMenuOpen && 'bg-primary/7',
            ),
          },
        )}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {canShareContract && (
          <ContextMenuItem onClick={onShareClick} className="text-[0.825rem]">
            <UserPlus strokeWidth={1.5} className="mr-2 h-4 w-4" />
            Share {isGroupedRow ? 'Contracts' : 'Contract'}
          </ContextMenuItem>
        )}

        {canShareContract && canManageFolder && <ContextMenuSeparator />}

        {canManageFolder && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger
                disabled={groupFolderStatus === 'multiple'}
                className={cn(
                  'text-[0.825rem]',
                  groupFolderStatus === 'multiple' &&
                    'cursor-not-allowed opacity-50',
                )}
              >
                <FolderMenuIcon strokeWidth={1.5} className="mr-2 h-4 w-4" />
                {folderMenuLabel}
              </ContextMenuSubTrigger>
              <ContextMenuPortal>
                <ContextMenuSubContent className="w-56">
                  {folders.length > 0 ? (
                    folders.map((folder) => (
                      <ContextMenuItem
                        key={folder.id}
                        onClick={() => handleFolderAssignment(folder.id)}
                        className="min-h-8 text-[0.825rem] leading-4"
                      >
                        <Folder
                          strokeWidth={1.5}
                          className="mr-2 h-4 w-4 text-muted-foreground"
                        />
                        <span className="flex-1">{folder.name}</span>
                        {folder.id === currentFolderId && (
                          <CheckIcon className="ml-2 h-4 w-4" />
                        )}
                      </ContextMenuItem>
                    ))
                  ) : (
                    <ContextMenuItem
                      onClick={() => router.push('/settings/folders')}
                      className="min-h-8 text-[0.825rem] leading-4"
                    >
                      <PlusIcon className="mr-2 h-4 w-4" />
                      <span className="flex-1">Create New Folder</span>
                    </ContextMenuItem>
                  )}
                </ContextMenuSubContent>
              </ContextMenuPortal>
            </ContextMenuSub>
          </>
        )}

        {/* Show "Remove from Folder" below Update Folder submenu */}
        {canManageFolder && isInFolder && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => handleFolderAssignment(null)}
              className="text-[0.825rem]"
            >
              <FolderMinus strokeWidth={1.5} className="mr-2 h-4 w-4" />
              Remove from Folder
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
