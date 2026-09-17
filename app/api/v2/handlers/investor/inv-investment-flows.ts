import { Context } from 'hono';
import { getInvInvestmentFlows } from '@/lib/v2/inv/service';
import logger from '@/utils/pino';

/**
 * GET /api/v2/investor/inv/investment-flows
 * Lightweight investment-flow transactions (date, amount, fund) for the
 * dashboard Investments chart.
 */
export async function listInvInvestmentFlows(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const result = await getInvInvestmentFlows();

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        count: result.flows.length,
      },
      'Inv investment flows listed',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list inv investment flows');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
