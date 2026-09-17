import { Context } from 'hono';
import { getReportSummary, type ReportSummary } from '@/lib/v2/reports/service';
import { reportConfigs } from '@/app/(app)/(cpm)/reports/reportConfigs';
import logger from '@/utils/pino';

export async function getReportSummaryHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const reportType = c.req.param('type');

    if (!reportType) {
      return c.json({ error: 'Report type is required' }, 400);
    }

    const config = reportConfigs[reportType as keyof typeof reportConfigs];
    if (!config) {
      return c.json({ error: 'Invalid report type' }, 400);
    }

    const result: ReportSummary = await getReportSummary(reportType);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        reportType,
        count: result.count,
      },
      'Report summary fetched',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch report summary');
    return c.json({ error: 'Internal server error' }, 500);
  }
}
