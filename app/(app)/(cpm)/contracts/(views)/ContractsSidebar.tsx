'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Folder,
  FileText,
  Plus,
  Receipt,
  ClockFading,
  FileLock2,
} from 'lucide-react';
import {
  ReaderIcon,
  ClockIcon,
  CircleBackslashIcon,
  TokensIcon,
  BackpackIcon,
  LayersIcon,
} from '@radix-ui/react-icons';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useTransition } from 'react';
import { CreateFolderDialog } from '@/components/contracts/CreateFolderDialog';
import { cn } from '@/lib/utils';
import {
  getAllFolders,
  assignContractToFolder,
} from '@/data/superuser/folders';
import { ArchiveIcon } from '@/components/icons/ArchiveIcon';
import { useFolderContext } from './FolderContext';
import { FolderIcon } from '@heroicons/react/24/outline';
import { SYSTEM_TYPE_FOLDERS } from './systemFolderConfig';
import { toast } from '@/components/ui/use-toast';
import logger from '@/utils/pino';
import { useAbility } from '@/components/providers/AbilityProvider';

interface FolderItem {
  label: string;
  href: string;
  icon?:
    | 'folder'
    | 'reader'
    | 'archive'
    | 'clock'
    | 'layers'
    | 'Receipt'
    | 'ClockFading'
    | 'FileLock2';
  isSystemFolder?: boolean;
  folderId?: string | null;
  count?: number;
}

interface ContractsSidebarProps {
  organizationId: string;
  userId: string;
  initialFolders: Array<{
    id: number;
    name: string;
    path: string;
    public_uuid: string;
  }>;
  contractCounts: {
    trials: number;
    ndas: number;
    total: number;
  };
}

const ContractsSidebar = ({
  organizationId,
  userId,
  initialFolders,
  contractCounts,
}: ContractsSidebarProps) => {
  const pathname = usePathname();
  const { folders } = useFolderContext();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const ability = useAbility();

  const userFolders: FolderItem[] = folders.map((folder) => ({
    label: folder.name,
    href: `/contracts/folder/${folder.public_uuid}`,
    icon: 'folder' as const,
    folderId: folder.public_uuid,
  }));

  const systemFolders: FolderItem[] = [
    {
      label: 'All Contracts',
      href: '/contracts',
      icon: 'reader' as const,
      folderId: null,
      count: contractCounts.total,
    },
    {
      label: 'Pending',
      href: '/contracts/pending',
      icon: 'clock' as const,
      folderId: null,
      // count: undefined, // TODO: add pending count if needed
    },
    {
      label: 'Archived',
      href: '/contracts/archived',
      icon: 'archive' as const,
      folderId: null,
      // count: undefined, // TODO: add archived count if needed
    },
  ];

  // Always show system type folders with counts.
  const systemTypeFolders: FolderItem[] = SYSTEM_TYPE_FOLDERS.map((config) => {
    // Map typeId to the corresponding count
    const count =
      config.typeId === 7
        ? contractCounts.trials
        : config.typeId === 8
          ? contractCounts.ndas
          : 0;

    const params = config.defaultSearchParams
      ? `?${new URLSearchParams(config.defaultSearchParams).toString()}`
      : '';

    return {
      label: config.label,
      href: `${config.href}${params}`,
      icon: config.icon as FolderItem['icon'],
      folderId: null,
      isSystemFolder: true,
      count,
    };
  }).sort((a, b) => a.label.localeCompare(b.label));

  const sortedUserFolders = [...userFolders].sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  const sortedSystemTypeFolders = [...systemTypeFolders].sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  const handleFolderCreated = (
    folderId: string,
    folderName: string,
    folderSlug: string,
  ) => {
    // No need to update state here - router.refresh() will update the context
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-56 border-r border-border px-2 3xl:w-64">
      <nav className="sticky top-14 space-y-0.5 pt-4">
        {/* System Folders */}
        {systemFolders.map((folder) => {
          const isActive = pathname === folder.href;

          return (
            <DroppableFolder
              key={folder.href}
              folder={folder}
              isActive={isActive}
            />
          );
        })}

        {/* New Folder Button */}
        <Separator className="!my-2" />
        <Button
          variant="ghost"
          size="sm"
          className="!my-0 h-9 w-full justify-start gap-2 px-3 text-sm"
          onClick={() => setIsCreateDialogOpen(true)}
          disabled={!ability.can('manage', 'Folder')}
        >
          <Plus className="h-4 w-4" />
          New Folder
        </Button>

        {/* System Type Folders (Invoices, Trials, NDAs) */}
        {sortedSystemTypeFolders.length > 0 && <Separator className="!my-2" />}
        {sortedSystemTypeFolders.map((folder) => {
          const folderPath = folder.href.split('?')[0];
          const isActive = pathname === folderPath;

          return (
            <DroppableFolder
              key={folder.href}
              folder={folder}
              isActive={isActive}
            />
          );
        })}

        {/* User Created Folders */}
        {sortedUserFolders.length > 0 && <Separator className="!my-2" />}
        {sortedUserFolders.map((folder) => {
          const isActive = pathname === folder.href;

          return (
            <DroppableFolder
              key={folder.href}
              folder={folder}
              isActive={isActive}
            />
          );
        })}
      </nav>

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onFolderCreated={handleFolderCreated}
        organizationId={organizationId}
        userId={userId}
      />
    </div>
  );
};

