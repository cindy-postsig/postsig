'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Users, Mail } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { UserItem } from './UserItem';
import { type User, type Group } from '@/app/lib/sharing/actions';
import { isValidEmail } from '@/app/lib/validations';
import { useAbility } from '@/components/providers/AbilityProvider';
import { userRoles } from '@/constants/data';

const shareableRoles = [
  userRoles.clientAdmin,
  userRoles.clientSupervisor,
  userRoles.clientUser,
];

interface UserGroupSearchPickerProps {
  availableUsers: User[];
  availableGroups: Group[];
  currentUsers: Array<{ id: string; email?: string }>;
  currentGroups: Array<{ id: number }>;
  adminsAndManagers: User[];
  isLoadingOrgData: boolean;
  onAddUser: (user: User) => void;
  onAddGroup: (group: Group) => void;
  onInviteUser?: (email: string) => void;
}

export function UserGroupSearchPicker({
  availableUsers,
  availableGroups,
  currentUsers,
  currentGroups,
  adminsAndManagers,
  isLoadingOrgData,
  onAddUser,
  onAddGroup,
  onInviteUser,
}: UserGroupSearchPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const ability = useAbility();
  const canManageGroups = ability.can('manage', 'Group');

  const allAvailableUsers = availableUsers
    .filter((user) => !currentUsers.some((u) => u.id === user.id))
    .filter((user) => !adminsAndManagers.some((admin) => admin.id === user.id))
    .filter((user) => user.role && shareableRoles.includes(user.role));

  const allAvailableGroups = canManageGroups
    ? availableGroups.filter(
        (group) => !currentGroups.some((g) => g.id === group.id),
      )
    : [];

  const filteredAvailableUsers = allAvailableUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredAvailableGroups = allAvailableGroups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const hasResults =
    filteredAvailableUsers.length > 0 || filteredAvailableGroups.length > 0;

  const noUsersAvailable =
    allAvailableUsers.length === 0 &&
    (allAvailableGroups.length === 0 || !canManageGroups);

  // Check if search query doesn't match any existing user
  const noMatchingUsers = searchQuery.trim() && !hasResults;

  // Check if search query is a valid email that doesn't match any existing user
  const isValidInviteEmail =
    searchQuery.trim() &&
    isValidEmail(searchQuery.trim()) &&
    !availableUsers.some(
      (user) => user.email.toLowerCase() === searchQuery.toLowerCase().trim(),
    ) &&
    !currentUsers.some(
      (user) => user.email?.toLowerCase() === searchQuery.toLowerCase().trim(),
    );

  // Only show invite option when handler is provided and user is attempting to type an email (has @)
  const showInviteOption =
    onInviteUser && noMatchingUsers && searchQuery.includes('@');

  const handleUserSelect = (user: User) => {
    onAddUser(user);
    setSearchQuery('');
    setPopoverOpen(false);
  };

  const handleGroupSelect = (group: Group) => {
    onAddGroup(group);
    setSearchQuery('');
    setPopoverOpen(false);
  };

  const handleInviteUser = () => {
    onInviteUser?.(searchQuery.trim());
    setSearchQuery('');
    setPopoverOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label className="font-medium text-sm">Add people</Label>
      {isLoadingOrgData ? (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal={true}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Input
                placeholder="Search for people..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPopoverOpen(true);
                }}
                onClick={() => setPopoverOpen(true)}
                className="h-10 w-full text-sm"
              />
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandList className="max-h-60">
                {/* Empty state messaging */}
                {!hasResults && !showInviteOption && (
                  <CommandEmpty>
                    {noUsersAvailable ? (
                      <div className="py-2 text-center text-sm">
                        <p className="font-medium text-muted-foreground">
                          All users have been granted access
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Enter an email to invite someone new
                        </p>
                      </div>
                    ) : (
                      <div className="py-2 text-center text-sm">
                        <p className="font-medium text-muted-foreground">
                          No users found
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Try a different search or invite someone new
                        </p>
                      </div>
                    )}
                  </CommandEmpty>
                )}

                {/* Invite option */}
                {showInviteOption && (
                  <CommandGroup heading="Invite">
                    <CommandItem
                      onSelect={handleInviteUser}
                      disabled={!isValidInviteEmail}
                      className={
                        isValidInviteEmail
                          ? 'cursor-pointer'
                          : 'cursor-not-allowed opacity-50'
                      }
                    >
                      <div className="flex h-6 w-6 items-center justify-center">
                        <Mail className="h-4 w-4" strokeWidth={1.5} />
                      </div>
                      <div>
                        <div className="font-medium text-sm">
                          Invite {searchQuery.trim()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {isValidInviteEmail
                            ? 'Send an invitation to join'
                            : 'Enter a valid email address'}
                        </div>
                      </div>
                    </CommandItem>
                  </CommandGroup>
                )}

                {/* Groups */}
                {filteredAvailableGroups.length > 0 && (
                  <CommandGroup heading="Groups">
                    {filteredAvailableGroups.map((group) => (
                      <CommandItem
                        key={group.id}
                        onSelect={() => handleGroupSelect(group)}
                        className="cursor-pointer"
                      >
                        <div className="flex h-6 w-6 items-center justify-center">
                          <Users className="h-4 w-4" strokeWidth={1.5} />
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            {group.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {group.memberCount || 0} members
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {/* Users */}
                {filteredAvailableUsers.length > 0 && (
                  <CommandGroup heading="People">
                    {filteredAvailableUsers.map((user) => (
                      <CommandItem
                        key={user.id}
                        onSelect={() => handleUserSelect(user)}
                        className="cursor-pointer"
                      >
                        <UserItem
                          user={user}
                          showEmail={true}
                          variant="search"
                          avatarSize="md"
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
