'use server';

import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';
import {
  parseColumnLayout,
  parseColumnLayoutStore,
  isColumnLayoutViewKey,
  COLUMN_LAYOUTS_PREFERENCE_KEY,
  EMPTY_COLUMN_LAYOUT_STORE,
  type ColumnLayout,
  type ColumnLayoutStore,
  type ColumnLayoutViewKey,
} from '@/components/contracts/columnLayout';

export type SaveListViewColumnsResult = {
  ok: boolean;
  /** The merged store as persisted, so the caller can reconcile. */
  store: ColumnLayoutStore;
};

/**
 * Persist one view's column layout, or clear it with `layout: null`.
 *
 * All views share a single `user_preferences` row, so this read-modify-writes
 * the whole blob server-side rather than trusting the client's copy of it.
 * That closes the common case — a second tab's layout is re-read here, not
 * sent up — but it is still last-writer-wins across genuinely concurrent
 * requests: two saves for different views inside the same round trip can lose
 * one. Making that impossible needs a `jsonb_set` write in Postgres, which is
 * not worth it for a per-user UI preference.
 *
 * Clearing deletes the view's entry rather than storing today's defaults, so a
 * user who reverts still picks up future changes to that view's default set.
 */
export async function saveListViewColumns(
  viewKey: ColumnLayoutViewKey,
  layout: ColumnLayout | null,
): Promise<SaveListViewColumnsResult> {
  if (!isColumnLayoutViewKey(viewKey)) {
    logger.warn({ viewKey }, 'Rejected list view columns save: unknown view');
    return { ok: false, store: EMPTY_COLUMN_LAYOUT_STORE };
  }

  const normalised = layout === null ? null : parseColumnLayout(layout);
  if (layout !== null && normalised === null) {
    logger.warn({ viewKey }, 'Rejected list view columns save: invalid layout');
    return { ok: false, store: EMPTY_COLUMN_LAYOUT_STORE };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, store: EMPTY_COLUMN_LAYOUT_STORE };
    }

    const { data: existing } = await supabase
      .from('user_preferences')
      .select('preference_value')
      .eq('user_id', user.id)
      .eq('preference_key', COLUMN_LAYOUTS_PREFERENCE_KEY)
      .maybeSingle();

    const current = parseColumnLayoutStore(existing?.preference_value);
    const views = { ...current.views };

    if (normalised) views[viewKey] = normalised;
    else delete views[viewKey];

    const store: ColumnLayoutStore = { version: 1, views };

    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: user.id,
        preference_key: COLUMN_LAYOUTS_PREFERENCE_KEY,
        preference_value: store,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,preference_key' },
    );

    if (error) {
      logger.error({ viewKey, error }, 'Failed to save list view columns');
      return { ok: false, store: current };
    }

    return { ok: true, store };
  } catch (error) {
    logger.error({ viewKey, error }, 'Failed to save list view columns');
    return { ok: false, store: EMPTY_COLUMN_LAYOUT_STORE };
  }
}
