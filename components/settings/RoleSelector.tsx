'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Command, CommandGroup, CommandItem } from '@/components/ui/command';
import { Check, ChevronDown } from 'lucide-react';
import {
  ADMIN,
  MANAGER,
  VIEWER,
  POSTSIG_ADMIN,
  POSTSIG_REVIEWER,
  POSTSIG_EXTRACTOR,
} from '@/constants/data';

interface RoleSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const roles = [
  {
    value: ADMIN,
    label: 'Admin',
    description: (
      <>
        Can manage organization
        <br />
        and view all contracts
      </>
    ),
  },
  {
    value: MANAGER,
    label: 'Manager',
    description: 'Can view their own & assigned contracts',
  },
  {
    value: VIEWER,
    label: 'Viewer',
    description: 'Can view assigned contracts',
  },
  {
    value: POSTSIG_ADMIN,
    label: 'PostSig Admin',
    description: 'PostSig internal admin',
  },
  {
    value: POSTSIG_REVIEWER,
    label: 'PostSig Reviewer',
    description: 'PostSig internal reviewer',
  },
  {
    value: POSTSIG_EXTRACTOR,
    label: 'PostSig Extractor',
    description: 'PostSig internal extractor',
  },
];

export function RoleSelector({
  value,
  onValueChange,
  disabled,
  className = 'h-9 min-w-36 justify-between text-sm font-normal',
}: RoleSelectorProps) {
  const [open, setOpen] = useState(false);

  // Filter out PostSig roles from selectable options
  const availableRoles = roles.filter(
    (role) =>
      ![POSTSIG_ADMIN, POSTSIG_REVIEWER, POSTSIG_EXTRACTOR].includes(
        role.value,
      ),
  );

  // Get the display label for the current value (including PostSig roles)
  const currentRole = roles.find((role) => role.value === value);
  const displayLabel = currentRole?.label || value || 'Role';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={className}
        >
          {displayLabel}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandGroup>
            {availableRoles.map((role) => (
              <CommandItem
                key={role.value}
                value={role.value}
                onSelect={() => {
                  onValueChange(role.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${
                    value === role.value ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <div className="flex flex-col">
                  <span className="font-medium">{role.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {role.description}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
