import { isFeatureEnabled } from '@/lib/flagkit';
import logger from '@/utils/pino';

export const COST_ALLOCATION_FLAG_KEY = 'cost-allocation';

export interface CostAllocationFlagContext {
  organizationId: string;
  userId?: string;
}

/**
 * Per-org rollout of Cost Allocation: the admin app's `cost-allocation` flag,
 * evaluated for the requesting org (and user, so a rule can also target
 * people). Evaluated server-side and passed down as a boolean, so the client
 * bundle never sees the flag or its targeting.
 *
 * FF_COST_ALLOCATION=true bypasses the evaluation entirely whenever it is
 * set — the local override for a dev database with no flag rows, and the
 * only thing the env var still does. Fails closed like the SDK: an
 * evaluation error hides the feature rather than exposing it.
 */
export async function isCostAllocationEnabled(
  context: CostAllocationFlagContext,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  if (env.FF_COST_ALLOCATION === 'true') return true;
  try {
    return await isFeatureEnabled(COST_ALLOCATION_FLAG_KEY, {
      organizationId: context.organizationId,
      userId: context.userId ?? '',
    });
  } catch (error) {
    logger.error(
      { error, organizationId: context.organizationId },
      'Failed to evaluate cost-allocation feature flag',
    );
    return false;
  }
}
