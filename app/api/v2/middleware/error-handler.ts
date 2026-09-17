import { Context, Next } from 'hono';
import logger from '@/utils/pino';

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    logger.error({ err, path: c.req.path }, 'API error');

    return c.json(
      {
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err : undefined,
      },
      500,
    );
  }
}
