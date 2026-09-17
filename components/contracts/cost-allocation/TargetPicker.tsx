'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  targetKey,
  type PickerCategory,
  type PickerCategoryKey,
  type PickerItem,
} from '@/lib/v2/cost-allocation/picker';
import type { AllocationTargetRef } from '@/lib/v2/cost-allocation/types';

interface TargetPickerProps {
  catalog: PickerCategory[];
  selectedKeys: ReadonlySet<string>;
  onToggle: (target: AllocationTargetRef) => void;
  onCreateBusinessGroup: (name: string) => Promise<AllocationTargetRef | null>;
  triggerLabel: string;
  /**
   * Portal target. Inside a Sheet or Dialog this must be the modal's content
   * node: Radix locks scrolling to that subtree, so a popover left in the body
   * portal takes no wheel events at all (QA 2026-08-26).
   */
  container?: HTMLElement | null;
}

function TargetItem({
  item,
  checked,
  onToggle,
  categoryLabel,
}: {
  item: PickerItem;
  checked: boolean;
  onToggle: () => void;
  categoryLabel?: string;
}) {
  return (
    <CommandItem
      value={targetKey(item.target)}
      onSelect={onToggle}
      className="cursor-pointer"
    >
      <Checkbox checked={checked} className="pointer-events-none" />
      <span className="min-w-0 flex-1 truncate">
        {item.target.name}
        {item.breadcrumb && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            · {item.breadcrumb}
          </span>
        )}
      </span>
      {categoryLabel && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {categoryLabel}
        </span>
      )}
    </CommandItem>
  );
}

function CreateBusinessGroupRow({
  onCreate,
}: {
  onCreate: (name: string) => Promise<AllocationTargetRef | null>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <CommandItem
        value="create-business-group"
        onSelect={() => setOpen(true)}
        className="font-medium cursor-pointer text-primary data-[selected=true]:text-primary"
      >
        <Plus />
        Create business group
      </CommandItem>
    );
  }

  const submit = async () => {
    if (name.trim() === '' || pending) return;
    setPending(true);
    try {
      const created = await onCreate(name);
      if (created) {
        setName('');
        setOpen(false);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <Input
        autoFocus
        value={name}
        placeholder="Business group name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // The command list underneath claims the arrows and Home/End for
          // navigation and would swallow them before the caret moved; keys
          // typed into the name stay with the name.
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        className="h-8 text-sm"
      />
      <Button
        size="sm"
        onClick={() => void submit()}
        disabled={pending || name.trim() === ''}
      >
        Create
      </Button>
    </div>
  );
}

export function TargetPicker({
  catalog,
  selectedKeys,
  onToggle,
  onCreateBusinessGroup,
  triggerLabel,
  container,
}: TargetPickerProps) {
  const [browse, setBrowse] = useState<PickerCategoryKey | null>(null);
  const [query, setQuery] = useState('');

  const current = catalog.find((c) => c.key === browse) ?? null;
  const q = query.trim().toLowerCase();
  const matches = q
    ? catalog.flatMap((category) =>
        category.items
          .filter((item) => item.target.name.toLowerCase().includes(q))
          .map((item) => ({ item, categoryLabel: category.label })),
      )
    : [];
  const hasBusinessGroups = catalog.some((c) => c.key === 'business_group');

  const reset = () => {
    setBrowse(null);
    setQuery('');
  };

  const createRow = (
    <>
      <CommandSeparator />
      <CommandGroup>
        <CreateBusinessGroupRow onCreate={onCreateBusinessGroup} />
      </CommandGroup>
    </>
  );

  return (
    <Popover onOpenChange={(open) => !open && reset()}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start" container={container}>
        {/* Search is a name match across every category, so cmdk's own
            filtering stays off: browsing shows categories, not targets, and
            a hit needs its category label beside it. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search allocation targets"
          />
          <CommandList className="max-h-80">
            {q ? (
              <>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup>
                  {matches.map(({ item, categoryLabel }) => (
                    <TargetItem
                      key={targetKey(item.target)}
                      item={item}
                      categoryLabel={categoryLabel}
                      checked={selectedKeys.has(targetKey(item.target))}
                      onToggle={() => onToggle(item.target)}
                    />
                  ))}
                </CommandGroup>
              </>
            ) : browse === null ? (
              <>
                <CommandGroup>
                  {catalog.map((category) => (
                    <CommandItem
                      key={category.key}
                      value={category.key}
                      onSelect={() => setBrowse(category.key)}
                      className="cursor-pointer"
                    >
                      {category.label}
                      <ChevronRight className="ml-auto text-muted-foreground" />
                    </CommandItem>
                  ))}
                </CommandGroup>
                {!hasBusinessGroups && createRow}
              </>
            ) : (
              <>
                <CommandGroup>
                  <CommandItem
                    value="back"
                    onSelect={() => setBrowse(null)}
                    className="font-medium cursor-pointer"
                  >
                    <ChevronLeft className="text-muted-foreground" />
                    {current?.label}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                  {current?.items.map((item) => (
                    <TargetItem
                      key={targetKey(item.target)}
                      item={item}
                      checked={selectedKeys.has(targetKey(item.target))}
                      onToggle={() => onToggle(item.target)}
                    />
                  ))}
                </CommandGroup>
                {browse === 'business_group' && createRow}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
