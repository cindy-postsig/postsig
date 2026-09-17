import { Context } from 'hono';
import { updateContractTags } from '@/lib/v2/tags/service';
import logger from '@/utils/pino';

export async function updateContractTagsHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const body = await c.req.json();
    const tagIds = body.tagIds;

    if (!Array.isArray(tagIds)) {
      return c.json({ error: 'tagIds must be an array' }, 400);
    }

    await updateContractTags(contractId, tagIds);

    logger.info(
      {
        userId: userMetadata.userId,
        contractId,
        tagCount: tagIds.length,
      },
      'Contract tags updated',
    );

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update contract tags');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
