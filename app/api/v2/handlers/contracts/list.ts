import { Context } from 'hono';
import {
  getContractsList,
  type ContractsListOptions,
} from '@/lib/v2/contracts/service';
import logger from '@/utils/pino';

export async function listContracts(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const organizationId = userMetadata.organizationId;

    const statusParam = c.req.query('status');
    const options: ContractsListOptions = {};
    if (statusParam === 'all') {
      options.status = 'all';
    }

    const result = await getContractsList(options);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId,
        count: result.count,
      },
      'Contracts listed',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list contracts');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
