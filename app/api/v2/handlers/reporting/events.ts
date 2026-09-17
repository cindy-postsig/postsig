import { Context } from 'hono';
import logger from '@/utils/pino';
import { getKpiEvents } from '@/lib/v2/kpis/events';
import { callerFrom } from './context';

export async function listKpiEventsHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const companyId = parseInt(c.req.query('companyId') ?? '', 10);
    if (isNaN(companyId)) {
      return c.json({ error: 'Invalid company ID' }, 400);
    }

    const kpiEvents = await getKpiEvents(companyId);
    return c.json({ kpiEvents });
  } catch (error) {
    logger.error({ error }, 'Failed to list KPI events');
    return c.json({ error: 'Failed to load KPI updates.' }, 500);
  }
}
