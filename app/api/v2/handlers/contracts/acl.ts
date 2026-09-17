import { Context } from 'hono';
import { getContractACL } from '@/lib/v2';
import logger from '@/utils/pino';

export async function getContractACLHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const result = await getContractACL(contractId);

    logger.info(
      {
        userId: userMetadata.userId,
        contractId,
        userCount: result.contractACL.users.length,
        groupCount: result.contractACL.groups.length,
        folderCount: result.folderACLs.length,
      },
      'Contract ACL fetched',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get contract ACL');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
