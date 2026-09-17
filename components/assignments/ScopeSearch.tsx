'use client';

import { useMemo, useState } from 'react';
import { MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { AssignmentsPayload, ScopeKey } from '@/lib/v2/assignments/types';

// The ticket's "search box, so that users do not have to expand the whole tree
// manually": one box over every node and every person, jumping straight to a
// scope or opening a profile. Distinct from the Users tab's row filter, which
// narrows the table within the scope you are already in.

const MAX_RESULTS = 50;

export function ScopeSearch({
  payload,
  onSelectScope,
  onSelectUser,
}: {
  payload: AssignmentsPayload;
  onSelectScope: (scope: ScopeKey) => void;
  onSelectUser: (employeeId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const { units, people } = useMemo(() => {
    if (needle.length === 0) return { units: [], people: [] };
    const units = Object.values(payload.nodes)
      .filter((node) => node.name.toLowerCase().includes(needle))
      .slice(0, MAX_RESULTS);
    const people = Object.values(payload.users)
      .filter((user) => user.name.toLowerCase().includes(needle))
      .slice(0, MAX_RESULTS);
    return { units, people };
  }, [payload, needle]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="font-normal h-8 gap-1.5 px-2.5"
        >
          <MagnifyingGlassIcon className="h-3.5 w-3.5 text-muted-foreground" />
          Find a team or person
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Filtering is ours (it searches two different record types and caps
            the list), so cmdk must not filter on top of it. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search the organization…"
          />
          <CommandList>
            {needle.length > 0 && units.length === 0 && people.length === 0 && (
              <CommandEmpty>No match.</CommandEmpty>
            )}
            {units.length > 0 && (
              <CommandGroup heading="Teams and units">
                {units.map((node) => (
                  <CommandItem
                    key={`unit-${node.id}`}
                    value={`unit-${node.id}`}
                    onSelect={() => {
                      setOpen(false);
                      onSelectScope(node.id);
                    }}
                  >
                    <span className="truncate">{node.name}</span>
                    <span className="ml-auto pl-2 text-xs text-muted-foreground">
                      {node.breadcrumb ?? node.levelLabel}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {people.length > 0 && (
              <CommandGroup heading="People">
                {people.map((user) => (
                  <CommandItem
                    key={`user-${user.id}`}
                    value={`user-${user.id}`}
                    onSelect={() => {
                      setOpen(false);
                      onSelectUser(user.id);
                    }}
                  >
                    <span className="truncate">{user.name}</span>
                    <span className="ml-auto pl-2 text-xs text-muted-foreground">
                      {(user.orgUnitId === null
                        ? undefined
                        : payload.nodes[user.orgUnitId]?.name) ?? ''}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
