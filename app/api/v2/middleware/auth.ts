import { Context, Next } from 'hono';
import { createClient } from '@/utils/supabase/server';
import { getUserMetadata } from '@/data/users';
import { validateOrganization } from '@/lib/api/validators';
import logger from '@/utils/pino';

export async function postsigApiKeyMiddleware(c: Context, next: Next) {
  const apiKey = c.req.header('x-api-key')?.trim();
  const expected = process.env.POSTSIG_API_KEY;

  if (!expected) {
    logger.error('POSTSIG_API_KEY env var is not set');
    return c.json({ error: 'Internal server error' }, 500);
  }

  if (!apiKey || apiKey !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
}

export async function authMiddleware(c: Context, next: Next) {
  const supabase = await createClient();
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    validateOrganization(userMetadata);
  } catch (error) {
    logger.warn(
      {
        err: error,
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
      },
      'Organization validation failed',
    );
    return c.json({ error: 'Organization not found' }, 404);
  }

  c.set('userMetadata', userMetadata);
  c.set('supabase', supabase);
  await next();
}

export async function postsigAuthMiddleware(c: Context, next: Next) {
  const userMetadata = c.get('userMetadata');
  if (!userMetadata?.assistantEnabled) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
}

export async function portcoKpisMiddleware(c: Context, next: Next) {
  const userMetadata = c.get('userMetadata');
  if (!userMetadata?.portcoKpisEnabled) {
    return c.json(
      { error: 'The KPIs module is not enabled for this organization' },
      403,
    );
  }
  await next();
}
