import { Context } from 'hono';
import { getContractActivities } from '@/lib/v2/contracts/activities';
import logger from '@/utils/pino';

export async function getContractActivitiesHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const result = await getContractActivities(contractId);

    logger.info(
      { userId: userMetadata.userId, contractId, count: result.count },
      'Contract activities fetched',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get contract activities');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
