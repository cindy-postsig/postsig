import { Context } from 'hono';
import logger from '@/utils/pino';
import { getOrgUsers } from '@/lib/v2/users/service';
import { checkAbility } from '@/data/user-permissions';
import { validateUUID, ApiError } from '@/lib/middleware/errorHandler';

export async function getOrgUsersHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const orgId = c.req.param('id') ?? '';

    validateUUID(orgId, 'organization ID');

    if (orgId !== userMetadata.organizationId) {
      logger.error(
        { userId: userMetadata.userId, requestedOrgId: orgId },
        'Org users requested for another organization',
      );
      return c.json({ error: 'Forbidden' }, 403);
    }

    // The roster is the organization's address book, so it follows the same
    // boundary as the sharing dialogs it exists to populate.
    if (!(await checkAbility('share', 'Contract'))) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const users = await getOrgUsers(orgId, {
      currentUserEmail: userMetadata?.userProfile?.email,
    });

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: orgId,
        count: users.length,
      },
      'Org users fetched',
    );

    return c.json({ users });
  } catch (error) {
    // validateUUID raises an ApiError carrying 400; without this it would
    // reach the caller as a 500.
    if (error instanceof ApiError) {
      return c.json({ error: error.message }, error.statusCode as 400);
    }
    logger.error({ error }, 'Failed to get org users');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
