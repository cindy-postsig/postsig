import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import {
  DEFAULT_COST_CALCULATION_METHOD,
  resolveCostCalculationMethod,
} from '@/lib/settings/cost-calculation-method';
import {
  costMethodFromSetting,
  type CostMethod,
} from '@/components/budget/costMethod';

const COST_METHOD_PREFERENCE_KEY = 'reporting.cost_calculation_method';

/**
 * Resolves the org-wide default cost calculation method (psk-1877) into the
 * engine's vocabulary, for server components to seed the method selector on
 * every surface that has one.
 *
 * Uses the service client because `org_preferences` RLS only exposes rows to
 * admins/supervisors, while EVERY member — viewers included — needs the org
 * default to see the same numbers (QA 2026-08-05: viewers fell back to
 * Contract Term while admins saw Amortized). Same pattern as
 * `getOrgDateFormatPattern`; only reads bypass RLS — writes stay on the
 * user client, so who can CHANGE the setting is unchanged.
 *
 * The stored value is narrowed rather than trusted: an unrecognised jsonb
 * value falls back to the default instead of reaching the engine.
 */
export async function getDefaultCostMethod(
  organizationId: string | null | undefined,
): Promise<CostMethod> {
  if (!organizationId) {
    return costMethodFromSetting(DEFAULT_COST_CALCULATION_METHOD);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('org_preferences')
    .select('preference_value')
    .eq('organization_id', organizationId)
    .eq('preference_key', COST_METHOD_PREFERENCE_KEY)
    .maybeSingle();

  // A failed read falls back like a missing row — a display default must not
  // take the page down — but is logged so a systematic failure is visible.
  if (error) {
    logger.warn(
      { organizationId, error },
      'Failed to read default cost calculation method; using default',
    );
  }

  return costMethodFromSetting(
    resolveCostCalculationMethod(data?.preference_value),
  );
}
