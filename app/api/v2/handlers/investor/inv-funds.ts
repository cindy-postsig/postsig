import { Context } from 'hono';
import { getInvPortfolioFunds } from '@/lib/v2/inv/service';
import logger from '@/utils/pino';

/**
 * GET /api/v2/investor/inv/funds
 * List the funds tagged to the user's visible portfolio companies.
 */
export async function listInvFunds(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const organizationId = userMetadata.organizationId;
    const result = await getInvPortfolioFunds();

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId,
        count: result.count,
      },
      'Inv funds listed',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list inv funds');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
