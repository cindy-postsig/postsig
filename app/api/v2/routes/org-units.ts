import { Hono } from 'hono';
import { postBusinessGroupHandler } from '../handlers/org-units';

export const orgUnitsRouter = new Hono();

// The inline "Create new business group…" the employee, owner and allocation
// pickers offer.
orgUnitsRouter.post('/business-groups', postBusinessGroupHandler);
