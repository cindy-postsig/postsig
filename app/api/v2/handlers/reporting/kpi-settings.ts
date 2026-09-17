import { Context } from 'hono';
import logger from '@/utils/pino';
import { KpiSettingsError, setHiddenKpiIds } from '@/lib/v2/kpis/kpi-settings';
import { callerFrom, readJson } from './context';

export async function updateKpiSettingsHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const body = await readJson<{ hiddenKpiIds: string[] }>(c);
    if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

    const hiddenKpiIds = await setHiddenKpiIds(body.hiddenKpiIds, caller);
    return c.json({ hiddenKpiIds });
  } catch (error) {
    if (error instanceof KpiSettingsError) {
      return c.json({ error: error.message }, error.status);
    }
    logger.error({ error }, 'Failed to update KPI settings');
    return c.json({ error: 'Failed to update KPI settings.' }, 500);
  }
}
