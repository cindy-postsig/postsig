import { Context } from 'hono';
import { getMultipleReportSummaries } from '@/lib/v2/reports/service';
import logger from '@/utils/pino';

export async function getReportSummariesHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const typesParam = c.req.query('types');

    if (!typesParam) {
      return c.json({ error: 'Missing types parameter' }, 400);
    }

    const reportTypes = typesParam.split(',').map((t) => t.trim());
    const result = await getMultipleReportSummaries(reportTypes);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        reportTypes,
      },
      'Report summaries fetched',
    );

    return c.json(result);
  } catch (error) {
    logger.error(
      {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to fetch report summaries',
    );
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
