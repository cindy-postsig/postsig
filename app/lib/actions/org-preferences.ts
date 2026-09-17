'use server';

import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';
import {
  CostCalculationMethod,
  DEFAULT_COST_CALCULATION_METHOD,
} from '@/lib/settings/cost-calculation-method';
import { BASE_CURRENCY_DEFAULT, type BaseCurrency } from '@/lib/base-currency';
import {
  ORG_UNIT_TREE_LEVELS,
  type OrgUnitTreeLevel,
} from '@/lib/v2/org-units/levels';

export type OrgPreferenceKey =
  | 'emails.client_uploads'
  | 'employees.hierarchy_levels'
  | 'regional.date_format'
  | 'regional.currency'
  | 'reporting.hidden_kpis'
  | 'reporting.cost_calculation_method';

export type OrgPreferenceValue = boolean;

export type OrgPreferencesMap = {
  'emails.client_uploads': OrgPreferenceValue;
  'employees.hierarchy_levels': OrgUnitTreeLevel[];
  'regional.date_format': string;
  'regional.currency': BaseCurrency;
  'reporting.hidden_kpis': string[];
  'reporting.cost_calculation_method': CostCalculationMethod;
};

const DEFAULT_PREFERENCES: OrgPreferencesMap = {
  'emails.client_uploads': false,
  // Static fallback only; the org-units sync derives the org-specific default
  // from roster data (getOrgHierarchyLevelOrder) when no row exists.
  'employees.hierarchy_levels': [...ORG_UNIT_TREE_LEVELS],
  'regional.date_format': 'yyyy-MM-dd',
  'regional.currency': BASE_CURRENCY_DEFAULT,
  'reporting.hidden_kpis': [],
  'reporting.cost_calculation_method': DEFAULT_COST_CALCULATION_METHOD,
};

export async function getOrgPreference<K extends OrgPreferenceKey>(
  organizationId: string,
  key: K,
): Promise<OrgPreferencesMap[K]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('org_preferences')
      .select('preference_value')
      .eq('organization_id', organizationId)
      .eq('preference_key', key)
      .single();

    if (error || !data) {
      logger.debug(
        { organizationId, key, error },
        'Preference not found, returning default',
      );
      return structuredClone(DEFAULT_PREFERENCES[key]);
    }

    return data.preference_value as OrgPreferencesMap[K];
  } catch (error) {
    logger.error(
      { organizationId, key, error },
      'Failed to get organization preference',
    );
    return structuredClone(DEFAULT_PREFERENCES[key]);
  }
}

export async function getOrgPreferences(
  organizationId: string,
  keys?: OrgPreferenceKey[],
): Promise<Partial<OrgPreferencesMap>> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('org_preferences')
      .select('preference_key, preference_value')
      .eq('organization_id', organizationId);

    if (keys) {
      query = query.in('preference_key', keys);
    }

    const { data, error } = await query;

    if (error) {
      logger.error(
        { organizationId, keys, error },
        'Failed to get organization preferences',
      );
      return {};
    }

    const preferences: Partial<OrgPreferencesMap> = {};
    const mutable = preferences as Record<OrgPreferenceKey, unknown>;

    // Add fetched preferences (ignoring keys we don't recognize)
    data?.forEach((pref) => {
      const key = pref.preference_key as OrgPreferenceKey;
      if (key in DEFAULT_PREFERENCES) {
        mutable[key] = pref.preference_value;
      }
    });

    // Add defaults for missing preferences
    const requestedKeys =
      keys || (Object.keys(DEFAULT_PREFERENCES) as OrgPreferenceKey[]);
    requestedKeys.forEach((key) => {
      if (!(key in preferences)) {
        mutable[key] = structuredClone(DEFAULT_PREFERENCES[key]);
      }
    });

    return preferences;
  } catch (error) {
    logger.error(
      { organizationId, keys, error },
      'Failed to get organization preferences',
    );
    return {};
  }
}

/**
 * Set organization preference value (server action)
 */
export async function setOrgPreference<K extends OrgPreferenceKey>(
  organizationId: string,
  key: K,
  value: OrgPreferencesMap[K],
): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from('org_preferences').upsert(
      {
        organization_id: organizationId,
        preference_key: key,
        preference_value: value,
      },
      {
        onConflict: 'organization_id,preference_key',
      },
    );

    if (error) {
      logger.error(
        { organizationId, key, value, error },
        'Failed to set organization preference',
      );
      return false;
    }

    logger.info(
      { organizationId, key, value },
      'Organization preference updated',
    );
    return true;
  } catch (error) {
    logger.error(
      { organizationId, key, value, error },
      'Failed to set organization preference',
    );
    return false;
  }
}

export async function setOrgPreferences(
  organizationId: string,
  preferences: Partial<OrgPreferencesMap>,
): Promise<boolean> {
  try {
    const supabase = await createClient();

    const updates = Object.entries(preferences).map(([key, value]) => ({
      organization_id: organizationId,
      preference_key: key as OrgPreferenceKey,
      preference_value: value,
    }));

    const { error } = await supabase.from('org_preferences').upsert(updates, {
      onConflict: 'organization_id,preference_key',
    });

    if (error) {
      logger.error(
        { organizationId, preferences, error },
        'Failed to set organization preferences',
      );
      return false;
    }

    logger.info(
      { organizationId, preferences },
      'Organization preferences updated',
    );
    return true;
  } catch (error) {
    logger.error(
      { organizationId, preferences, error },
      'Failed to set organization preferences',
    );
    return false;
  }
}
