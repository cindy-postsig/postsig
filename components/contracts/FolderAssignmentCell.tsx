'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FolderIcon,
  PlusIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { assignContractToFolder } from '@/data/superuser/folders';
import { useFolderContext } from '@/app/(app)/(cpm)/contracts/(views)/FolderContext';
import { cn } from '@/lib/utils';
import { MinusCircledIcon, CheckIcon } from '@radix-ui/react-icons';
import { useAbility } from '@/components/providers/AbilityProvider';
import { toast } from '@/components/ui/use-toast';
import { Table } from '@tanstack/react-table';
import { type ContractTableRow } from '@/lib/v2/core/types';
import logger from '@/utils/pino';

// Import the table meta type from ContractsTableClient
interface ContractsTableMeta {
  groupByVendor?: boolean;
  includeReportSubRows?: boolean;
  isVendorsPage?: boolean;
  userMetadata?: any;
  reportType?: string;
  compact?: boolean;
  onCreateFolderRequest: (contractIds: number[]) => void;
}

interface FolderAssignmentCellProps {
  contract: any; // TODO: Create proper type for contract with subRows
  table: Table<ContractTableRow>;
}

/**
 * Extracts contract IDs from a contract (which may be grouped with subRows)
 * Handles both string and number IDs, and uses contract_id field for actual database IDs
 */
function getContractIds(contract: any): number[] {
  if (contract.subRows?.length > 0) {
    return contract.subRows
      .map((subRow: any) => {
        // Use contract_id for actual database ID, fallback to id
        const id = subRow.contract_id ?? subRow.id;
        return typeof id === 'string' ? parseInt(id, 10) : id;
      })
      .filter((id: any): id is number => typeof id === 'number' && !isNaN(id));
  }

  // Use contract_id for actual database ID, fallback to id
  const id = contract.contract_id ?? contract.id;
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
  return typeof numericId === 'number' && !isNaN(numericId) ? [numericId] : [];
}

/**
 * Read-only folder display (no interaction)
 */
function ReadOnlyFolderDisplay({ folderName }: { folderName: string }) {
  return (
    <div className="font-normal -mx-1 flex h-auto items-center gap-1.5 px-1 py-0.5 font-sans text-[0.825rem]">
      <FolderIcon className="h-4 w-4 flex-shrink-0" />
      <span className="max-w-32 truncate pt-0.5">{folderName}</span>
    </div>
  );
}

/**
 * Folder assignment dropdown (with assignment options)
 */
