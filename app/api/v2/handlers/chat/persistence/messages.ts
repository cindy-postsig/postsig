/**
 * Chat Messages Handlers
 *
 * Read access to a session's messages. Writes happen in the stream handler,
 * which owns the conversation history.
 */

import { Context } from 'hono';
import { getChatMessages } from '@/lib/v2/chat/persistence';
import logger from '@/utils/pino';

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? undefined : parsed;
}

/**
 * GET /api/v2/chat/messages?sessionId=123&limit=50&offset=0
 * Get messages for a chat session with optional pagination
 */
export async function listMessages(c: Context) {
  try {
    const sessionIdParam = c.req.query('sessionId');
    if (!sessionIdParam) {
      return c.json({ error: 'sessionId query parameter is required' }, 400);
    }

    const sessionId = parseInt(sessionIdParam, 10);
    if (isNaN(sessionId)) {
      return c.json({ error: 'Invalid sessionId' }, 400);
    }

    const limit = parsePositiveInt(c.req.query('limit'));
    const offset = parsePositiveInt(c.req.query('offset'));
    const pagination =
      limit !== undefined || offset !== undefined
        ? { limit, offset }
        : undefined;

    const result = await getChatMessages(sessionId, pagination);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list chat messages');
    return c.json({ error: 'Failed to fetch chat messages' }, 500);
  }
}
