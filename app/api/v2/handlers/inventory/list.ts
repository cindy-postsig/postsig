import { Context } from 'hono';
import { getInventoryList } from '@/lib/v2/inventory/service';
import logger from '@/utils/pino';

export async function listInventory(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const organizationId = userMetadata.organizationId;
    const result = await getInventoryList();

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId,
        count: result.count,
      },
      'Inventory listed',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list inventory');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
