import { Context } from 'hono';
import { getContractCitations } from '@/lib/v2/contracts/citations';
import logger from '@/utils/pino';

export async function getContractCitationsHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const result = await getContractCitations(contractId);

    logger.info(
      { userId: userMetadata.userId, contractId, count: result.count },
      'Contract citations fetched',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get contract citations');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
