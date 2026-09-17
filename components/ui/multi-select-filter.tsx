'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
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

interface MultiSelectFilterProps {
  options: { value: string; label: string }[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}

export function MultiSelectFilter({
  options,
  value,
  onValueChange,
  placeholder,
  disabled = false,
}: MultiSelectFilterProps) {
  const [open, setOpen] = React.useState(false);

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
          size={'sm'}
          role="combobox"
          aria-expanded={open}
          className="font-normal px-2.5"
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
          <CommandInput className="pl-1.5" placeholder={`Search tags...`} />
          <CommandList>
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => toggleOption(option.value)}
                  className="cursor-pointer text-sm leading-tight"
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
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
