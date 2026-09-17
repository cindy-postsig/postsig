'use server';

import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';
import {
  EMPTY_COLUMN_LAYOUT_STORE,
  type ColumnLayoutStore,
} from '@/components/contracts/columnLayout';

export type PreferenceKey =
  | 'notifications.contract_uploads'
  | 'contracts.skip_edit_confirmation'
  | 'regional.date_format'
  | 'cpm.column_layouts';

export type PreferencesMap = {
  'notifications.contract_uploads': boolean;
  'contracts.skip_edit_confirmation': boolean;
  'regional.date_format': string | null;
  /** Per-user column order/visibility for every configurable CPM list view. */
  'cpm.column_layouts': ColumnLayoutStore;
};

export type PreferenceValue = PreferencesMap[PreferenceKey];

const DEFAULT_PREFERENCES: PreferencesMap = {
  'notifications.contract_uploads': false,
  'contracts.skip_edit_confirmation': false,
  'regional.date_format': null,
  'cpm.column_layouts': EMPTY_COLUMN_LAYOUT_STORE,
};

export async function getUserPreference<K extends PreferenceKey>(
  userId: string,
  key: K,
): Promise<PreferencesMap[K]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('user_preferences')
      .select('preference_value')
      .eq('user_id', userId)
      .eq('preference_key', key)
      .single();

    if (error || !data) {
      logger.debug(
        { userId, key, error },
        'Preference not found, returning default',
      );
      return DEFAULT_PREFERENCES[key];
    }

    return data.preference_value as PreferencesMap[K];
  } catch (error) {
    logger.error({ userId, key, error }, 'Failed to get user preference');
    return DEFAULT_PREFERENCES[key];
  }
}

export async function getUserPreferences(
  userId: string,
  keys?: PreferenceKey[],
): Promise<Partial<PreferencesMap>> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('user_preferences')
      .select('preference_key, preference_value')
      .eq('user_id', userId);

    if (keys) {
      query = query.in('preference_key', keys);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ userId, keys, error }, 'Failed to get user preferences');
      return {};
    }

    const preferences: Partial<PreferencesMap> = {};
    const mutable = preferences as Record<PreferenceKey, unknown>;

    // Add fetched preferences (ignoring keys we don't recognize)
    data?.forEach((pref) => {
      const key = pref.preference_key as PreferenceKey;
      if (key in DEFAULT_PREFERENCES) {
        mutable[key] = pref.preference_value;
      }
    });

    // Add defaults for missing preferences
    const requestedKeys =
      keys || (Object.keys(DEFAULT_PREFERENCES) as PreferenceKey[]);
    requestedKeys.forEach((key) => {
      if (!(key in preferences)) {
        mutable[key] = DEFAULT_PREFERENCES[key];
      }
    });

    return preferences;
  } catch (error) {
    logger.error({ userId, keys, error }, 'Failed to get user preferences');
    return {};
  }
}

/**
 * Set user preference value (server action)
 */
export async function setUserPreference<K extends PreferenceKey>(
  userId: string,
  key: K,
  value: PreferencesMap[K],
): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: userId,
        preference_key: key,
        preference_value: value,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,preference_key',
      },
    );

    if (error) {
      logger.error(
        { userId, key, value, error },
        'Failed to set user preference',
      );
      return false;
    }

    logger.info({ userId, key, value }, 'User preference updated');
    return true;
  } catch (error) {
    logger.error(
      { userId, key, value, error },
      'Failed to set user preference',
    );
    return false;
  }
}

export async function setUserPreferences(
  userId: string,
  preferences: Partial<PreferencesMap>,
): Promise<boolean> {
  try {
    const supabase = await createClient();

    const updates = Object.entries(preferences).map(([key, value]) => ({
      user_id: userId,
      preference_key: key as PreferenceKey,
      preference_value: value,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('user_preferences').upsert(updates, {
      onConflict: 'user_id,preference_key',
    });

    if (error) {
      logger.error(
        { userId, preferences, error },
        'Failed to set user preferences',
      );
      return false;
    }

    logger.info({ userId, preferences }, 'User preferences updated');
    return true;
  } catch (error) {
    logger.error(
      { userId, preferences, error },
      'Failed to set user preferences',
    );
    return false;
  }
}

/**
 * Delete a user preference so it falls back to the default (server action).
 */
export async function deleteUserPreference<K extends PreferenceKey>(
  userId: string,
  key: K,
): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('user_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('preference_key', key);

    if (error) {
      logger.error({ userId, key, error }, 'Failed to delete user preference');
      return false;
    }

    logger.info({ userId, key }, 'User preference deleted');
    return true;
  } catch (error) {
    logger.error({ userId, key, error }, 'Failed to delete user preference');
    return false;
  }
}
