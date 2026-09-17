import { ContractFolder } from '@/app/api/v2/types/api';
import { getUserMetadata } from '@/data/users';
import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';

/** Update folders for a contract
 * - Adds new folders
 * - Removes folders no longer in the list
 */
export async function updateContractFolders(
  contractId: number,
  folderIds: number[],
): Promise<void> {
  const supabase = await createClient();
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new Error('User metadata not found');
  }

  // Fetch existing folder associations
  const { data: existingData, error: fetchError } = await supabase
    .from('folder_contracts')
    .select('folder_id')
    .eq('contract_id', contractId)
    .eq('organization_id', userMetadata.organizationId);

  if (fetchError) {
    logger.error(
      { error: fetchError, contractId },
      'Failed to fetch existing contract folders',
    );
    throw fetchError;
  }

  const existingFolderIds = new Set(
    (existingData || []).map((item: any) => item.folder_id),
  );
  const newFolderIds = new Set(folderIds);

  // Determine folders to add and remove
  const foldersToAdd = folderIds.filter((id) => !existingFolderIds.has(id));
  const foldersToRemove = Array.from(existingFolderIds).filter(
    (id) => !newFolderIds.has(id),
  );

  // Add new folder associations
  for (const folderId of foldersToAdd) {
    const { error: insertError } = await supabase
      .from('folder_contracts')
      .insert({
        contract_id: contractId,
        folder_id: folderId,
        organization_id: userMetadata.organizationId,
      });

    if (insertError) {
      logger.error(
        { error: insertError, contractId, folderId },
        'Failed to add folder to contract',
      );
      throw insertError;
    }
  }

  // Remove old folder associations
  for (const folderId of foldersToRemove) {
    const { error: deleteError } = await supabase
      .from('folder_contracts')
      .delete()
      .eq('contract_id', contractId)
      .eq('folder_id', folderId)
      .eq('organization_id', userMetadata.organizationId);

    if (deleteError) {
      logger.error(
        { error: deleteError, contractId, folderId },
        'Failed to remove folder from contract',
      );
      throw deleteError;
    }
  }

  logger.info(
    {
      contractId,
      added: foldersToAdd.length,
      removed: foldersToRemove.length,
    },
    'Contract folders updated',
  );
}

/**
 * Get folders for a specific organization
 */
export async function getOrgFolders(): Promise<ContractFolder[]> {
  const supabase = await createClient();
  const userMetadata = await getUserMetadata();

  if (!userMetadata) {
    return [];
  }
  const organizationId = userMetadata.organizationId;

  const { data, error } = await supabase
    .from('folders')
    .select(`id, name, public_uuid`)
    .eq('organization_id', organizationId);

  if (error) {
    logger.error({ error, organizationId }, 'Failed to fetch org folders');
    throw error;
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    name: item.name || '',
    publicUuid: item.public_uuid || '',
  }));
}
