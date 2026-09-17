import { Context } from 'hono';
import { getContract } from '@/lib/v2';
import logger from '@/utils/pino';

export async function getContractHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const contract = await getContract(contractId);

    if (!contract) {
      return c.json({ error: 'Contract not found' }, 404);
    }

    logger.info(
      {
        userId: userMetadata.userId,
        contractId,
      },
      'Contract fetched',
    );

    return c.json({ contract });
  } catch (error) {
    logger.error({ error }, 'Failed to get contract');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
