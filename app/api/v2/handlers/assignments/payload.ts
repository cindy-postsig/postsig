import type { Context } from 'hono';
import type { UserMetadata } from '@/constants/types';
import { isAssignmentsEnabled } from '@/lib/v2/assignments/flag';
import { loadAssignmentsPage } from '@/lib/v2/assignments/service';
import type { AssignmentsPayload } from '@/lib/v2/assignments/types';
import { isAssignmentsMonth } from '@/lib/v2/assignments/window';
import logger from '@/utils/pino';

export interface AssignmentsPayloadResponse {
  payload: AssignmentsPayload;
}

/**
 * One month of the Assignments page, so the stepper can re-price without a
 * server-component round trip. The flag answers 404 rather than 403: an org
 * without the feature has no such route, exactly as the page itself 404s.
 */
export async function getAssignmentsPayloadHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata') as UserMetadata;
    if (!(await isAssignmentsEnabled(userMetadata))) {
      return c.json({ error: 'Not found' }, 404);
    }

    const month = c.req.query('month');
    if (!isAssignmentsMonth(month)) {
      return c.json({ error: 'Invalid month, expected YYYY-MM' }, 400);
    }

    const payload = await loadAssignmentsPage(userMetadata, { month });
    return c.json({ payload });
  } catch (error) {
    logger.error({ err: error }, 'Failed to load the assignments payload');
    return c.json({ error: 'Internal server error' }, 500);
  }
}
