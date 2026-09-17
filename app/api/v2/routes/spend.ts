import { Hono } from 'hono';
import { querySpendHandler } from '../handlers/spend/query';

export const spendRouter = new Hono();

// POST /api/v2/spend — one engine query (spend | renewals | tcv) per request
spendRouter.post('/', querySpendHandler);
