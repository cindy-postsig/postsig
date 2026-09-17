import { Hono } from 'hono';
import { listProducts } from '../handlers/products/list';

export const productsRouter = new Hono();

productsRouter.get('/', listProducts);
