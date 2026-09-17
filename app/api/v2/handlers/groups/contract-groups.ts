import { Context } from 'hono';
import { getContractBusinessGroups } from '@/lib/v2/groups/service';
import logger from '@/utils/pino';

export async function getContractGroups(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const groups = await getContractBusinessGroups(contractId);

    logger.info(
      {
        userId: userMetadata.userId,
        contractId,
        count: groups.length,
      },
      'Contract business groups fetched',
    );

    return c.json({ groups });
  } catch (error) {
    logger.error({ error }, 'Failed to get contract business groups');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
