import { Context } from 'hono';
import { getCalendarData } from '@/lib/v2/calendar/service';
import logger from '@/utils/pino';

export async function listCalendar(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const organizationId = userMetadata.organizationId;

    // Get optional date range from query params
    const start = c.req.query('start');
    const end = c.req.query('end');
    const range = start && end ? { start, end } : undefined;

    const result = await getCalendarData(range);

    logger.info(
      {
        userId: userMetadata.userId,
        organizationId,
        count: result.count,
        range,
      },
      'Calendar data listed',
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list calendar data');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
