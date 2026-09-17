import { NextRequest, NextResponse } from 'next/server';
import {
  sanitizeError,
  createApiErrorResponse,
  type ErrorContext,
} from '../errors';

export interface ApiErrorHandlerOptions {
  includeRequestContext?: boolean;
  logErrors?: boolean;
}

export function createApiErrorHandler(options: ApiErrorHandlerOptions = {}) {
  const { includeRequestContext = true, logErrors = true } = options;

  return function handleApiError(
    error: unknown,
    req: NextRequest,
    additionalContext?: Partial<ErrorContext>,
  ): NextResponse {
    const context: ErrorContext | undefined = includeRequestContext
      ? {
          requestId: req.headers.get('x-request-id') || crypto.randomUUID(),
          path: req.nextUrl.pathname,
          method: req.method,
          userAgent: req.headers.get('user-agent') || undefined,
          ip: getClientIP(req),
          ...additionalContext,
        }
      : additionalContext;

    const sanitizedError = sanitizeError(error, context);
    const apiResponse = createApiErrorResponse(error, context);

    return NextResponse.json(apiResponse, {
      status: sanitizedError.status,
      headers: {
        'Content-Type': 'application/json',
        ...(context?.requestId && { 'x-request-id': context.requestId }),
      },
    });
  };
}

export const defaultApiErrorHandler = createApiErrorHandler();

export function withErrorHandler<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>,
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      const req = args[0] as NextRequest;
      return defaultApiErrorHandler(error, req);
    }
  };
}

export function withErrorHandlerForRoute(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      return await handler(req, context);
    } catch (error) {
      return defaultApiErrorHandler(error, req, {
        userId: (req as any).user?.id,
      });
    }
  };
}

function getClientIP(req: NextRequest): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = req.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  return undefined;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'API_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

export function throwApiError(
  message: string,
  statusCode: number = 500,
  code?: string,
): never {
  throw new ApiError(message, statusCode, code);
}

export async function safeApiCall<T>(
  operation: () => Promise<T>,
  fallback?: T,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

export function validateRequired<T>(
  value: T | null | undefined,
  fieldName: string,
): T {
  if (value === null || value === undefined) {
    throw new ApiError(
      `${fieldName} is required`,
      400,
      'MISSING_REQUIRED_FIELD',
    );
  }
  return value;
}

export function validateEmail(email: string): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ApiError('Invalid email format', 400, 'INVALID_EMAIL');
  }
  return email;
}

export function validateUUID(uuid: string, fieldName: string = 'ID'): string {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new ApiError(`Invalid ${fieldName} format`, 400, 'INVALID_UUID');
  }
  return uuid;
}
