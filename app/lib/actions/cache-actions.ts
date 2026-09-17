'use server';

import { getCacheService } from '@/app/lib/redis/cache-service';
import { getUserMetadata } from '@/data/users';
import { revalidatePath } from 'next/cache';

export async function invalidateVendorListCache() {
  try {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { success: false, error: 'User metadata not found' };
    }
    const cacheService = await getCacheService();
    await cacheService.invalidateVendorList({
      userId: userMetadata.userId,
      organizationId: userMetadata.organizationId,
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to invalidate vendor list cache:', error);
    return { success: false, error: 'Failed to invalidate cache' };
  }
}

export async function invalidateOrganizationDataCache() {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { success: false, error: 'User metadata not found' };
  }
  const cacheService = await getCacheService();
  await cacheService.invalidateOrganizationData(userMetadata);
  return { success: true };
}

export async function invalidateContractSetCache() {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { success: false, error: 'User metadata not found' };
  }
  const cacheService = await getCacheService();
  // Run Redis invalidation in parallel with path revalidation
  await Promise.all([
    cacheService.invalidateContractSetForOrg(userMetadata),
    Promise.resolve(revalidatePath('/contracts', 'layout')),
  ]);
  return { success: true };
}

export async function invalidateContractCache(contractId: number) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return { success: false, error: 'User metadata not found' };
  }
  const cacheService = await getCacheService();
  await cacheService.invalidateContract(contractId, userMetadata);
  return { success: true };
}
