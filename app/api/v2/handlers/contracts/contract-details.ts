import { Context } from 'hono';
import { getContract, updateContract } from '@/lib/v2';
import logger from '@/utils/pino';

export async function getContractDetailsHandler(c: Context) {
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
      'Contract details retrieved',
    );

    return c.json(contract);
  } catch (error) {
    logger.error({ error }, 'Failed to get contract details');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}

export async function updateContractDetailsHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const body = await c.req.json();

    await updateContract(contractId, body);

    logger.info(
      {
        userId: userMetadata.userId,
        contractId,
      },
      'Contract details updated',
    );

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update contract details');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
