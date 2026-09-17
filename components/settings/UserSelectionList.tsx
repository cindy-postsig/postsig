'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';

interface User {
  id: string;
  name: string | null;
  email: string | null;
  job_title?: string | null;
}

interface UserSelectionListProps {
  users: User[];
  selectedUsers: Set<string>;
  onToggleUser: (userId: string) => void;
  onSetSelectedUsers: (userIds: Set<string>) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  height?: string;
  emptyMessage?: string;
  showSelectAll?: boolean;
}

export default function UserSelectionList({
  users,
  selectedUsers,
  onToggleUser,
  onSetSelectedUsers,
  searchQuery,
  onSearchChange,
  height = 'h-[380px]',
  emptyMessage = 'No users found',
  showSelectAll = true,
}: UserSelectionListProps) {
  const filteredUsers = users
    .filter((user) => {
      const query = searchQuery.toLowerCase();
      return (
        user.name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        user.job_title?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const nameA = a.name || a.email?.split('@')[0] || 'Unnamed User';
      const nameB = b.name || b.email?.split('@')[0] || 'Unnamed User';
      return nameA.toLowerCase().localeCompare(nameB.toLowerCase());
    });

  const handleSelectAll = () => {
    const newSelected = new Set(selectedUsers);

    if (allFilteredSelected) {
      // Deselect all filtered users
      filteredUsers.forEach((user) => {
        newSelected.delete(user.id);
      });
    } else {
      // Select all filtered users
      filteredUsers.forEach((user) => {
        newSelected.add(user.id);
      });
    }

    onSetSelectedUsers(newSelected);
  };

  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((user) => selectedUsers.has(user.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="font-medium text-sm">Select Users</label>
          <span className="text-sm text-muted-foreground">
            {selectedUsers.size} selected
          </span>
        </div>
        {showSelectAll && filteredUsers.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            className="h-8 text-xs"
          >
            {allFilteredSelected ? 'Deselect All' : 'Select All'}
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 pl-9 text-sm"
        />
      </div>

      <ScrollArea className={`${height} rounded-md border`}>
        <div className="divide-y">
          {filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            filteredUsers.map((user) => {
              const displayName =
                user.name || user.email?.split('@')[0] || 'Unnamed User';

              return (
                <div
                  key={user.id}
                  className="grid cursor-pointer grid-cols-[auto_1fr_1fr] items-center gap-3 p-3 transition-colors hover:bg-hover"
                  onClick={() => onToggleUser(user.id)}
                >
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedUsers.has(user.id)}
                      onCheckedChange={() => onToggleUser(user.id)}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={user.name}
                      email={user.email}
                      userId={user.id}
                      size="sm"
                    />
                    <div className="font-medium text-sm">{displayName}</div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {user.email}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
