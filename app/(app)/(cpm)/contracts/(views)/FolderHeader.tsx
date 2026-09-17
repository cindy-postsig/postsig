'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useState, useRef, useEffect, useTransition } from 'react';
import { useFolderContext } from './FolderContext';
import { Input } from '@/components/ui/input';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteFolderAction } from '@/data/superuser/folders';
import { toast } from '@/components/ui/use-toast';
import { Can } from '@/components/providers/AbilityProvider';
import { SYSTEM_TYPE_FOLDERS } from './systemFolderConfig';
import logger from '@/utils/pino';

// Build system folder titles from config
const systemFolderTitles: Record<string, string> = {
  '/contracts': 'All Contracts',
  '/contracts/pending': 'Pending',
  '/contracts/archived': 'Archived',
};

// Add system type folders from config
SYSTEM_TYPE_FOLDERS.forEach((config) => {
  systemFolderTitles[config.href] = config.label;
});

// System folders that should not have share button
const systemFoldersWithoutShare = [
  '/contracts',
  '/contracts/pending',
  '/contracts/archived',
  ...SYSTEM_TYPE_FOLDERS.map((config) => config.href),
];

export default function FolderHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { folderNameMap, folders, removeFolder } = useFolderContext();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [optimisticName, setOptimisticName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if this is a system folder
  const isSystemFolder = pathname in systemFolderTitles;

  // Get title and folder info
  let title = 'Contracts';
  let currentFolderId: number | null = null;
  let currentFolder = null;

  if (isSystemFolder) {
    title = systemFolderTitles[pathname];
  } else if (pathname.startsWith('/contracts/folder/')) {
    const folderPublicUuid = pathname.split('/').pop();
    currentFolder = folders.find((f) => f.public_uuid === folderPublicUuid);
    if (currentFolder) {
      title = optimisticName || currentFolder.name;
      currentFolderId = currentFolder.id;
    }
  }

  const canEdit = !isSystemFolder && currentFolder;

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setOptimisticName(null);
  }, [pathname]);

  const handleStartEdit = () => {
    setEditedName(title);
    setError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName('');
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editedName.trim() || !currentFolderId) {
      handleCancelEdit();
      return;
    }

    // Check for duplicate name
    const duplicate = folders.find(
      (f) =>
        f.id !== currentFolderId &&
        f.name.toLowerCase() === editedName.trim().toLowerCase(),
    );

    if (duplicate) {
      setError('A folder with this name already exists');
      return;
    }

    const originalTitle = optimisticName || title;
    if (editedName.trim() === originalTitle) {
      handleCancelEdit();
      return;
    }

    // Optimistic update
    setOptimisticName(editedName.trim());
    setIsEditing(false);
    setEditedName('');
    setError(null);

    startTransition(async () => {
      try {
        const { updateFolderName } = await import('@/data/superuser/folders');
        await updateFolderName(currentFolderId!, editedName.trim());
        router.refresh();
      } catch (error) {
        logger.error({ error }, 'Error updating folder name');
        setError('Failed to update folder name');
        // Revert optimistic update on error
        setOptimisticName(null);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleDeleteFolder = async () => {
    if (isDeleting || !currentFolderId) return;

    setIsDeleting(true);

    try {
      // Optimistically remove folder from sidebar immediately
      removeFolder(currentFolderId);
      setShowDeleteDialog(false);

      // Navigate away before the async delete to prevent re-clicking
      router.push('/contracts');

      await deleteFolderAction(currentFolderId);

      toast({
        title: 'Folder Deleted',
        description: 'Your folder has been deleted.',
      });

      router.refresh();
    } catch (error: any) {
      toast({
        title: 'Error',
        description:
          error.message || 'Failed to delete folder. Please try again.',
        variant: 'destructive',
      });
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <div className="sticky top-14 z-20 flex h-20 items-center gap-6 bg-background p-6">
        {isEditing ? (
          <div className="flex w-1/3 items-center gap-2">
            <Input
              ref={inputRef}
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="font-light h-auto rounded-md border-2 border-input bg-background px-2 py-1 font-serif text-2xl tracking-tight"
              disabled={isPending}
            />
            {error && <p className="text-xs leading-4 text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-3xl">{title}</h1>
            {canEdit && (
              <Can I="manage" a="Folder">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      className="h-7 px-1.5"
                    >
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={handleStartEdit}>
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      Delete Folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Can>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          // Reset deleting state when dialog closes
          if (!open) {
            setIsDeleting(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your contracts will not be deleted. Folders are for organizational
              purposes only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Folder'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
