'use server';

import { createClient } from '@/utils/supabase/server';
import { unstable_noStore as noStore } from 'next/cache';
import { getUserMetadata } from '@/data/users';
import {
  fetchVendorCountByUserRoles,
  fetchVendorListByUserRoles,
  fetchVendorNamesByUserRoles,
} from '@/data/superuser/vendors';
import { getCacheService } from '../redis/cache-service';

export async function fetchVendorList(userMetadata?: any) {
  const metadata = userMetadata || (await getUserMetadata());
  const cacheService = await getCacheService();
  const cachedVendors = await cacheService.getVendorList();
  if (cachedVendors) {
    return { vendors: cachedVendors };
  }
  const { vendors: vendorsList } = await fetchVendorListByUserRoles(metadata);
  await cacheService.cacheVendorList(vendorsList);
  return { vendors: vendorsList };
}

export async function fetchVendorNames(userId?: string) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new Error('User metadata not found');
  }
  return fetchVendorNamesByUserRoles(userMetadata);
}

export async function fetchVendorCount() {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new Error('User metadata not found');
  }
  return fetchVendorCountByUserRoles(userMetadata);
}

export async function fetchContractCount() {
  const supabase = await createClient();
  noStore();
  try {
    let { count, error } = await supabase
      .from('contracts')
      .select('*', { count: 'exact' });
    return count;
  } catch (error) {
    console.error('Supabase Error:', error);
    throw new Error('Failed to count vendors.');
  }
}
