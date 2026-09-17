import type { Context } from 'hono';
import { getVentureDocuments } from '@/lib/v2/investor/service';
import logger from '@/utils/pino';

export async function listVentureDocuments(c: Context) {
  try {
    const result = await getVentureDocuments();
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list venture documents');
    return c.json({ error: 'Failed to fetch documents' }, 500);
  }
}
