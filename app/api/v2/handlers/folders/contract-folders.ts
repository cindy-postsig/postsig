import { Context } from 'hono';
import { updateContractFolders } from '@/lib/v2/folders/service';
import logger from '@/utils/pino';

export async function updateContractFoldersHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const body = await c.req.json();
    const folderIds = body.folderIds;

    if (!Array.isArray(folderIds)) {
      return c.json({ error: 'folderIds must be an array' }, 400);
    }

    await updateContractFolders(contractId, folderIds);

    logger.info(
      {
        userId: userMetadata.userId,
        contractId,
        folderCount: folderIds.length,
      },
      'Contract folders updated',
    );

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update contract folders');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
