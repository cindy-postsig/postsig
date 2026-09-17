import { Context } from 'hono';
import { getProductsList } from '@/lib/v2/products/service';
import logger from '@/utils/pino';

export async function listProducts(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const organizationId = userMetadata.organizationId;
    const result = await getProductsList();

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId,
        count: result.count,
      },
      'Products listed',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list products');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