function FolderAssignmentDropdown({
  folderName,
  currentFolderId,
  folders,
  onAssign,
  onCreate,
}: {
  folderName: string;
  currentFolderId: number | null;
  folders: Array<{ id: number; name: string }>;
  onAssign: (folderId: number | null) => void;
  onCreate: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="font-normal -mx-1 h-auto gap-1.5 px-1 py-0.5 font-sans text-[0.825rem]"
          onClick={(e) => e.stopPropagation()}
        >
          <FolderIcon className="h-3 w-3" />
          <span className="max-w-32 truncate pt-0.5">{folderName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => onAssign(null)}
          className="text-[0.825rem]"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <MinusCircledIcon className="h-4 w-4" />
            {folderName === 'Multiple'
              ? 'Remove from All Folders'
              : 'Remove from Folder'}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {folders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            onClick={() => onAssign(folder.id)}
            className="min-h-8 items-start text-[0.825rem] leading-4"
          >
            <div className="flex h-[1lh] w-4 items-center">
              {folder.id === currentFolderId && (
                <CheckIcon className="h-4 w-4" />
              )}
            </div>
            {folder.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreate} className="text-[0.825rem]">
          <PlusIcon className="h-4 w-4" />
          Create New Folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FolderAssignmentCell({
  contract,
  table,
}: FolderAssignmentCellProps) {
  const router = useRouter();
  const { folders } = useFolderContext();
  const ability = useAbility();
  const canManageFolder = ability.can('manage', 'Folder');

  // Get the create folder callback from table meta (type-safe)
  const onCreateFolderRequest = (
    table.options.meta as ContractsTableMeta | undefined
  )?.onCreateFolderRequest;

  // Use folderId from contract data (comes from processing.ts)
  const [currentFolder, setCurrentFolder] = useState<number | null>(
    contract.folderId || null,
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Update currentFolder when contract.folderId changes
  useEffect(() => {
    setCurrentFolder(contract.folderId || null);
  }, [contract.folderId]);

  const currentFolderObj = currentFolder
    ? folders.find((f) => f.id === currentFolder)
    : null;

  const isGroupedRow = contract.subRows && contract.subRows.length > 0;

  let groupFolderStatus: 'single' | 'multiple' | 'none' = 'none';
  let groupFolderId: number | null = null;

  if (isGroupedRow) {
    const folderIds = contract.subRows
      .map((subRow: any) => subRow.folderId)
      .filter(
        (id: any): id is number =>
          id !== null && id !== undefined && typeof id === 'number',
      );

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

  const handleFolderAssignment = async (folderId: number | null) => {
    if (isPending) return;

    const previousFolder = currentFolder;
    setCurrentFolder(folderId);

    startTransition(async () => {
      try {
        const contractIds = getContractIds(contract);
        const contractCount = contractIds.length;

        // Assign all contracts to the folder
        for (const contractId of contractIds) {
          await assignContractToFolder(contractId, folderId);
        }

        // Show success toast
        const folderName = folderId
          ? folders.find((f) => f.id === folderId)?.name
          : null;

        if (folderId && folderName) {
          toast({
            title: 'Contract Added to Folder',
            description: `Successfully added ${contractCount} contract${contractCount > 1 ? 's' : ''} to ${folderName}.`,
          });
        } else {
          toast({
            title: 'Contract Removed from Folder',
            description: `Successfully removed ${contractCount} contract${contractCount > 1 ? 's' : ''} from folder.`,
          });
        }

        router.refresh();
      } catch (error) {
        logger.error(
          { error, folderId, contractIds: getContractIds(contract) },
          'Error assigning contract(s) to folder',
        );
        setCurrentFolder(previousFolder);
        toast({
          title: 'Error',
          description: 'Failed to update folder assignment',
          variant: 'destructive',
        });
      }
    });
  };

  const handleCreateFolderClick = () => {
    const contractIds = getContractIds(contract);

    // Call the callback from table meta
    if (onCreateFolderRequest) {
      onCreateFolderRequest(contractIds);
    }
  };

  // Handle grouped rows
  if (isGroupedRow) {
    if (groupFolderStatus === 'single' && groupFolderId) {
      const folderObj = folders.find((f) => f.id === groupFolderId);
      if (folderObj) {
        if (!canManageFolder) {
          return <ReadOnlyFolderDisplay folderName={folderObj.name} />;
        }

        return (
          <FolderAssignmentDropdown
            folderName={folderObj.name}
            currentFolderId={groupFolderId}
            folders={folders}
            onAssign={handleFolderAssignment}
            onCreate={handleCreateFolderClick}
          />
        );
      }
    } else if (groupFolderStatus === 'multiple') {
      if (!canManageFolder) {
        return <ReadOnlyFolderDisplay folderName="Multiple" />;
      }

      return (
        <FolderAssignmentDropdown
          folderName="Multiple"
          currentFolderId={null}
          folders={folders}
          onAssign={handleFolderAssignment}
          onCreate={handleCreateFolderClick}
        />
      );
    }
    // If groupFolderStatus === 'none', fall through to show "Add to Folder" button
  }

  // If contract is already in a folder, show the folder name
  if (currentFolderObj) {
    // If user can't manage folders, just show the folder name without interactivity
    if (!canManageFolder) {
      return <ReadOnlyFolderDisplay folderName={currentFolderObj.name} />;
    }

    return (
      <FolderAssignmentDropdown
        folderName={currentFolderObj.name}
        currentFolderId={currentFolder}
        folders={folders}
        onAssign={handleFolderAssignment}
        onCreate={handleCreateFolderClick}
      />
    );
  }

  // If contract is not in a folder, show assignment dropdown on hover (only for users with permissions)
  if (!canManageFolder) {
    return null; // Don't show anything if user can't manage folders
  }

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'group h-auto gap-1 px-1 py-1 pr-2 text-xs text-muted-foreground transition-opacity hover:bg-accent hover:text-accent-foreground',
              isDropdownOpen
                ? 'opacity-100'
                : 'opacity-0 group-hover/row:opacity-100',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <PlusIcon className="h-3 w-3" />
            <span>Add to Folder</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {folders.map((folder) => (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => handleFolderAssignment(folder.id)}
              className="min-h-8 items-start text-[0.825rem] leading-4"
            >
              <div className="flex h-[1lh] w-4 items-center">
                <FolderIcon className="h-4 w-4 opacity-0" />
              </div>
              {folder.name}
            </DropdownMenuItem>
          ))}
          {folders.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onClick={handleCreateFolderClick}
            className="text-[0.825rem]"
          >
            <PlusIcon className="h-4 w-4" />
            Create new folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
