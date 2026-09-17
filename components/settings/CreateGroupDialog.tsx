'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import UserSelectionList from './UserSelectionList';
import { createGroup } from '@/app/lib/actions/organization-groups';
import { toast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { useSharingDialog } from '@/app/(app)/SharingDialogContext';
import { ChevronDownIcon, ChevronUpIcon } from '@radix-ui/react-icons';

interface User {
  id: string;
  name: string | null;
  email: string | null;
  job_title?: string | null;
}

interface CreateGroupDialogProps {
  users?: User[];
  trigger?: React.ReactNode;
  compact?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onGroupCreated?: (group: {
    id: number;
    name: string;
    publicUuid: string;
  }) => void;
}

export default function CreateGroupDialog({
  users: usersProp,
  trigger,
  compact = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onGroupCreated,
}: CreateGroupDialogProps) {
  const router = useRouter();
  const { refreshOrgData, orgData } = useSharingDialog();

  // Use users from props or fall back to context (includes pending users)
  const users =
    usersProp ||
    (orgData?.allUsers || []).map((u) => ({
      id: u.id,
      name: u.name || null,
      email: u.email || null,
      job_title: null as string | null,
    }));

  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [showUserSelection, setShowUserSelection] = useState(!compact);

  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  // Warn in development if controlled mode is incomplete
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      if (isControlled && !controlledOnOpenChange) {
        console.warn(
          'CreateGroupDialog: `open` prop provided without `onOpenChange`. Dialog state changes will not propagate to parent.',
        );
      }
    }
  }, [isControlled, controlledOnOpenChange]);

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setGroupName('');
      setDescription('');
      setSelectedUsers(new Set());
      setSearchQuery('');
      setShowUserSelection(!compact);
    }
  }, [open, compact]);

  const handleToggleUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const result = await createGroup({
        name: groupName,
        userIds: Array.from(selectedUsers),
      });

      if (result.success && result.group) {
        toast({
          title: 'Success',
          description: result.message || 'Group created successfully',
        });

        // Call onGroupCreated callback if provided
        if (onGroupCreated) {
          onGroupCreated({
            id: result.group.id,
            name: result.group.name,
            publicUuid: result.group.publicUuid,
          });
        }

        // Reset form
        setGroupName('');
        setDescription('');
        setSelectedUsers(new Set());
        setSearchQuery('');
        setShowUserSelection(!compact);
        setOpen(false);

        // Refresh the page and sharing dialog data to show the new group
        router.refresh();
        refreshOrgData?.();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to create group',
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
      setIsSubmitting(false);
    }
  };

  // Only group name is required - users can be added later
  const isValid = groupName.trim().length > 0;

  // Show trigger button unless dialog is controlled externally
  const showTrigger = !isControlled;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          {trigger || <Button size="sm">Create Group</Button>}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Group Name */}
          <div className="space-y-2">
            <label className="font-medium text-sm">Group Name</label>
            <Input
              type="text"
              placeholder="e.g., Investment Team, Risk Management"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className={compact ? 'h-9 text-sm' : 'h-11 text-base'}
              autoFocus
            />
          </div>

          {/* User Selection - collapsible in compact mode */}
          {compact ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setShowUserSelection(!showUserSelection)}
              >
                {showUserSelection ? (
                  <>
                    <ChevronUpIcon className="h-3 w-3" />
                    Hide user selection
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="h-3 w-3" />
                    Add users to group
                    {selectedUsers.size > 0 &&
                      ` (${selectedUsers.size} selected)`}
                  </>
                )}
              </Button>

              {showUserSelection && (
                <div className="mt-4">
                  <UserSelectionList
                    users={users}
                    selectedUsers={selectedUsers}
                    onToggleUser={handleToggleUser}
                    onSetSelectedUsers={setSelectedUsers}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    height="h-[280px]"
                    showSelectAll={false}
                  />
                </div>
              )}
            </div>
          ) : (
            <UserSelectionList
              users={users}
              selectedUsers={selectedUsers}
              onToggleUser={handleToggleUser}
              onSetSelectedUsers={setSelectedUsers}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              height="h-[280px]"
              showSelectAll={false}
            />
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
