import { Context } from 'hono';
import { getReportData } from '@/lib/v2/reports/service';
import { reportConfigs } from '@/app/(app)/(cpm)/reports/reportConfigs';
import logger from '@/utils/pino';

export async function listReportData(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const reportType = c.req.param('type');

    if (!reportType) {
      return c.json({ error: 'Report type is required' }, 400);
    }

    const activeTab = c.req.query('activeTab');

    // Get valueField from reportConfig
    const config = reportConfigs[reportType as keyof typeof reportConfigs];
    if (!config) {
      return c.json({ error: 'Invalid report type' }, 404);
    }
    const valueField = config?.valueField || 'totalContractValue';

    // Get range from user metadata for renewal reports
    const range = userMetadata.userProfile?.advance_notice_period || 90;

    const result = await getReportData(reportType, {
      activeTab,
      valueField,
      range,
    });

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        reportType,
        count: result.contracts.length,
      },
      'Report data fetched',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch report data');
    return c.json({ error: 'Internal server error' }, 500);
  }
}
