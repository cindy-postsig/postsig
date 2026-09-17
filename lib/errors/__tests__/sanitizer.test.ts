import {
  sanitizeError,
  sanitizeErrorForEnvironment,
  createApiErrorResponse,
  throwUserError,
  throwValidationError,
  throwNotFoundError,
  throwAuthenticationError,
  throwAuthorizationError,
  wrapSystemError,
} from '../sanitizer';
import {
  UserError,
  SystemError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DatabaseError,
  ExternalServiceError,
} from '../types';
import logger from '../../../utils/pino';

describe('Error Sanitization', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sanitizeError', () => {
    it('should sanitize UserError correctly', () => {
      const userError = new UserError('Invalid input', 'VALIDATION_ERROR');
      const result = sanitizeError(userError);

      expect(result).toEqual({
        message: 'Invalid input',
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    });

    it('should sanitize SystemError and hide details', () => {
      const systemError = new SystemError(
        'Database connection failed',
        'DB_ERROR',
      );
      const result = sanitizeError(systemError);

      expect(result).toEqual({
        message: 'An unexpected error occurred. Please try again later.',
        code: 'INTERNAL_ERROR',
        status: 500,
      });
    });

    it('should handle generic Error instances', () => {
      const error = new Error('Some internal error');
      const result = sanitizeError(error);

      expect(result).toEqual({
        message: 'An unexpected error occurred. Please try again later.',
        code: 'INTERNAL_ERROR',
        status: 500,
      });
    });

    it('should handle unknown error types', () => {
      const error = 'string error';
      const result = sanitizeError(error);

      expect(result).toEqual({
        message: 'An unexpected error occurred. Please try again later.',
        code: 'INTERNAL_ERROR',
        status: 500,
      });
    });

    it('should include context when provided', () => {
      const systemError = new SystemError('Database error', 'DB_ERROR');
      const context = {
        userId: 'user123',
        requestId: 'req456',
        path: '/api/test',
      };

      sanitizeError(systemError, context);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'SystemError',
            message: 'Database error',
            code: 'DB_ERROR',
          }),
          context: expect.objectContaining({
            userId: 'user123',
            requestId: 'req456',
            path: '/api/test',
          }),
        }),
        'System error occurred',
      );
    });
  });

  describe('sanitizeErrorForEnvironment', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      // @ts-ignore
      process.env.NODE_ENV = originalEnv;
    });

    it('should show detailed errors in development', () => {
      // @ts-ignore
      process.env.NODE_ENV = 'development';

      const error = new Error('Detailed error message');
      const result = sanitizeErrorForEnvironment(error);

      expect(result).toEqual({
        message: 'Detailed error message',
        code: 'DEV_ERROR',
        status: 500,
      });
    });

    it('should sanitize errors in production', () => {
      // @ts-ignore
      process.env.NODE_ENV = 'production';

      const error = new Error('Detailed error message');
      const result = sanitizeErrorForEnvironment(error);

      expect(result).toEqual({
        message: 'An unexpected error occurred. Please try again later.',
        code: 'INTERNAL_ERROR',
        status: 500,
      });
    });
  });

  describe('createApiErrorResponse', () => {
    it('should create proper API error response', () => {
      const error = new ValidationError('Invalid email format', 'email');
      const result = createApiErrorResponse(error);

      expect(result).toEqual({
        error: {
          message: 'Invalid email format',
          code: 'VALIDATION_ERROR',
        },
      });
    });
  });

  describe('Error throwing utilities', () => {
    it('should throw UserError with throwUserError', () => {
      expect(() => throwUserError('Test message', 'TEST_CODE')).toThrow(
        UserError,
      );
      expect(() => throwUserError('Test message', 'TEST_CODE')).toThrow(
        'Test message',
      );
    });

    it('should throw ValidationError with throwValidationError', () => {
      expect(() => throwValidationError('Invalid field', 'email')).toThrow(
        ValidationError,
      );
      expect(() => throwValidationError('Invalid field', 'email')).toThrow(
        'Invalid field',
      );
    });

    it('should throw NotFoundError with throwNotFoundError', () => {
      expect(() => throwNotFoundError('User')).toThrow(UserError);
      expect(() => throwNotFoundError('User')).toThrow('User not found');
    });

    it('should throw AuthenticationError with throwAuthenticationError', () => {
      expect(() => throwAuthenticationError('Login required')).toThrow(
        UserError,
      );
      expect(() => throwAuthenticationError('Login required')).toThrow(
        'Login required',
      );
    });

    it('should throw AuthorizationError with throwAuthorizationError', () => {
      expect(() => throwAuthorizationError('Permission denied')).toThrow(
        UserError,
      );
      expect(() => throwAuthorizationError('Permission denied')).toThrow(
        'Permission denied',
      );
    });
  });

  describe('wrapSystemError', () => {
    it('should wrap generic error as SystemError', () => {
      const originalError = new Error('Original error');
      const wrappedError = wrapSystemError(
        originalError,
        'Database failed',
        'DB_ERROR',
      );

      expect(wrappedError).toBeInstanceOf(SystemError);
      expect(wrappedError.message).toBe('Database failed');
      expect(wrappedError.code).toBe('DB_ERROR');
      expect(wrappedError.originalError).toBe(originalError);
    });
  });

  describe('Status code mapping', () => {
    it('should return correct status codes for different error types', () => {
      const validationError = new ValidationError('Invalid input');
      const authError = new AuthenticationError('Not authenticated');
      const authzError = new AuthorizationError('Not authorized');
      const notFoundError = new NotFoundError('Resource');

      expect(sanitizeError(validationError).status).toBe(400);
      expect(sanitizeError(authError).status).toBe(401);
      expect(sanitizeError(authzError).status).toBe(403);
      expect(sanitizeError(notFoundError).status).toBe(404);
    });
  });

  describe('Context sanitization', () => {
    it('should sanitize IP addresses', () => {
      const systemError = new SystemError('Test error');
      const context = {
        ip: '192.168.1.100',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      };

      sanitizeError(systemError, context);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            ip: '192.168.1.XXX',
            userAgent: expect.stringMatching(/Mozilla.*AppleWebKit/),
          }),
        }),
        'System error occurred',
      );
    });

    it('should truncate long user agents', () => {
      const systemError = new SystemError('Test error');
      const longUserAgent = 'A'.repeat(300);
      const context = { userAgent: longUserAgent };

      sanitizeError(systemError, context);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            userAgent: expect.stringMatching(/^A{200}$/),
          }),
        }),
        'System error occurred',
      );
    });
  });
});
