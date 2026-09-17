'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { deleteGroup } from '@/app/lib/actions/organization-groups';
import { toast } from '@/components/ui/use-toast';
import { useSettingsBasePath } from '@/hooks/useSettingsBasePath';

interface DeleteGroupDialogProps {
  groupId: number;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectOnDelete?: boolean;
}

export function DeleteGroupDialog({
  groupId,
  groupName,
  open,
  onOpenChange,
  redirectOnDelete = false,
}: DeleteGroupDialogProps) {
  const router = useRouter();
  const settingsBasePath = useSettingsBasePath();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteGroup(groupId);

      if (result.success) {
        toast({
          title: 'Group deleted',
          description: `"${groupName}" has been deleted`,
        });
        onOpenChange(false);
        if (redirectOnDelete) {
          router.push(`${settingsBasePath}/groups`);
        }
        router.refresh();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to delete group',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{groupName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            Members will lose access to any folders and contracts shared with
            this group. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