export default ContractsSidebar;

// DroppableFolder component for sidebar folders
function DroppableFolder({
  folder,
  isActive,
}: {
  folder: FolderItem;
  isActive: boolean;
}) {
  const router = useRouter();
  const { folders } = useFolderContext();
  const [isOver, setIsOver] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDragOver = (e: React.DragEvent) => {
    // Don't allow dropping on system folders
    if (!folder.folderId) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    // Don't allow dropping on system folders
    if (!folder.folderId) {
      return;
    }

    if (isPending) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { contractIds } = data;

      if (contractIds && contractIds.length > 0) {
        startTransition(async () => {
          try {
            const targetFolder = folders.find(
              (f) => f.public_uuid === folder.folderId,
            );
            const numericFolderId = targetFolder ? targetFolder.id : null;

            for (const contractId of contractIds) {
              await assignContractToFolder(contractId, numericFolderId);
            }

            // Show success toast
            const contractCount = contractIds.length;
            if (numericFolderId && targetFolder) {
              toast({
                title: 'Contract Added to Folder',
                description: `Successfully added ${contractCount} contract${contractCount > 1 ? 's' : ''} to ${targetFolder.name}.`,
              });
            } else {
              toast({
                title: 'Contract Removed from Folder',
                description: `Successfully removed ${contractCount} contract${contractCount > 1 ? 's' : ''} from folder.`,
              });
            }

            router.refresh();
          } catch (error: any) {
            logger.error({ error }, 'Failed to assign contract(s) to folder');
            toast({
              title: 'Error',
              description:
                error?.message || 'Failed to update folder assignment',
              variant: 'destructive',
            });
          }
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to parse drag data');
    }
  };

  return (
    <Link
      href={folder.href}
      prefetch={false}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'flex items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors',
        isActive && 'bg-selected',
        !isActive && 'text-foreground/80 hover:bg-hover',
        isOver &&
          !folder.folderId &&
          'cursor-not-allowed bg-muted/50 text-muted-foreground',
        isOver &&
          folder.folderId &&
          'bg-blue-100 ring-2 ring-blue-500 dark:bg-blue-900/30',
      )}
    >
      <div className="pointer-events-none">
        {isOver && !folder.folderId ? (
          <CircleBackslashIcon className="h-4 w-4" />
        ) : folder.icon === 'folder' ? (
          <FolderIcon className="h-4 w-4" />
        ) : folder.icon === 'archive' ? (
          <ArchiveIcon className="h-4 w-4 p-[1px]" />
        ) : folder.icon === 'clock' ? (
          <ClockIcon className="h-4 w-4" />
        ) : folder.icon === 'layers' ? (
          <LayersIcon className="h-4 w-4" />
        ) : folder.icon === 'Receipt' ? (
          <Receipt className="h-4 w-4" strokeWidth={1.5} />
        ) : folder.icon === 'ClockFading' ? (
          <ClockFading className="h-4 w-4" />
        ) : folder.icon === 'FileLock2' ? (
          <FileLock2 className="h-4 w-4" strokeWidth={1.5} />
        ) : (
          <div className="flex w-4 justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="15"
              viewBox="0 0 16 17"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M1 1H15V16H1V1ZM0 17V0H16V17H0ZM3 5H13V4H3V5ZM13 9H3V8H13V9ZM3 13H10V12H3V13Z"
                fill="currentColor"
              />
            </svg>
          </div>
        )}
      </div>
      <span className="pointer-events-none line-clamp-1 flex-1">
        {folder.label}
      </span>
      {folder.count !== undefined && (
        <span className="pointer-events-none font-label text-xs text-muted-foreground/80">
          {folder.count}
        </span>
      )}
    </Link>
  );
}
