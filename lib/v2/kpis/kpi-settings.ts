import { cache } from 'react';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';
import { ADMIN_ROLES, type CustomKpiCaller } from './custom-kpis';
import { createOrgReadClient } from './read-client';

const HIDDEN_KPIS_PREFERENCE_KEY = 'reporting.hidden_kpis';

const hiddenKpiIdsSchema = z.array(z.uuid());

// Signals the handler which HTTP status a rejected settings write maps to.
export class KpiSettingsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403,
  ) {
    super(message);
    this.name = 'KpiSettingsError';
  }
}

// The org's hidden KPIs — inv_kpi.public_id strings the org has chosen not to
// track. Absent row means nothing hidden, so every KPI is enabled by default.
export const getHiddenKpiIds = cache(async (): Promise<string[]> => {
  const scope = await createOrgReadClient();
  if (!scope) return [];

  const { data, error } = await scope.supabase
    .from('org_preferences')
    .select('preference_value')
    .eq('organization_id', scope.organizationId)
    .eq('preference_key', HIDDEN_KPIS_PREFERENCE_KEY)
    .maybeSingle();

  if (error) {
    logger.error(
      { error, organizationId: scope.organizationId },
      'Failed to fetch hidden KPIs',
    );
    return [];
  }

  const parsed = hiddenKpiIdsSchema.safeParse(data?.preference_value);
  return parsed.success ? parsed.data : [];
});

export async function setHiddenKpiIds(
  hiddenKpiIds: string[],
  caller: CustomKpiCaller,
): Promise<string[]> {
  if (!ADMIN_ROLES.has(caller.userRole)) {
    throw new KpiSettingsError(
      'You do not have permission to change KPI settings.',
      403,
    );
  }

  const parsed = hiddenKpiIdsSchema.safeParse(hiddenKpiIds);
  if (!parsed.success) {
    throw new KpiSettingsError('Invalid KPI selection.', 400);
  }
  const deduped = Array.from(new Set(parsed.data));

  const supabase = await createClient();
  const { error } = await supabase.from('org_preferences').upsert(
    {
      organization_id: caller.organizationId,
      preference_key: HIDDEN_KPIS_PREFERENCE_KEY,
      preference_value: deduped,
    },
    { onConflict: 'organization_id,preference_key' },
  );

  if (error) {
    logger.error(
      { error, organizationId: caller.organizationId },
      'Failed to save hidden KPIs',
    );
    throw new Error('Failed to save KPI settings.');
  }

  return deduped;
}
