import { Context } from 'hono';
import { z } from 'zod';
import { updateEntityTags, getEntityTags } from '@/lib/v2/tags/service';
import logger from '@/utils/pino';
import type { UserMetadata } from '@/constants/types';

const updateEntityTagsSchema = z.object({
  tags: z.array(z.string().min(1)),
});

export async function getEntityTagsHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata') as UserMetadata | undefined;
    if (!userMetadata?.organizationId) {
      return c.json({ error: 'Organization context required' }, 400);
    }

    const entityId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(entityId)) {
      return c.json({ error: 'Invalid entity ID' }, 400);
    }

    const tags = await getEntityTags(entityId);

    return c.json({ tags });
  } catch (error) {
    logger.error({ error }, 'Failed to get entity tags');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}

export async function updateEntityTagsHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata') as UserMetadata | undefined;
    if (!userMetadata?.organizationId) {
      return c.json({ error: 'Organization context required' }, 400);
    }

    const entityId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(entityId)) {
      return c.json({ error: 'Invalid entity ID' }, 400);
    }

    const parsed = updateEntityTagsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'tags must be an array of strings' }, 400);
    }
    const { tags } = parsed.data;

    await updateEntityTags(entityId, tags, userMetadata.organizationId);

    logger.info(
      { userId: userMetadata.userId, entityId, tagCount: tags.length },
      'Entity tags updated',
    );

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update entity tags');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
