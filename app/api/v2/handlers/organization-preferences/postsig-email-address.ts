import { verifyAbility } from '@/data/user-permissions';
import logger from '@/utils/pino';
import { Context } from 'hono';
import {
  getPostsigEmailAddress as getPostsigEmailAddressService,
  upsertOrganizationPreference,
} from '@/lib/v2/organization-preferences/service';

export async function getPostsigEmailAddress(c: Context) {
  try {
    await verifyAbility('manage', 'Organization');
    const { preference, postsigEmailAddress } =
      await getPostsigEmailAddressService();
    if (!postsigEmailAddress) {
      return c.json(
        {
          error: 'Postsig email address not found',
        },
        404,
      );
    }
    return c.json({
      preference: preference?.preferenceValue,
      postsigEmailAddress,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get postsig email address');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}

export async function togglePostsigEmailAddress(c: Context) {
  try {
    await verifyAbility('update', 'OrganizationPreference');
    const body = await c.req.json();
    if (typeof body?.value !== 'boolean') {
      return c.json({ error: 'Invalid request: value must be a boolean' }, 400);
    }
    const preference = await upsertOrganizationPreference(
      'emails.client_uploads',
      body.value,
    );
    return c.json(preference);
  } catch (error) {
    logger.error({ error }, 'Failed to toggle postsig email address');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
