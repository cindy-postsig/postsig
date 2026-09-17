'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ChevronDown } from 'lucide-react';

interface MultiSelectFilterProps {
  options: { value: string; label: string }[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
}

export function MultiSelectFilter({
  options,
  value,
  onValueChange,
  placeholder,
  className,
  disabled,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const selectedValues = React.useMemo(() => {
    return options.filter((option) => value.includes(option.value));
  }, [options, value]);

  const toggleOption = (optionValue: string) => {
    if (optionValue === 'all') {
      onValueChange([]);
      return;
    }

    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];

    onValueChange(newValue);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          // Mirrors SelectTrigger so single and multi selects match in a
          // filter bar; !px overrides the Button combobox padding rule.
          className={cn(
            'font-normal h-8 w-full items-center justify-between rounded-sm border border-input bg-accent !px-2.5 py-2 font-sans-neue text-[0.825rem] ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-[4px] focus:ring-ring/15 disabled:cursor-not-allowed disabled:bg-secondary disabled:opacity-50 [&>span]:line-clamp-1',
            className,
          )}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedValues.length === 0
              ? placeholder
              : selectedValues.length === 1
                ? selectedValues[0].label
                : `${selectedValues.length} selected`}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput className="pl-1.5" placeholder={`Search...`} />
          <CommandList>
            <CommandEmpty>No items found.</CommandEmpty>
            <CommandGroup>
              {options.map((option, index) => (
                <React.Fragment key={option.value}>
                  <CommandItem
                    onSelect={() => toggleOption(option.value)}
                    className={`cursor-pointer text-sm leading-tight ${
                      option.value === 'all' ? 'font-medium' : ''
                    }`}
                  >
                    <Checkbox
                      checked={
                        option.value === 'all'
                          ? value.length === 0
                          : value.includes(option.value)
                      }
                      className="mr-2"
                    />
                    {option.label}
                  </CommandItem>
                  {option.value === 'all' && <Separator className="my-1" />}
                </React.Fragment>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
