import { Context } from 'hono';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { loadOwnersCatalog } from '@/lib/v2/owners/catalog';

export async function getOwnersCatalogHandler(c: Context) {
  try {
    const { organizationId } = c.get('userMetadata');
    const catalog = await loadOwnersCatalog(organizationId);
    return c.json(catalog);
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error) },
      'Failed to load the owners catalog',
    );
    return c.json({ error: 'Failed to load the owners catalog' }, 500);
  }
}
