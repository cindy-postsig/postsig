export class UserError extends Error {
  public readonly code: string;
  public readonly isUserError = true;

  constructor(message: string, code: string = 'USER_ERROR') {
    super(message);
    this.name = 'UserError';
    this.code = code;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UserError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      isUserError: this.isUserError,
    };
  }
}

export class SystemError extends Error {
  public readonly code: string;
  public readonly isSystemError = true;
  public readonly originalError?: Error;

  constructor(
    message: string,
    code: string = 'SYSTEM_ERROR',
    originalError?: Error,
  ) {
    super(message);
    this.name = 'SystemError';
    this.code = code;
    this.originalError = originalError;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SystemError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      isSystemError: this.isSystemError,
      originalError: this.originalError,
    };
  }
}

export class ValidationError extends UserError {
  public readonly field?: string;

  constructor(
    message: string,
    field?: string,
    code: string = 'VALIDATION_ERROR',
  ) {
    super(message, code);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class AuthenticationError extends UserError {
  constructor(
    message: string = 'Authentication required',
    code: string = 'AUTH_ERROR',
  ) {
    super(message, code);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends UserError {
  constructor(
    message: string = 'Access denied',
    code: string = 'AUTHORIZATION_ERROR',
  ) {
    super(message, code);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends UserError {
  constructor(resource: string = 'Resource', code: string = 'NOT_FOUND') {
    super(`${resource} not found`, code);
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends SystemError {
  constructor(
    message: string = 'Database operation failed',
    originalError?: Error,
  ) {
    super(message, 'DATABASE_ERROR', originalError);
    this.name = 'DatabaseError';
  }
}

/**
 * A contract lineage write violated the same-org / related-vendor invariant.
 * Deterministic in the inputs, so retrying cannot change the outcome — job
 * boundaries convert it into a non-retriable failure.
 */
export class ContractLineageInvariantError extends SystemError {
  constructor(message: string) {
    super(message, 'CONTRACT_LINEAGE_INVARIANT');
    this.name = 'ContractLineageInvariantError';
  }
}

export class ExternalServiceError extends SystemError {
  public readonly service: string;

  constructor(
    service: string,
    message: string = 'External service error',
    originalError?: Error,
  ) {
    super(message, 'EXTERNAL_SERVICE_ERROR', originalError);
    this.name = 'ExternalServiceError';
    this.service = service;
  }
}

/**
 * An external service rejected the call because its usage allowance is spent.
 * Retrying cannot change the outcome until the allowance resets or is raised,
 * so job boundaries convert it into a non-retriable failure.
 */
export class ExternalServiceQuotaError extends ExternalServiceError {
  constructor(service: string, message: string, originalError?: Error) {
    super(service, message, originalError);
    this.name = 'ExternalServiceQuotaError';
  }
}

export function isUserError(error: unknown): error is UserError {
  return (
    error instanceof Error &&
    'isUserError' in error &&
    error.isUserError === true
  );
}

export function isSystemError(error: unknown): error is SystemError {
  return (
    error instanceof Error &&
    'isSystemError' in error &&
    error.isSystemError === true
  );
}

export function isKnownError(error: unknown): error is UserError | SystemError {
  return isUserError(error) || isSystemError(error);
}
