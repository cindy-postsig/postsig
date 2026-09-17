'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useTransition,
} from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusIcon, Cross1Icon } from '@radix-ui/react-icons';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UserContext } from '@/app/userProvider';
import { useAbility } from '@/components/providers/AbilityProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateEntityTags } from '@/hooks/api/useEntityTags';
import {
  useOrgTags,
  QUERY_KEYS as ORG_TAGS_QUERY_KEYS,
} from '@/hooks/api/useOrgTags';
import { Spinner } from '@/components/ui/spinner';

const MAX_TAG_LENGTH = 80;
const MAX_TAGS_PER_ENTITY = 10;

interface EntityTagsContextValue {
  currentTags: string[];
  canManageTags: boolean;
  isPending: boolean;
  atMax: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  addTag: (name: string) => void;
  removeTag: (name: string) => void;
  filteredTags: { id: number; name: string }[];
}

const EntityTagsContext = createContext<EntityTagsContextValue | null>(null);

function useEntityTags() {
  const ctx = useContext(EntityTagsContext);
  if (!ctx) {
    throw new Error(
      'EntityTags components must be used within EntityTagsProvider',
    );
  }
  return ctx;
}

export function EntityTagsProvider({
  entityId,
  initialTags = [],
  children,
}: {
  entityId: number;
  initialTags?: string[];
  children: React.ReactNode;
}) {
  const [currentTags, setCurrentTags] = useState<string[]>(initialTags);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isPending, startTransition] = useTransition();

  const userContext = useContext(UserContext);
  const organizationId = userContext?.userMetadata?.organizationId;
  const ability = useAbility();
  const canManageTags = ability.can('manage', 'ContractTag');

  const queryClient = useQueryClient();
  const updateEntityTagsMutation = useUpdateEntityTags();
  const { data: orgTagsData } = useOrgTags(organizationId || '');
  const allTags = orgTagsData?.tags || [];

  const addTag = (name: string) => {
    if (!organizationId) return;
    if (currentTags.length >= MAX_TAGS_PER_ENTITY) {
      setOpen(false);
      return;
    }

    const truncatedName = name.trim().slice(0, MAX_TAG_LENGTH);
    if (truncatedName.length === 0) return;

    if (
      currentTags.some((t) => t.toLowerCase() === truncatedName.toLowerCase())
    ) {
      setOpen(false);
      return;
    }

    const newTags = [...currentTags, truncatedName];
    setCurrentTags(newTags);
    setOpen(false);
    setInputValue('');

    startTransition(async () => {
      try {
        await updateEntityTagsMutation.mutateAsync({ entityId, tags: newTags });
        if (organizationId) {
          queryClient.invalidateQueries({
            queryKey: ORG_TAGS_QUERY_KEYS.orgTags(organizationId),
          });
        }
      } catch {
        setCurrentTags((prev) => prev.filter((t) => t !== truncatedName));
      }
    });
  };

  const removeTag = (tagName: string) => {
    const newTags = currentTags.filter((t) => t !== tagName);
    setCurrentTags(newTags);

    startTransition(async () => {
      try {
        await updateEntityTagsMutation.mutateAsync({ entityId, tags: newTags });
      } catch {
        setCurrentTags((prev) => [...prev, tagName]);
      }
    });
  };

  const filteredTags = allTags.filter(
    (tag) =>
      !currentTags.some((ct) => ct.toLowerCase() === tag.name.toLowerCase()) &&
      tag.name.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const value = useMemo<EntityTagsContextValue>(
    () => ({
      currentTags,
      canManageTags,
      isPending,
      atMax: currentTags.length >= MAX_TAGS_PER_ENTITY,
      open,
      setOpen,
      inputValue,
      setInputValue,
      addTag,
      removeTag,
      filteredTags,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentTags, canManageTags, isPending, open, inputValue, filteredTags],
  );

  return (
    <EntityTagsContext.Provider value={value}>
      {children}
    </EntityTagsContext.Provider>
  );
}

export function EntityTagsList({
  className,
  size = 'default',
}: {
  className?: string;
  size?: 'default' | 'sm' | 'xs';
}) {
  const { currentTags, canManageTags, removeTag, isPending } = useEntityTags();

  if (currentTags.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {currentTags.map((tag) => (
        <Link
          key={tag}
          href={`/investor/portfolio?tags=${encodeURIComponent(tag.toLowerCase())}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Badge
            variant="user"
            size={size}
            className="group/badge flex items-center"
          >
            <span>{tag}</span>
            {canManageTags && (
              <span
                className={`
                  ml-0 w-0 cursor-pointer overflow-hidden
                  pb-[1px] opacity-0 transition-all duration-300
                  ease-in-out group-hover/badge:ml-1.5 group-hover/badge:w-3
                  group-hover/badge:opacity-100 group-hover/badge:[transition-delay:1000ms]
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeTag(tag);
                }}
              >
                <Cross1Icon className="h-3 w-3" />
              </span>
            )}
          </Badge>
        </Link>
      ))}
      {isPending && <Spinner className="size-4 text-muted-foreground" />}
    </div>
  );
}

export function AddTagsButton() {
  const {
    currentTags,
    canManageTags,
    atMax,
    open,
    setOpen,
    inputValue,
    setInputValue,
    addTag,
    filteredTags,
  } = useEntityTags();

  if (!canManageTags) return null;

  if (atMax) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 px-3"
              disabled
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add Tags
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Maximum of {MAX_TAGS_PER_ENTITY} tags allowed</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 px-3">
          <PlusIcon className="h-3.5 w-3.5" />
          Add Tags
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="end">
        <p className="font-medium flex items-center justify-between border-b px-3 py-2 text-xs">
          <span>Add Tags</span>
          <span className="font-normal text-muted-foreground">
            {currentTags.length}/{MAX_TAGS_PER_ENTITY}
          </span>
        </p>
        <Command>
          <CommandInput
            placeholder="Search or add tag..."
            value={inputValue}
            onValueChange={(value) =>
              setInputValue(value.slice(0, MAX_TAG_LENGTH))
            }
            maxLength={MAX_TAG_LENGTH}
            className="pl-1"
          />
          <CommandList>
            <CommandEmpty
              className={`text-center text-xs ${filteredTags.length > 0 ? 'py-1' : 'py-0'}`}
            >
              {inputValue && (
                <>
                  {currentTags.some(
                    (ct) => ct.toLowerCase() === inputValue.toLowerCase(),
                  ) ? (
                    <div className="my-1 px-2 py-2 text-sm text-muted-foreground">
                      &quot;{inputValue}&quot; is already added
                    </div>
                  ) : (
                    <div
                      className="my-1 cursor-pointer px-2 py-2 text-sm hover:bg-accent"
                      role="button"
                      tabIndex={0}
                      onClick={() => addTag(inputValue)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          addTag(inputValue);
                        }
                      }}
                    >
                      Add &quot;
                      {inputValue.length > MAX_TAG_LENGTH
                        ? `${inputValue.slice(0, MAX_TAG_LENGTH)}...`
                        : inputValue}
                      &quot;
                      {inputValue.length > MAX_TAG_LENGTH && (
                        <div className="text-xs text-muted-foreground">
                          Will be truncated to {MAX_TAG_LENGTH} characters
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CommandEmpty>
            {filteredTags.length > 0 && (
              <CommandGroup>
                {filteredTags.map((tag) => (
                  <CommandItem
                    key={tag.id}
                    onSelect={() => addTag(tag.name)}
                    className="cursor-pointer"
                  >
                    {tag.name}
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
