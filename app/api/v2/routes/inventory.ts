import { Hono } from 'hono';
import { listInventory } from '../handlers/inventory/list';

export const inventoryRouter = new Hono();

inventoryRouter.get('/', listInventory);
