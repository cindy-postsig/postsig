import { Hono } from 'hono';
import { getAssignmentsPayloadHandler } from '../handlers/assignments/payload';

export const assignmentsRouter = new Hono();

// GET /api/v2/assignments?month=YYYY-MM — the page's payload for one month
assignmentsRouter.get('/', getAssignmentsPayloadHandler);
