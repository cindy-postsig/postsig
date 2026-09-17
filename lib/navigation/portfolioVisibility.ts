import { cache } from 'react';
import { isFeatureEnabled } from '@/lib/flagkit';
import logger from '@/utils/pino';

/**
 * Whether the Portfolio nav item and pages should be hidden for this user,
 * driven by the `hide-portfolio` feature flag. The flag rule targets `userId`
 * and/or `organizationId`, so both are passed into the evaluation context.
 *
 * Fails open (returns false = shown) if flag evaluation throws, so a flag-store
 * error never locks a user out of Portfolio. Server-side only — the flag's
 * targeting list must never reach the client bundle.
 *
 * Wrapped in React.cache so the layout and the rendered investor page dedupe
 * the flag lookup within a single request. Cached on primitive args (not an
 * object literal, which would be a fresh identity on every call).
 */
export const isPortfolioHidden = cache(
  async (
    userId: string | null | undefined,
    organizationId: string | null | undefined,
  ): Promise<boolean> => {
    if (!userId) return false;
    try {
      return await isFeatureEnabled('hide-portfolio', {
        userId,
        organizationId: organizationId ?? '',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to evaluate hide-portfolio feature flag');
      return false;
    }
  },
);
