import type { Context } from 'hono';
import { getModuleArchives } from '@/lib/v2/archives/service';
import logger from '@/utils/pino';

export async function listModuleArchives(c: Context) {
  try {
    const moduleCode = c.req.query('module');
    if (!moduleCode) {
      return c.json({ error: 'Missing module query parameter' }, 400);
    }

    const result = await getModuleArchives(moduleCode);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list module archives');
    return c.json({ error: 'Failed to fetch archives' }, 500);
  }
}
