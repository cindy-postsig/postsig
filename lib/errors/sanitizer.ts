import {
  UserError,
  SystemError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  isUserError,
  isSystemError,
} from './types';
import logger from '../../utils/pino';
import { sanitizeForLogging } from '../../utils/log-sanitization';

export interface SanitizedError {
  message: string;
  code: string;
  status: number;
}

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
}

export function sanitizeError(
  error: unknown,
  context?: ErrorContext,
): SanitizedError {
  if (isUserError(error)) {
    return {
      message: error.message,
      code: error.code,
      status: getStatusCodeForUserError(error),
    };
  }

  if (isSystemError(error)) {
    logSystemError(error, context);
    return {
      message: 'An unexpected error occurred. Please try again later.',
      code: 'INTERNAL_ERROR',
      status: 500,
    };
  }

  if (error instanceof Error) {
    logSystemError(
      new SystemError(error.message, 'UNKNOWN_ERROR', error),
      context,
    );
    return {
      message: 'An unexpected error occurred. Please try again later.',
      code: 'INTERNAL_ERROR',
      status: 500,
    };
  }

  logSystemError(
    new SystemError('Unknown error occurred', 'UNKNOWN_ERROR'),
    context,
  );
  return {
    message: 'An unexpected error occurred. Please try again later.',
    code: 'INTERNAL_ERROR',
    status: 500,
  };
}

function getStatusCodeForUserError(error: UserError): number {
  switch (error.name) {
    case 'ValidationError':
      return 400;
    case 'AuthenticationError':
      return 401;
    case 'AuthorizationError':
      return 403;
    case 'NotFoundError':
      return 404;
    default:
      return 400;
  }
}

function logSystemError(error: SystemError, context?: ErrorContext): void {
  const logData = {
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
      originalError: error.originalError
        ? {
            name: error.originalError.name,
            message: error.originalError.message,
            stack: error.originalError.stack,
          }
        : undefined,
    },
    context: context ? sanitizeContext(context) : undefined,
    timestamp: new Date().toISOString(),
  };

  const sanitizedLogData = sanitizeForLogging(logData);
  logger.error(sanitizedLogData, 'System error occurred');
}

function sanitizeContext(context: ErrorContext): Partial<ErrorContext> {
  return {
    userId: context.userId,
    requestId: context.requestId,
    path: context.path,
    method: context.method,
    userAgent: context.userAgent
      ? context.userAgent.substring(0, 200)
      : undefined,
    ip: context.ip ? context.ip.replace(/\d+$/, 'XXX') : undefined,
  };
}

export function createApiErrorResponse(error: unknown, context?: ErrorContext) {
  const sanitized = sanitizeError(error, context);

  return {
    error: {
      message: sanitized.message,
      code: sanitized.code,
    },
  };
}

export function throwUserError(message: string, code?: string): never {
  throw new UserError(message, code);
}

export function throwValidationError(message: string, field?: string): never {
  throw new ValidationError(message, field);
}

export function throwNotFoundError(resource?: string): never {
  throw new NotFoundError(resource);
}

export function throwAuthenticationError(message?: string): never {
  throw new AuthenticationError(message);
}

export function throwAuthorizationError(message?: string): never {
  throw new AuthorizationError(message);
}

export function wrapSystemError(
  error: Error,
  message?: string,
  code?: string,
): SystemError {
  return new SystemError(
    message || 'System error occurred',
    code || 'SYSTEM_ERROR',
    error,
  );
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function sanitizeErrorForEnvironment(
  error: unknown,
  context?: ErrorContext,
): SanitizedError {
  if (isDevelopment()) {
    if (error instanceof Error) {
      return {
        message: error.message,
        code: isKnownError(error) ? (error as any).code : 'DEV_ERROR',
        status: isUserError(error) ? getStatusCodeForUserError(error) : 500,
      };
    }
  }

  return sanitizeError(error, context);
}

function isKnownError(error: unknown): error is UserError | SystemError {
  return isUserError(error) || isSystemError(error);
}
