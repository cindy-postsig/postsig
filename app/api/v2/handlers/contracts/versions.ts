import { Context } from 'hono';
import { getLatestVersion } from '@/lib/v2/contracts/documents';
import logger from '@/utils/pino';

export async function getLatestVersionHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const result = await getLatestVersion(contractId);

    logger.info(
      {
        userId: userMetadata.userId,
        contractId,
        hasVersions: result.hasVersions,
      },
      'Contract latest version fetched',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get latest contract version');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
