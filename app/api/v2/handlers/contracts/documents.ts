import { Context } from 'hono';
import { getContractDocuments } from '@/lib/v2/contracts/documents';
import logger from '@/utils/pino';

export async function getContractDocumentsHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const result = await getContractDocuments(contractId);

    logger.info(
      { userId: userMetadata.userId, contractId, count: result.count },
      'Contract documents fetched',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get contract documents');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
