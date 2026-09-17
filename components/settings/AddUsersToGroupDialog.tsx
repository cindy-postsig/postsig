'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Plus } from 'lucide-react';
import UserSelectionList from './UserSelectionList';
import { addUsersToGroup } from '@/app/lib/actions/organization-groups';
import { toast } from '@/components/ui/use-toast';

interface User {
  id: string;
  name: string | null;
  email: string | null;
  job_title: string | null;
}

interface AddUsersToGroupDialogProps {
  groupId: string;
  groupName: string;
  availableUsers: User[];
  trigger?: React.ReactNode;
}

export default function AddUsersToGroupDialog({
  groupId,
  groupName,
  availableUsers,
  trigger,
}: AddUsersToGroupDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (selectedUsers.size === 0) return;

    setIsSubmitting(true);
    try {
      const result = await addUsersToGroup(groupId, Array.from(selectedUsers));

      if (result.success) {
        toast({
          title: 'Users added',
          description: `Successfully added ${selectedUsers.size} user${selectedUsers.size !== 1 ? 's' : ''} to ${groupName}`,
        });
        setSelectedUsers(new Set());
        setSearchQuery('');
        setOpen(false);
        router.refresh();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to add users to group',
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

  const isValid = selectedUsers.size > 0;
  const emptyMessage =
    availableUsers.length === 0
      ? 'All users are already in this group'
      : 'No users found';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Users to {groupName}</DialogTitle>
        </DialogHeader>

        <UserSelectionList
          users={availableUsers}
          selectedUsers={selectedUsers}
          onToggleUser={handleToggleUser}
          onSetSelectedUsers={setSelectedUsers}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          emptyMessage={emptyMessage}
          showSelectAll={false}
        />

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting
              ? 'Adding...'
              : `Add ${selectedUsers.size > 0 ? `${selectedUsers.size}` : ''} User${selectedUsers.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
