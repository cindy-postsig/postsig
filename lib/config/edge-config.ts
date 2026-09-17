import { get } from '@vercel/edge-config';
import logger from '@/utils/pino';

/**
 * Check whether the LineageAI Assistant should be enabled for the given context.
 * Returns true if the user is a PostSig employee OR their organization is in
 * the Edge Config allowlist (`assistantEnabledOrgIds`).
 *
 * Fail-closed: on error, non-PostSig users are denied.
 */
export async function isAssistantEnabled(
  organizationId: string | undefined,
  isPostsig: boolean,
): Promise<boolean> {
  if (isPostsig) return true;

  if (!organizationId) return false;

  try {
    const allowedOrgIds = await get<string[]>('assistantEnabledOrgIds');

    if (!Array.isArray(allowedOrgIds)) return false;

    return allowedOrgIds.includes(organizationId);
  } catch (error) {
    logger.error(
      { error, organizationId },
      'Failed to read assistantEnabledOrgIds from Edge Config',
    );
    return false;
  }
}
