/**
 * Chat Welcome Handler
 *
 * Returns contextual data for the chat welcome message.
 */

import { Context } from 'hono';
import { getWelcomeData } from '@/lib/v2/chat/welcome';
import { warmOrgNamesCache } from '@/lib/v2/users/service';
import logger from '@/utils/pino';

/**
 * GET /api/v2/chat/welcome
 * Get welcome data for the chat interface
 */
export async function getWelcome(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const meta =
      typeof userMetadata === 'object' && userMetadata !== null
        ? (userMetadata as Record<string, unknown>)
        : null;
    const organizationId =
      typeof meta?.organizationId === 'string'
        ? meta.organizationId
        : undefined;
    const userId = typeof meta?.userId === 'string' ? meta.userId : undefined;
    const userRole =
      typeof meta?.userRole === 'number' ? meta.userRole : undefined;
    if (organizationId) warmOrgNamesCache(organizationId);
    const data = await getWelcomeData(organizationId, userId, userRole);
    return c.json({ data });
  } catch (error) {
    logger.error({ error }, 'Failed to get chat welcome data');
    return c.json({ error: 'Failed to fetch welcome data' }, 500);
  }
}
