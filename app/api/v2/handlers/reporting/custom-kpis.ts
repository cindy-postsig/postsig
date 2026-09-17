import { Context } from 'hono';
import logger from '@/utils/pino';
import {
  createCustomKpi,
  deactivateCustomKpi,
  getCustomKpiUsage,
  setKpiValue,
  type CreateCustomKpiInput,
  type SetKpiValueInput,
} from '@/lib/v2/kpis/custom-kpis';
import {
  getCompanyCustomKpis,
  getCompanyStandardKpiOverrides,
} from '@/lib/v2/kpis/service';
import { callerFrom, readJson } from './context';

export async function listCustomKpisHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const companyId = parseInt(c.req.query('companyId') ?? '', 10);
    if (isNaN(companyId)) {
      return c.json({ error: 'Invalid company ID' }, 400);
    }

    const [customKpis, standardOverrides] = await Promise.all([
      getCompanyCustomKpis(companyId),
      getCompanyStandardKpiOverrides(companyId),
    ]);
    return c.json({ customKpis, standardOverrides });
  } catch (error) {
    logger.error({ error }, 'Failed to list custom KPIs');
    return c.json({ error: 'Failed to load custom KPIs.' }, 500);
  }
}

export async function createCustomKpiHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const body = await readJson<CreateCustomKpiInput>(c);
    if (!body) return c.json({ error: 'Invalid JSON body' }, 400);
    const result = await createCustomKpi(body, caller);
    if ('error' in result) return c.json(result, 400);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to create custom KPI');
    return c.json({ error: 'Failed to create the custom KPI.' }, 500);
  }
}

export async function setKpiValueHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const publicId = c.req.param('publicId');
    if (!publicId) return c.json({ error: 'Invalid KPI ID' }, 400);
    const body = await readJson<Omit<SetKpiValueInput, 'publicId'>>(c);
    if (!body) return c.json({ error: 'Invalid JSON body' }, 400);
    const result = await setKpiValue({ ...body, publicId }, caller);
    if ('error' in result) return c.json(result, 400);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to set KPI value');
    return c.json({ error: 'Failed to save the value.' }, 500);
  }
}

export async function customKpiUsageHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const publicId = c.req.param('publicId');
    if (!publicId) return c.json({ error: 'Invalid KPI ID' }, 400);

    const result = await getCustomKpiUsage(publicId, caller);
    if ('error' in result) return c.json(result, 400);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to read custom KPI usage');
    return c.json({ error: 'Could not check where this KPI is used.' }, 500);
  }
}

export async function deactivateCustomKpiHandler(c: Context) {
  try {
    const caller = callerFrom(c);
    if (!caller) return c.json({ error: 'Organization context required' }, 400);

    const publicId = c.req.param('publicId');
    if (!publicId) return c.json({ error: 'Invalid KPI ID' }, 400);

    const result = await deactivateCustomKpi(publicId, caller);
    if ('error' in result) return c.json(result, 400);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to remove custom KPI');
    return c.json({ error: 'Failed to remove the custom KPI.' }, 500);
  }
}
