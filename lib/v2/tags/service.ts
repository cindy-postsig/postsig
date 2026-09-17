import { ContractTag } from '@/app/api/v2/types/api';
import { getUserMetadata } from '@/data/users';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { revalidatePath } from 'next/cache';
import { DatabaseError } from '@/lib/errors';

/**
 * Update tags for a specific contract
 * @param contractId - The ID of the contract
 * @param tagIds - An array of tag IDs to associate with the contract
 * @returns A promise that resolves when the operation is complete
 */
export async function updateContractTags(
  contractId: number,
  tagIds: number[],
): Promise<void> {
  const supabase = await createClient();
  const userMetadata = await getUserMetadata();

  if (!userMetadata) {
    throw new Error('User metadata not found');
  }

  const { data: existingTags, error: fetchError } = await supabase
    .from('contract_tags')
    .select(`tag_id, user_tags (id, name, org_id)`)
    .eq('contract_id', contractId)
    .eq('user_tags.org_id', userMetadata.organizationId);

  if (fetchError) {
    logger.error(
      { error: fetchError, contractId, orgId: userMetadata.organizationId },
      'Error fetching existing contract tags',
    );
    throw new Error('Failed to fetch existing contract tags');
  }

  const existingTagIds = new Set(existingTags?.map((tag) => tag.tag_id) || []);

  const tagsToAdd = tagIds.filter((tagId) => !existingTagIds.has(tagId));
  const tagsToRemove = Array.from(existingTagIds).filter(
    (tagId) => !tagIds.includes(tagId),
  );

  logger.debug(
    {
      contractId,
      tagIds,
      existingTagIds: Array.from(existingTagIds),
      tagsToAdd,
      tagsToRemove,
    },
    'Tag update calculation',
  );

  if (tagsToAdd.length > 0) {
    const insertData = tagsToAdd.map((tagId) => ({
      contract_id: contractId,
      tag_id: tagId,
    }));

    const { error: insertError } = await supabase
      .from('contract_tags')
      .insert(insertData);

    if (insertError) {
      logger.error(
        { error: insertError, contractId, tagIds: tagsToAdd },
        'Error adding contract tags',
      );

      throw new Error('Failed to add contract tags');
    }
  }

  if (tagsToRemove.length > 0) {
    const { data: deleted, error: deleteError } = await supabase
      .from('contract_tags')
      .delete()
      .eq('contract_id', contractId)
      .in('tag_id', tagsToRemove);

    if (deleteError) {
      logger.error(
        { error: deleteError, contractId, tagsToRemove },
        'Error removing contract tags',
      );
      throw new Error('Failed to remove contract tags');
    }
  }

  // Invalidate contract cache so the updated tags show up
  if (tagsToAdd.length > 0 || tagsToRemove.length > 0) {
    const cacheService = await getCacheService();
    await cacheService.invalidateContractSetForOrg(userMetadata);
    revalidatePath('/contracts');
    logger.info(
      {
        contractId,
        tagsAdded: tagsToAdd.length,
        tagsRemoved: tagsToRemove.length,
      },
      'Contract cache invalidated after tag update',
    );
  }
}

/**
 * Get tags for a specific organization
 * @param organizationId - The ID of the organization
 * @returns A promise that resolves to an array of contract tags
 */
export async function getOrgTags(
  organizationId: string,
): Promise<ContractTag[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('user_tags')
    .select('id, name')
    .eq('org_id', organizationId);

  if (error) {
    logger.error({ error }, 'Error fetching organization tags');
    throw new Error('Failed to fetch organization tags');
  }

  return (data || []).map((item) => ({
    id: item.id,
    name: item.name,
  }));
}

export async function getEntityTags(entityId: number): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inv_company')
    .select('tags')
    .eq('id', entityId)
    .single();

  if (error) {
    logger.error({ error, entityId }, 'Error fetching entity tags');
    throw new DatabaseError('Failed to fetch entity tags');
  }

  return data?.tags ?? [];
}

export async function updateEntityTags(
  entityId: number,
  tags: string[],
  organizationId?: string,
): Promise<void> {
  const supabase = await createClient();

  if (organizationId) {
    const { data: existingOrgTags, error: lookupError } = await supabase
      .from('user_tags')
      .select('name')
      .eq('org_id', organizationId);

    if (lookupError) {
      logger.warn(
        { error: lookupError, organizationId },
        'Failed to fetch org tags; skipping org tag creation',
      );
    } else {
      const existingNames = new Set(
        (existingOrgTags || []).map((t) => t.name.toLowerCase()),
      );
      const newTagNames = tags.filter(
        (tag) => !existingNames.has(tag.toLowerCase()),
      );

      if (newTagNames.length > 0) {
        const { error: insertError } = await supabase
          .from('user_tags')
          .insert(
            newTagNames.map((name) => ({ name, org_id: organizationId })),
          );

        if (insertError) {
          logger.warn(
            { error: insertError, organizationId, newTagNames },
            'Failed to create new org tags',
          );
        }
      }
    }
  }

  const { error } = await supabase
    .from('inv_company')
    .update({ tags })
    .eq('id', entityId);

  if (error) {
    logger.error({ error, entityId }, 'Error updating entity tags');
    throw new DatabaseError('Failed to update entity tags');
  }

  revalidatePath('/investor/portfolio');
  logger.info({ entityId, tagCount: tags.length }, 'Entity tags updated');
}
