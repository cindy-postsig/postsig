import { Context } from 'hono';
import logger from '@/utils/pino';
import { getOrgFolders } from '@/lib/v2/folders/service';
import { checkAbility } from '@/data/user-permissions';
import { validateUUID, ApiError } from '@/lib/middleware/errorHandler';

export async function getOrgFoldersHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const orgId = c.req.param('id') ?? '';

    validateUUID(orgId, 'organization ID');

    if (orgId !== userMetadata.organizationId) {
      logger.error(
        { userId: userMetadata.userId, requestedOrgId: orgId },
        'Org folders requested for another organization',
      );
      return c.json({ error: 'Forbidden' }, 403);
    }

    // The full folder tree is the upload destination picker; it names folders a
    // read-only account has no access to.
    if (!(await checkAbility('create', 'Contract'))) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const folders = await getOrgFolders();

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: orgId,
        count: folders.length,
      },
      'Org folders fetched',
    );

    return c.json({ folders });
  } catch (error) {
    // validateUUID raises an ApiError carrying 400; without this it would
    // reach the caller as a 500.
    if (error instanceof ApiError) {
      return c.json({ error: error.message }, error.statusCode as 400);
    }
    logger.error({ error }, 'Failed to get org folders');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
