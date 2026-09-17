'use client';

import type { ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon, PlusIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { PickerCategory } from '@/lib/v2/cost-allocation/picker';
import type {
  OwnerCatalogEmployee,
  OwnerCatalogUser,
} from '@/lib/v2/owners/catalog';
import { sponsorRefKey } from '@/lib/v2/owners/refs';
import type { OwnerSponsorRef } from '@/lib/v2/owners/types';

export interface SelectedSponsor {
  ref: OwnerSponsorRef;
  name: string;
}

export interface SelectedGroup {
  id: number;
  name: string;
}

const matches = (name: string, query: string) =>
  query === '' || name.toLowerCase().includes(query.toLowerCase());

/**
 * cmdk counts its registered items, not this file's manual filtering, so
 * `CommandEmpty` stays hidden behind the always-present add and create items.
 */
function PickerEmpty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-sm">{children}</div>;
}

/**
 * The Business Sponsor picker: PostSig users and HR employees in one search,
 * with the typed text offered as a bare label for anyone in neither list.
 * Sections follow the data, so an org with no HR import sees a flat list.
 */
export function SponsorPicker({
  open,
  onOpenChange,
  users,
  employees,
  isLoading,
  selected,
  query,
  onQueryChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: OwnerCatalogUser[];
  employees: OwnerCatalogEmployee[];
  isLoading: boolean;
  selected: SelectedSponsor[];
  query: string;
  onQueryChange: (query: string) => void;
  onAdd: (sponsor: SelectedSponsor) => void;
}) {
  // The label this picker would add is trimmed, so it searches on the same
  // text: a pasted name with a trailing space still finds its catalog entry.
  const trimmedQuery = query.trim();
  const selectedKeys = new Set(selected.map((s) => sponsorRefKey(s.ref)));
  const userOptions = users.filter(
    (user) =>
      !selectedKeys.has(sponsorRefKey({ kind: 'user', id: user.id })) &&
      matches(user.name, trimmedQuery),
  );
  const employeeOptions = employees.filter(
    (employee) =>
      !selectedKeys.has(sponsorRefKey({ kind: 'employee', id: employee.id })) &&
      matches(employee.name, trimmedQuery),
  );

  // Enter takes the first item, so a name the catalog already holds must not
  // resolve to a bare label that reports cannot join back to its record.
  const matchesCatalogName =
    trimmedQuery !== '' &&
    [...users, ...employees].some(
      (candidate) =>
        candidate.name.trim().toLowerCase() === trimmedQuery.toLowerCase(),
    );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="font-normal h-10 w-full justify-between"
        >
          {selected.length > 0
            ? `${selected.length} sponsor${selected.length > 1 ? 's' : ''} selected`
            : 'Search or add business sponsors...'}
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or add sponsor..."
            value={query}
            onValueChange={onQueryChange}
            className="pl-1"
          />
          <CommandList>
            {trimmedQuery !== '' && !matchesCatalogName && (
              <CommandGroup>
                <CommandItem
                  value={`add-label:${query}`}
                  onSelect={() =>
                    onAdd({
                      ref: { kind: 'label', name: trimmedQuery },
                      name: trimmedQuery,
                    })
                  }
                  className="cursor-pointer"
                >
                  Add &quot;{query}&quot;
                </CommandItem>
              </CommandGroup>
            )}
            {isLoading ? (
              <CommandGroup heading="PostSig Users">
                <div className="px-2 py-2 text-sm text-muted-foreground">
                  Loading users...
                </div>
              </CommandGroup>
            ) : (
              <>
                {userOptions.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="PostSig Users">
                      {userOptions.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={`user:${user.id}`}
                          onSelect={() =>
                            onAdd({
                              ref: { kind: 'user', id: user.id },
                              name: user.name,
                            })
                          }
                          className="cursor-pointer"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {user.name}
                            {user.email && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                {user.email}
                              </span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
                {employeeOptions.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Employees">
                      {employeeOptions.map((employee) => (
                        <CommandItem
                          key={employee.id}
                          value={`employee:${employee.id}`}
                          onSelect={() =>
                            onAdd({
                              ref: { kind: 'employee', id: employee.id },
                              name: employee.name,
                            })
                          }
                          className="cursor-pointer"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {employee.name}
                            {employee.unitPath && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                · {employee.unitPath}
                              </span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
                {userOptions.length === 0 && employeeOptions.length === 0 && (
                  <PickerEmpty>
                    {users.length === 0 && employees.length === 0
                      ? 'No organization users found.'
                      : 'No users found.'}
                  </PickerEmpty>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Business Groups picker: one section per catalog category (today only
 * the business_group level — see OwnersCatalogData.groups), with the parent
 * path beside a node whose name another node at its level shares.
 */
export function GroupPicker({
  open,
  onOpenChange,
  categories,
  isLoading,
  selected,
  query,
  onQueryChange,
  onToggle,
  onCreateNew,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: PickerCategory[];
  isLoading: boolean;
  selected: SelectedGroup[];
  query: string;
  onQueryChange: (query: string) => void;
  onToggle: (group: SelectedGroup) => void;
  onCreateNew: () => void;
}) {
  const sections = categories
    .map((category) => ({
      key: category.key,
      label: category.label,
      items: category.items.filter((item) => matches(item.target.name, query)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="font-normal h-10 w-full justify-between"
        >
          {selected.length > 0
            ? `${selected.length} group${selected.length > 1 ? 's' : ''} selected`
            : 'Select business groups...'}
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search groups..."
            value={query}
            onValueChange={onQueryChange}
            className="pl-1"
          />
          <CommandList>
            <CommandGroup>
              <CommandItem
                value="create-business-group"
                onSelect={onCreateNew}
                className="cursor-pointer"
              >
                <PlusIcon className="h-4 w-4" />
                Create new business group...
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            {isLoading ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                Loading groups...
              </div>
            ) : sections.length > 0 ? (
              sections.map((section) => (
                <CommandGroup key={section.key} heading={section.label}>
                  {section.items.map((item) => {
                    const isSelected = selected.some(
                      (group) => group.id === item.target.id,
                    );
                    return (
                      <CommandItem
                        key={item.target.id}
                        value={`unit:${item.target.id}`}
                        onSelect={() =>
                          onToggle({
                            id: item.target.id,
                            name: item.target.name,
                          })
                        }
                        className="cursor-pointer"
                      >
                        <div className="mr-2 flex h-4 w-4 items-center justify-center">
                          {isSelected && <CheckIcon className="h-4 w-4" />}
                        </div>
                        <span className="min-w-0 flex-1 truncate">
                          {item.target.name}
                          {item.breadcrumb && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              · {item.breadcrumb}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))
            ) : (
              <PickerEmpty>No groups found.</PickerEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
