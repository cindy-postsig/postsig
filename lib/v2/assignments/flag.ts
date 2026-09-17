import { isFeatureEnabled } from '@/lib/flagkit';
import logger from '@/utils/pino';

export const ASSIGNMENTS_FLAG_KEY = 'assignments';

export interface AssignmentsFlagContext {
  organizationId: string;
  userId?: string;
}

/**
 * Per-org rollout of Assignments: the admin app's `assignments` flag,
 * evaluated for the requesting org (and user, so a rule can also target
 * people). Evaluated server-side and passed down as a boolean, so the client
 * bundle never sees the flag or its targeting.
 *
 * Separate from the cost-allocation flag even though the page prices from
 * resolved allocations: the two roll out on their own schedules, and an org
 * running cost allocation is not thereby ready for this view.
 *
 * FF_ASSIGNMENTS=true bypasses the evaluation entirely whenever it is set —
 * the local override for a dev database with no flag rows. Fails closed like
 * the SDK: an evaluation error hides the feature rather than exposing it.
 */
export async function isAssignmentsEnabled(
  context: AssignmentsFlagContext,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  if (env.FF_ASSIGNMENTS === 'true') return true;
  try {
    return await isFeatureEnabled(ASSIGNMENTS_FLAG_KEY, {
      organizationId: context.organizationId,
      userId: context.userId ?? '',
    });
  } catch (error) {
    logger.error(
      { error, organizationId: context.organizationId },
      'Failed to evaluate assignments feature flag',
    );
    return false;
  }
}
