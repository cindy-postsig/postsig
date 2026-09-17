import { Dispatch, SetStateAction, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CheckIcon, ChevronDownIcon } from '@radix-ui/react-icons';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Folder } from 'lucide-react';

// Sponsors are identified by their owner-ref key ("user:<uuid>"), folders,
// groups and tags by their numeric row id.
export type FieldSelectorItem = { id: number | string; name: string };

type FieldSelectorProps = {
  field: 'folder' | 'sponsor' | 'group' | 'tag';
  data: FieldSelectorItem[];
  isLoading: boolean;
  multiSelect?: boolean;
  isEditing: boolean;
  savedItems: FieldSelectorItem[];
  selectedItems: FieldSelectorItem[];
  setSelectedItems: Dispatch<SetStateAction<FieldSelectorItem[]>>;
  disableSelect?: boolean;
};
const FieldSelector = ({
  field,
  data,
  isLoading,
  multiSelect = true,
  isEditing,
  savedItems,
  selectedItems,
  setSelectedItems,
  disableSelect,
}: FieldSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const toggleSelection = (d: FieldSelectorItem) => {
    setSelectedItems((prev) => {
      const exists = prev.some((g) => g.id === d.id);
      if (exists) {
        return prev.filter((g) => g.id !== d.id);
      }
      return [...prev, d];
    });
  };

  if (!isEditing) {
    if (field === 'tag') {
      return (
        <div className="flex flex-wrap gap-1">
          {savedItems.length > 0 ? (
            savedItems.map((item) => (
              <Badge key={item.id} variant="user" className="whitespace-nowrap">
                {item.name}
              </Badge>
            ))
          ) : (
            <span>—</span>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        {field === 'folder' && savedItems.length > 0 && (
          <Folder className="h-4 w-4 text-muted-foreground" />
        )}
        <span>{savedItems.map(({ name }) => name).join(', ') || '—'}</span>
      </div>
    );
  }

  if (multiSelect) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="font-normal flex h-10 w-full items-center justify-between gap-2"
            disabled={disableSelect}
          >
            <span className="truncate">
              {selectedItems.length > 0
                ? `${selectedItems.length} ${field}${selectedItems.length > 1 ? 's' : ''} selected`
                : `Add ${field}`}
            </span>
            <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={`Search ${field}...`}
              value={inputValue}
              onValueChange={setInputValue}
              className="pl-1"
            />
            <CommandList>
              {isLoading ? (
                <CommandGroup heading={`Organization ${field}`}>
                  <div className="px-2 py-2 text-sm text-muted-foreground">
                    Loading {field}...
                  </div>
                </CommandGroup>
              ) : data.length > 0 ? (
                <CommandGroup heading={`Organization ${field}`}>
                  {data
                    .filter(
                      (d) =>
                        inputValue === '' ||
                        d.name.toLowerCase().includes(inputValue.toLowerCase()),
                    )
                    .map((d) => {
                      const isSelected = selectedItems.some(
                        (g) => g.id === d.id,
                      );
                      return (
                        <CommandItem
                          key={d.id}
                          onSelect={() => toggleSelection(d)}
                          className="cursor-pointer"
                        >
                          <div className="mr-2 flex h-4 w-4 items-center justify-center">
                            {isSelected && <CheckIcon className="h-4 w-4" />}
                          </div>
                          {d.name}
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              ) : (
                <CommandEmpty>No {field} found.</CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="font-normal flex h-10 w-full items-center justify-between gap-2"
          disabled={disableSelect}
        >
          <span className="truncate">
            {selectedItems.length > 0 ? selectedItems[0].name : `Add ${field}`}
          </span>
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={`Search ${field}...`}
            value={inputValue}
            onValueChange={setInputValue}
            className="pl-1"
          />
          <CommandList>
            {isLoading ? (
              <CommandGroup heading={`Organization ${field}`}>
                <div className="px-2 py-2 text-sm text-muted-foreground">
                  Loading {field}...
                </div>
              </CommandGroup>
            ) : data.length > 0 &&
              data.filter(
                (d) =>
                  inputValue === '' ||
                  d.name.toLowerCase().includes(inputValue.toLowerCase()),
              ).length > 0 ? (
              <CommandGroup heading={`Organization ${field}`}>
                {data
                  .filter(
                    (d) =>
                      inputValue === '' ||
                      d.name.toLowerCase().includes(inputValue.toLowerCase()),
                  )
                  .map((d) => {
                    const isSelected = selectedItems.some((g) => g.id === d.id);
                    return (
                      <CommandItem
                        key={d.id}
                        onSelect={() => {
                          if (isSelected) {
                            // deselect if already selected
                            setSelectedItems([]);
                          } else {
                            setSelectedItems([d]);
                          }
                          setOpen(false);
                        }}
                        className="cursor-pointer"
                      >
                        <div className="mr-2 flex h-4 w-4 items-center justify-center">
                          {isSelected && <CheckIcon className="h-4 w-4" />}
                        </div>
                        {d.name}
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ) : null}
            {!isLoading && (
              <CommandEmpty>
                {data.length === 0
                  ? `No organization ${field}s found.`
                  : `No ${field}s found.`}
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default FieldSelector;
