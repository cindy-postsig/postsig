import { getBusinessGroupNodes } from '@/lib/v2/org-units';
import { Context } from 'hono';
import logger from '@/utils/pino';
import { validateUUID } from '@/lib/middleware/errorHandler';
import { checkAbility } from '@/data/user-permissions';

export async function getOrgGroups(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');

    const orgId = c.req.param('id') ?? '';

    validateUUID(orgId, 'organization ID');

    // The node lookup runs on the service client, so the caller-supplied org id
    // has to be checked here — RLS is no longer doing it.
    if (orgId !== userMetadata.organizationId) {
      logger.error(
        { userId: userMetadata.userId, requestedOrgId: orgId },
        'Org business groups requested for another organization',
      );
      return c.json({ error: 'Forbidden' }, 403);
    }

    // These nodes are the HR structure behind the employee pickers, so they
    // follow the same boundary as the employee directory itself.
    if (!(await checkAbility('manage', 'Organization'))) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const groups = await getBusinessGroupNodes(orgId);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: orgId,
        count: groups.length,
      },
      'Org business groups fetched',
    );

    return c.json({ groups });
  } catch (error) {
    logger.error({ error }, 'Failed to get org business groups');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
