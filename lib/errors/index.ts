export {
  UserError,
  SystemError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DatabaseError,
  ExternalServiceError,
  isUserError,
  isSystemError,
  isKnownError,
} from './types';

export {
  sanitizeError,
  sanitizeErrorForEnvironment,
  createApiErrorResponse,
  throwUserError,
  throwValidationError,
  throwNotFoundError,
  throwAuthenticationError,
  throwAuthorizationError,
  wrapSystemError,
  isDevelopment,
  type SanitizedError,
  type ErrorContext,
} from './sanitizer';

export * from './types';
export * from './sanitizer';
