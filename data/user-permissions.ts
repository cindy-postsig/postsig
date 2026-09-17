'use server';

import {
  SubjectType,
  Action,
  RoleId,
  assertPermission,
  defineAbilitiesFor,
  canUser,
  AppAbility,
} from '@postsig/toolkit';
import { AuthorizationError } from '@/lib/errors';
import { getUserMetadata } from '@/data/users';

export async function verifyAbility(
  action: Action,
  subject: SubjectType,
): Promise<{
  userId: string;
  organizationId: string;
  organizationName: string;
}> {
  const userMetadata = await getUserMetadata();

  if (!userMetadata?.userId || !userMetadata.organizationId) {
    throw new AuthorizationError('User not authenticated');
  }

  const ability = defineAbilitiesFor({
    roleId: userMetadata.userRole as RoleId,
    id: userMetadata.userId,
    organizationId: userMetadata.organizationId,
  });

  assertPermission(ability, action, subject);

  return {
    userId: userMetadata.userId,
    organizationId: userMetadata.organizationId,
    organizationName: userMetadata.organizationName || '',
  };
}

/**
 * Get ability instance for the current user without checking permissions
 * Use this when you need to check multiple permissions in a single component
 */
export async function getAbilityForCurrentUser(): Promise<AppAbility | null> {
  const userMetadata = await getUserMetadata();

  if (!userMetadata?.userId || !userMetadata.organizationId) {
    return null;
  }

  return defineAbilitiesFor({
    roleId: userMetadata.userRole as RoleId,
    id: userMetadata.userId,
    organizationId: userMetadata.organizationId,
  });
}

/**
 * Check if current user can perform an action without throwing
 * Returns false if user is not authenticated
 */
export async function checkAbility(
  action: Action,
  subject: SubjectType,
): Promise<boolean> {
  const ability = await getAbilityForCurrentUser();
  if (!ability) return false;
  return canUser(ability, action, subject);
}
