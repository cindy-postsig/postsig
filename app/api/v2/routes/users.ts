import { Hono } from 'hono';
import { getOrgUsersHandler } from '../handlers/users/org-users';

export const usersRouter = new Hono();

// Get users for a specific org
usersRouter.get('/org/:id', getOrgUsersHandler);
