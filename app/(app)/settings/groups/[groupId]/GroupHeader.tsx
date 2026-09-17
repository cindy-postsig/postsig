'use client';

import {
  useState,
  useRef,
  useEffect,
  useTransition,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteGroupDialog } from '@/components/settings/DeleteGroupDialog';
import { updateGroupName } from '@/app/lib/actions/organization-groups';
import { toast } from '@/components/ui/use-toast';
import logger from '@/utils/pino';

interface GroupHeaderProps {
  groupId: number;
  groupName: string;
  memberCount: number;
  onOptimisticUpdate?: (name: string | null) => void;
}

export function GroupHeader({
  groupId,
  groupName,
  memberCount,
  onOptimisticUpdate,
}: GroupHeaderProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = groupName;

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditedName(displayName);
    setError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName('');
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editedName.trim()) {
      handleCancelEdit();
      return;
    }

    if (editedName.trim() === displayName) {
      handleCancelEdit();
      return;
    }

    const newName = editedName.trim();

    // Optimistic update
    onOptimisticUpdate?.(newName);
    setIsEditing(false);
    setEditedName('');
    setError(null);

    startTransition(async () => {
      try {
        const result = await updateGroupName(groupId, newName);

        if (!result.success) {
          setError(result.error || 'Failed to update group name');
          onOptimisticUpdate?.(null);
          toast({
            title: 'Error',
            description: result.error || 'Failed to update group name',
            variant: 'destructive',
          });
          return;
        }

        toast({
          title: 'Success',
          description: 'Group name updated',
        });
        router.refresh();
      } catch (error) {
        logger.error({ error }, 'Error updating group name');
        setError('Failed to update group name');
        onOptimisticUpdate?.(null);
        toast({
          title: 'Error',
          description: 'Failed to update group name',
          variant: 'destructive',
        });
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            {isEditing ? (
              <div className="flex flex-col gap-1">
                <Input
                  ref={inputRef}
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveEdit}
                  className="font-medium h-auto w-64 rounded-md border-2 border-input bg-background px-2 py-1 text-2xl"
                  disabled={isPending}
                />
                {error && (
                  <p className="text-xs leading-4 text-red-600">{error}</p>
                )}
              </div>
            ) : (
              <h1 className="font-medium text-2xl">{displayName}</h1>
            )}
            <span className="text-sm text-muted-foreground">
              {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </span>
          </div>
          {!isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  className="h-7 px-1.5"
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleStartEdit}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  Delete Group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <DeleteGroupDialog
        groupId={groupId}
        groupName={displayName}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        redirectOnDelete
      />
    </>
  );
}
