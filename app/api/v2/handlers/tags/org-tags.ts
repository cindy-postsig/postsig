import { Context } from 'hono';
import logger from '@/utils/pino';
import { getOrgTags } from '@/lib/v2/tags/service';
import { validateUUID } from '@/lib/middleware/errorHandler';

export const getOrgTagsHandler = async (c: Context) => {
  try {
    const userMetadata = c.get('userMetadata');

    const orgId = c.req.param('id') ?? '';

    validateUUID(orgId, 'organization ID');

    if (orgId !== userMetadata.organizationId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const tags = await getOrgTags(orgId);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: orgId,
        count: tags.length,
      },
      'Fetched organization tags successfully',
    );

    return c.json({ tags }, 200);
  } catch (error) {
    logger.error({ error }, 'Failed to get org tags');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
};
