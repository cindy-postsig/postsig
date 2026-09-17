import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import {
  BASE_CURRENCY_PREFERENCE_KEY,
  parseBaseCurrency,
  type BaseCurrency,
} from '@/lib/base-currency';

/**
 * Read the organization's base display currency from `org_preferences`.
 * Uses the service client because `org_preferences` RLS only exposes rows to
 * admins, while every user needs the org default to render amounts.
 */
export async function getOrgBaseCurrency(
  organizationId: string,
): Promise<BaseCurrency> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('org_preferences')
    .select('preference_value')
    .eq('organization_id', organizationId)
    .eq('preference_key', BASE_CURRENCY_PREFERENCE_KEY)
    .maybeSingle();

  // AVAILABILITY: a read failure warns and falls through to the USD default
  // rather than throwing or paging. This is a display preference — every page
  // that renders an amount calls this, so failing loud here would take the
  // whole app down to render the wrong currency symbol.
  if (error) {
    logger.warn(
      { error, organizationId },
      'Failed to read org base currency; falling back to the default',
    );
  }

  return parseBaseCurrency(data?.preference_value);
}
