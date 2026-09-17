import { Context } from 'hono';
import { getInvCoInvestorNetwork } from '@/lib/v2/inv/service';
import logger from '@/utils/pino';

/**
 * GET /api/v2/investor/inv/co-investors
 * Org-wide co-investor network, ranked by shared portfolio companies, for the
 * dashboard Top Co-Investors widget.
 */
export async function listInvCoInvestors(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const network = await getInvCoInvestorNetwork();

    const coInvestors = [...network.values()].sort(
      (a, b) =>
        b.companiesCoinvested - a.companiesCoinvested ||
        (b.totalCoinvested ?? 0) - (a.totalCoinvested ?? 0),
    );

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        count: coInvestors.length,
      },
      'Inv co-investors listed',
    );

    return c.json({ coInvestors });
  } catch (error) {
    logger.error({ error }, 'Failed to list inv co-investors');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
