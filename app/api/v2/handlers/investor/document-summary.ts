import { Context } from 'hono';
import { getVentureDocumentSummary } from '@/lib/v2/investor/service';
import logger from '@/utils/pino';

export async function getVentureDocumentSummaryHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const result = await getVentureDocumentSummary();

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        hasDocuments: result.summary.hasDocuments,
        count: result.summary.documentCount,
      },
      'Venture document summary retrieved',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get venture document summary');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
