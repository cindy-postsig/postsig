import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '@/data/users';
import {
  OrganizationPreference,
  VendorWhitelist,
  VendorWhitelistEntry,
} from './types';
import logger from '@/utils/pino';

export async function getOrganizationPreference<T = unknown>(
  preferenceKey: string,
): Promise<OrganizationPreference<T> | null> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.organizationId) {
    throw new Error('User not authenticated');
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('org_preferences' as never)
    .select('*')
    .eq('organization_id', userMetadata.organizationId)
    .eq('preference_key', preferenceKey)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    logger.error(
      { error, preferenceKey, organizationId: userMetadata.organizationId },
      'Failed to fetch organization preference',
    );
    throw new Error('Failed to fetch organization preference');
  }

  return {
    id: (data as Record<string, unknown>).id as string,
    organizationId: (data as Record<string, unknown>).organization_id as string,
    preferenceKey: (data as Record<string, unknown>).preference_key as string,
    preferenceValue: (data as Record<string, unknown>).preference_value as T,
    createdAt: (data as Record<string, unknown>).created_at as string,
    updatedAt: (data as Record<string, unknown>).updated_at as string,
  };
}

export async function upsertOrganizationPreference<T = unknown>(
  preferenceKey: string,
  preferenceValue: T,
): Promise<OrganizationPreference<T>> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.organizationId) {
    throw new Error('User not authenticated');
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('org_preferences' as never)
    .upsert(
      {
        organization_id: userMetadata.organizationId,
        preference_key: preferenceKey,
        preference_value: preferenceValue as unknown,
      } as never,
      {
        onConflict: 'organization_id,preference_key',
      },
    )
    .select()
    .single();

  if (error) {
    logger.error(
      { error, preferenceKey, organizationId: userMetadata.organizationId },
      'Failed to upsert organization preference',
    );
    throw new Error('Failed to save organization preference');
  }

  return {
    id: (data as Record<string, unknown>).id as string,
    organizationId: (data as Record<string, unknown>).organization_id as string,
    preferenceKey: (data as Record<string, unknown>).preference_key as string,
    preferenceValue: (data as Record<string, unknown>).preference_value as T,
    createdAt: (data as Record<string, unknown>).created_at as string,
    updatedAt: (data as Record<string, unknown>).updated_at as string,
  };
}

export async function deleteOrganizationPreference(
  preferenceKey: string,
): Promise<void> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.organizationId) {
    throw new Error('User not authenticated');
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('org_preferences' as never)
    .delete()
    .eq('organization_id', userMetadata.organizationId)
    .eq('preference_key', preferenceKey);

  if (error) {
    logger.error(
      { error, preferenceKey, organizationId: userMetadata.organizationId },
      'Failed to delete organization preference',
    );
    throw new Error('Failed to delete organization preference');
  }
}

export async function getVendorWhitelist(): Promise<VendorWhitelist> {
  const preference =
    await getOrganizationPreference<VendorWhitelist>('vendor_whitelist');
  return preference?.preferenceValue ?? [];
}

export async function addVendorToWhitelist(
  entry: VendorWhitelistEntry,
): Promise<VendorWhitelist> {
  const currentWhitelist = await getVendorWhitelist();

  const existingIndex = currentWhitelist.findIndex(
    (e) => e.email.toLowerCase() === entry.email.toLowerCase(),
  );

  if (existingIndex >= 0) {
    currentWhitelist[existingIndex] = entry;
  } else {
    currentWhitelist.push(entry);
  }

  const updated = await upsertOrganizationPreference(
    'vendor_whitelist',
    currentWhitelist,
  );

  return updated.preferenceValue;
}

export async function removeVendorFromWhitelist(
  email: string,
): Promise<VendorWhitelist> {
  const currentWhitelist = await getVendorWhitelist();

  const filtered = currentWhitelist.filter(
    (entry) => entry.email.toLowerCase() !== email.toLowerCase(),
  );

  if (filtered.length === currentWhitelist.length) {
    return currentWhitelist;
  }

  const updated = await upsertOrganizationPreference(
    'vendor_whitelist',
    filtered,
  );

  return updated.preferenceValue;
}

export async function replaceVendorWhitelist(
  newWhitelist: VendorWhitelist,
): Promise<VendorWhitelist> {
  const updated = await upsertOrganizationPreference(
    'vendor_whitelist',
    newWhitelist,
  );

  return updated.preferenceValue;
}

export async function mergeVendorsToWhitelist(
  entries: VendorWhitelistEntry[],
): Promise<{
  whitelist: VendorWhitelist;
  added: number;
  updated: number;
}> {
  const currentWhitelist = await getVendorWhitelist();
  const emailMap = new Map(
    currentWhitelist.map((e) => [e.email.toLowerCase(), e]),
  );

  let added = 0;
  let updated = 0;

  entries.forEach((entry) => {
    const normalizedEmail = entry.email.toLowerCase();
    if (emailMap.has(normalizedEmail)) {
      updated++;
    } else {
      added++;
    }
    emailMap.set(normalizedEmail, entry);
  });

  const mergedWhitelist = Array.from(emailMap.values());

  const result = await upsertOrganizationPreference(
    'vendor_whitelist',
    mergedWhitelist,
  );

  return {
    whitelist: result.preferenceValue,
    added,
    updated,
  };
}

export async function getPostsigEmailAddress(): Promise<{
  preference: OrganizationPreference<boolean> | null;
  postsigEmailAddress: string | null;
}> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata?.organizationId) {
    throw new Error('User not authenticated');
  }
  const organizationId = userMetadata.organizationId;
  const supabase = createServiceClient();
  const [preferenceValue, orgData] = await Promise.all([
    getOrganizationPreference('emails.client_uploads'),
    supabase
      .from('organizations')
      .select('postsig_email_address')
      .eq('id', organizationId)
      .single(),
  ]);

  if (orgData.error) {
    logger.error(
      { error: orgData.error, organizationId },
      'Failed to get postsig email address',
    );
    return {
      preference: null,
      postsigEmailAddress: null,
    };
  }

  return {
    preference:
      preferenceValue as unknown as OrganizationPreference<boolean> | null,
    postsigEmailAddress: orgData.data?.postsig_email_address ?? null,
  };
}
