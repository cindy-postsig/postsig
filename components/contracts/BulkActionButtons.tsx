'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Row } from '@tanstack/react-table';
import { type ContractTableRow } from '@/lib/v2/core/types';
import { type ActionType } from '@/app/lib/definitions';

interface Folder {
  id: number;
  name: string;
}

interface BulkActionButtonsProps {
  selectedRows: Row<ContractTableRow>[];
  actionTypes: ActionType[];
  canManageFolder: boolean;
  folders: Folder[];
  onAction: (action: string) => void;
  onShareClick: () => void;
  onCreateFolderClick: () => void;
}

export function BulkActionButtons({
  selectedRows,
  actionTypes,
  canManageFolder,
  folders,
  onAction,
  onShareClick,
  onCreateFolderClick,
}: BulkActionButtonsProps) {
  const selectedCount = selectedRows.length;

  if (selectedCount === 0 || actionTypes.includes('none')) {
    return null;
  }

  return (
    <>
      {actionTypes.includes('bulkEdit') && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant={'outline'}>
              Update Status ({selectedCount})
              <ChevronDownIcon className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onAction('active')}>
              Active
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction('inactive')}>
              Inactive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {actionTypes.includes('folder') && canManageFolder && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant={'accent'} className="!pl-3">
              Add to Folder ({selectedCount})
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                onSelect={() => onAction(`folder:${folder.id}`)}
              >
                {folder.name}
              </DropdownMenuItem>
            ))}
            {folders.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={onCreateFolderClick}>
              <PlusIcon className="h-4 w-4" />
              Create New Folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {actionTypes.includes('share') && (
        <Button size="sm" variant={'accent'} onClick={onShareClick}>
          Share ({selectedCount})
        </Button>
      )}

      {actionTypes
        .filter(
          (type) =>
            ![
              'bulkEdit',
              'folder',
              'share',
              'tags',
              'renewalType',
              'confirmIct',
              'notIct',
              'addIct',
              'export',
              'none',
            ].includes(type),
        )
        .map((type) => (
          <Button
            key={type}
            size="sm"
            variant={'outline'}
            onClick={() => onAction(type)}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)} ({selectedCount})
          </Button>
        ))}
    </>
  );
}
