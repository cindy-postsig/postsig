import { NextResponse } from 'next/server';
import { getUserMetadata } from '@/data/users';
import { defineAbilitiesFor } from '@postsig/toolkit';
import { isValidClientRole } from '@/lib/auth/roles';
import logger from '@/utils/pino';

type ContractUserMetadata = NonNullable<
  Awaited<ReturnType<typeof getUserMetadata>>
>;

type RequireContractUpdateResult =
  | { userMetadata: ContractUserMetadata; error?: undefined }
  | { userMetadata?: undefined; error: NextResponse };

/**
 * Shared authorization gate for the contract status routes: requires an
 * authenticated user with a valid client role and the `update` ability on
 * `Contract`. Returns the user metadata on success, or an `error` response
 * (401/403) the caller should return as-is.
 */
export async function requireContractUpdateAbility(): Promise<RequireContractUpdateResult> {
  const userMetadata = await getUserMetadata();

  if (!userMetadata) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (!isValidClientRole(userMetadata.userRole)) {
    logger.warn(
      { userId: userMetadata.userId, userRole: userMetadata.userRole },
      'Invalid user role for contract update',
    );
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole,
    organizationId: userMetadata.organizationId,
  });

  if (!ability.can('update', 'Contract')) {
    logger.warn(
      { userId: userMetadata.userId, userRole: userMetadata.userRole },
      'User lacks update permission for contracts',
    );
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { userMetadata };
}
