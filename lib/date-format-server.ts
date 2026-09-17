import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { DATE_FORMAT_DEFAULT, isDateFormatPattern } from '@/lib/date-format';
import type { Database } from '@/database.types';

const DATE_FORMAT_PREFERENCE_KEY = 'regional.date_format';

/**
 * Read the organization's default date-fns pattern from `org_preferences`.
 * Uses the service client because `org_preferences` RLS only exposes rows to
 * admins, while every user needs the org default to render dates.
 */
export async function getOrgDateFormatPattern(
  organizationId: string,
): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('org_preferences')
    .select('preference_value')
    .eq('organization_id', organizationId)
    .eq('preference_key', DATE_FORMAT_PREFERENCE_KEY)
    .maybeSingle();

  const value = data?.preference_value;
  return isDateFormatPattern(value) ? value : DATE_FORMAT_DEFAULT;
}

/**
 * Read the user's date-format override pattern from `user_preferences`.
 * Returns the stored pattern only if it is one of the selectable patterns;
 * NULL (no row, or a legacy value) means the user inherits the org default.
 */
export async function getUserDateFormatPattern(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('user_preferences')
    .select('preference_value')
    .eq('user_id', userId)
    .eq('preference_key', DATE_FORMAT_PREFERENCE_KEY)
    .maybeSingle();

  const value = data?.preference_value;
  return isDateFormatPattern(value) ? value : null;
}
