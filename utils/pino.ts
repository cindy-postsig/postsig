import pino from 'pino';
import { sanitizeForLogging } from './log-sanitization';

const logger = pino({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  base: {
    env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV,
    revision: process.env.VERCEL_GITHUB_COMMIT_SHA,
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: (error: unknown) => {
      if (error instanceof Error) {
        return sanitizeForLogging(pino.stdSerializers.err(error));
      }
      return sanitizeForLogging(error);
    },
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  formatters: {
    bindings: (bindings) => sanitizeForLogging(bindings),
    log: (object) => sanitizeForLogging(object),
  },
});

export default logger;
