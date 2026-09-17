import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { isDateFormatPattern } from '@/lib/date-format';
import {
  parseColumnLayoutStore,
  COLUMN_LAYOUTS_PREFERENCE_KEY,
  type ColumnLayoutStore,
} from '@/components/contracts/columnLayout';
import logger from '@/utils/pino';

const DATE_FORMAT_PREFERENCE_KEY = 'regional.date_format';

export type UserRenderPreferences = {
  /** NULL means the user inherits the org default. */
  dateFormatPattern: string | null;
  columnLayouts: ColumnLayoutStore;
};

/**
 * Read every `user_preferences` row the app needs to render a page, in one
 * query, so adding column layouts costs no extra round trip.
 *
 * `user_preferences` RLS is self-scoped on `auth.uid() = user_id` for all four
 * verbs, so the caller's own client is correct here — unlike `org_preferences`,
 * which needs a service client for reads.
 */
export async function getUserRenderPreferences(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UserRenderPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preference_key, preference_value')
    .eq('user_id', userId)
    .in('preference_key', [
      DATE_FORMAT_PREFERENCE_KEY,
      COLUMN_LAYOUTS_PREFERENCE_KEY,
    ]);

  if (error) {
    logger.error({ userId, error }, 'Failed to read user render preferences');
  }

  const byKey = new Map(
    (data ?? []).map((row) => [row.preference_key, row.preference_value]),
  );

  const datePattern = byKey.get(DATE_FORMAT_PREFERENCE_KEY);

  return {
    dateFormatPattern: isDateFormatPattern(datePattern) ? datePattern : null,
    columnLayouts: parseColumnLayoutStore(
      byKey.get(COLUMN_LAYOUTS_PREFERENCE_KEY),
    ),
  };
}
