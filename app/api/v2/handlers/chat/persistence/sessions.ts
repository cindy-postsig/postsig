/**
 * Chat Sessions Handlers
 *
 * Handles CRUD operations for chat sessions.
 */

import { Context } from 'hono';
import {
  getChatSessions,
  createChatSession,
  updateChatSessionTitle,
  deleteChatSession,
} from '@/lib/v2/chat/persistence';
import logger from '@/utils/pino';

/**
 * GET /api/v2/chat/sessions
 * List all chat sessions for the current user
 */
export async function listSessions(c: Context) {
  try {
    const result = await getChatSessions();
    return c.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list chat sessions');
    return c.json({ error: 'Failed to fetch chat sessions' }, 500);
  }
}

/**
 * POST /api/v2/chat/sessions
 * Create a new chat session
 */
export async function createSession(c: Context) {
  try {
    const body = await c.req.json();
    const result = await createChatSession({
      title: body.title,
    });
    return c.json(result, 201);
  } catch (error) {
    logger.error({ error }, 'Failed to create chat session');
    return c.json({ error: 'Failed to create chat session' }, 500);
  }
}

/**
 * PATCH /api/v2/chat/sessions/:id
 * Update a chat session's title
 */
export async function updateSession(c: Context) {
  try {
    const id = parseInt(c.req.param('id') ?? '', 10);
    if (isNaN(id)) {
      return c.json({ error: 'Invalid session ID' }, 400);
    }

    const body = await c.req.json();
    if (!body.title || typeof body.title !== 'string') {
      return c.json({ error: 'Title is required' }, 400);
    }

    const session = await updateChatSessionTitle({
      sessionId: id,
      title: body.title,
    });
    return c.json({ session });
  } catch (error) {
    logger.error({ error }, 'Failed to update chat session');
    return c.json({ error: 'Failed to update chat session' }, 500);
  }
}

/**
 * DELETE /api/v2/chat/sessions/:id
 * Delete a chat session
 */
export async function deleteSession(c: Context) {
  try {
    const id = parseInt(c.req.param('id') ?? '', 10);
    if (isNaN(id)) {
      return c.json({ error: 'Invalid session ID' }, 400);
    }

    await deleteChatSession(id);
    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete chat session');
    return c.json({ error: 'Failed to delete chat session' }, 500);
  }
}
