'use client';

import { useState, useEffect, useContext, useTransition } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusIcon, Cross1Icon } from '@radix-ui/react-icons';
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
import { createClient } from '@/utils/supabase/client';
import {
  invalidateVendorListCache,
  invalidateContractSetCache,
} from '@/app/lib/actions/cache-actions';
import { Can, useAbility } from '@/components/providers/AbilityProvider';
import { Database } from '@/database.types';
import { Spinner } from '@/components/ui/spinner';

type UserTag = Database['public']['Tables']['user_tags']['Row'];
type ContractTagRow = Database['public']['Tables']['contract_tags']['Row'];
type ContractTagWithTag = ContractTagRow & {
  tag: Pick<UserTag, 'id' | 'name'>;
};

export default function ContractTags({ contractId }: { contractId: number }) {
  const [contractTags, setContractTags] = useState<ContractTagWithTag[]>([]);
  const [allTags, setAllTags] = useState<Pick<UserTag, 'id' | 'name'>[]>([]);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const userContext = useContext(UserContext);
  const organizationId = userContext?.userMetadata?.organizationId;
  const supabase = createClient();
  const ability = useAbility();
  const canManageTags = ability.can('manage', 'ContractTag');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const fetchTags = async () => {
      if (!organizationId) return;

      const { data: contractTagsData, error: contractTagsError } =
        await supabase
          .from('contract_tags')
          .select(
            'id, contract_id, tag_id, created_at, tag:user_tags(id, name)',
          )
          .eq('contract_id', contractId);

      if (contractTagsError) {
        console.error('Error fetching contract tags:', contractTagsError);
        return;
      }

      const { data: tagsData, error: tagsError } = await supabase
        .from('user_tags')
        .select('*')
        .eq('org_id', organizationId);

      if (tagsError) {
        console.error('Error fetching tags:', tagsError);
        return;
      }

      setContractTags(
        contractTagsData?.filter(
          (item): item is typeof item & { tag: NonNullable<typeof item.tag> } =>
            item.tag !== null,
        ) ?? [],
      );
      setAllTags(tagsData.map((t) => ({ id: t.id, name: t.name })));
    };

    fetchTags();
  }, [contractId, organizationId, supabase]);

  const MAX_TAG_LENGTH = 80;
  const MAX_TAGS_PER_CONTRACT = 10;

  const addTag = async (tagId: number | null, name: string) => {
    if (!organizationId) return;

    try {
      if (contractTags.length >= MAX_TAGS_PER_CONTRACT) {
        console.warn(
          `Maximum number of tags (${MAX_TAGS_PER_CONTRACT}) reached for this contract`,
        );
        setOpen(false);
        return;
      }

      const truncatedName = name.trim().slice(0, MAX_TAG_LENGTH);
      if (truncatedName.length === 0) return;

      let resolvedTagId = tagId;

      // Case-insensitive duplicate check to reuse existing tags
      if (resolvedTagId === null && truncatedName) {
        const existingTag = allTags.find(
          (tag) => tag.name.toLowerCase() === truncatedName.toLowerCase(),
        );

        if (existingTag) {
          resolvedTagId = existingTag.id;
        } else {
          const { data: newTag, error: createError } = await supabase
            .from('user_tags')
            .insert({ name: truncatedName, org_id: organizationId })
            .select()
            .single();

          if (createError) {
            console.error('Error creating tag:', createError);
            return;
          }

          await invalidateVendorListCache();

          resolvedTagId = newTag.id;
          setAllTags((prev) => [...prev, { id: newTag.id, name: newTag.name }]);
        }
      }

      if (resolvedTagId === null) return;

      const { data, error } = await supabase
        .from('contract_tags')
        .insert({ contract_id: contractId, tag_id: resolvedTagId })
        .select('id, contract_id, tag_id, created_at, tag:user_tags(id, name)')
        .single();

      if (error || !data.tag) {
        console.error('Error adding tag to contract:', error);
        return;
      }

      setContractTags((prev) => [...prev, { ...data, tag: data.tag }]);
      setOpen(false);
      setInputValue('');
      startTransition(async () => {
        await invalidateContractSetCache();
      });
    } catch (error) {
      console.error('Error in addTag function:', error);
    }
  };

  const removeTag = async (tagId: number) => {
    try {
      const { error } = await supabase
        .from('contract_tags')
        .delete()
        .eq('contract_id', contractId)
        .eq('tag_id', tagId);

      if (error) {
        console.error('Error removing tag:', error);
        return;
      }

      setContractTags((prev) => prev.filter((tag) => tag.tag_id !== tagId));

      startTransition(async () => {
        await invalidateVendorListCache();
        await invalidateContractSetCache();
      });
    } catch (error) {
      console.error('Error in removeTag function:', error);
    }
  };

  const filteredTags = allTags.filter(
    (tag) =>
      !contractTags.some((ct) => ct.tag_id === tag.id) &&
      tag.name.toLowerCase().includes(inputValue.toLowerCase()),
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {contractTags.map((contractTag) => (
        <Link
          key={contractTag.id}
          href={`/contracts?tags=${encodeURIComponent(contractTag.tag.name.toLowerCase())}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Badge variant="user" className="group/badge flex items-center">
            <span>{contractTag.tag.name}</span>
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
                  removeTag(contractTag.tag_id);
                }}
              >
                <Cross1Icon className="h-3 w-3" />
              </span>
            )}
          </Badge>
        </Link>
      ))}

      {contractTags.length >= MAX_TAGS_PER_CONTRACT ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-6 w-6 rounded-full "
                disabled
              >
                <PlusIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Maximum of {MAX_TAGS_PER_CONTRACT} tags allowed</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="h-6 w-6 rounded-full"
              disabled={!canManageTags}
            >
              <PlusIcon className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="start">
            <p className="font-medium flex items-center justify-between border-b px-3 py-2 text-xs">
              <span>Add Tags</span>
              <span className="font-normal text-muted-foreground">
                {contractTags.length}/{MAX_TAGS_PER_CONTRACT}
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
                      {contractTags.some(
                        (ct) =>
                          ct.tag.name.toLowerCase() ===
                          inputValue.toLowerCase(),
                      ) ? (
                        <div className="my-1 px-2 py-2 text-sm text-muted-foreground">
                          &quot;{inputValue}&quot; is already added to this
                          contract
                        </div>
                      ) : (
                        <div
                          className="my-1 cursor-pointer px-2 py-2 text-sm hover:bg-accent"
                          onClick={() => addTag(null, inputValue)}
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
                        onSelect={() => addTag(tag.id, tag.name)}
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
      )}
      {isPending && <Spinner className="size-4 text-muted-foreground" />}
    </div>
  );
}
