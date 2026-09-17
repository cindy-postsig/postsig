/**
 * Chat Router
 *
 * Hono routes for chat functionality.
 */

import { Hono } from 'hono';
import { streamChat } from '../handlers/chat/stream';
import {
  listSessions,
  createSession,
  updateSession,
  deleteSession,
} from '../handlers/chat/persistence/sessions';
import { listMessages } from '../handlers/chat/persistence/messages';
import { getWelcome } from '../handlers/chat/welcome';

export const chatRouter = new Hono();

// Streaming chat endpoint (existing)
chatRouter.post('/stream', streamChat);

// Chat sessions endpoints
chatRouter.get('/sessions', listSessions);
chatRouter.post('/sessions', createSession);
chatRouter.patch('/sessions/:id', updateSession);
chatRouter.delete('/sessions/:id', deleteSession);

// Chat messages endpoint
chatRouter.get('/messages', listMessages);

// Welcome data endpoint
chatRouter.get('/welcome', getWelcome);
