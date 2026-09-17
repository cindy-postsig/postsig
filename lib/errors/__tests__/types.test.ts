import {
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
} from '../types';

describe('Error Types', () => {
  describe('UserError', () => {
    it('should create UserError with default code', () => {
      const error = new UserError('Test message');

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('USER_ERROR');
      expect(error.name).toBe('UserError');
      expect(error.isUserError).toBe(true);
    });

    it('should create UserError with custom code', () => {
      const error = new UserError('Test message', 'CUSTOM_CODE');

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('CUSTOM_CODE');
    });

    it('should maintain stack trace', () => {
      const error = new UserError('Test message');
      expect(error.stack).toBeDefined();
    });
  });

  describe('SystemError', () => {
    it('should create SystemError with default code', () => {
      const error = new SystemError('System failure');

      expect(error.message).toBe('System failure');
      expect(error.code).toBe('SYSTEM_ERROR');
      expect(error.name).toBe('SystemError');
      expect(error.isSystemError).toBe(true);
    });

    it('should store original error', () => {
      const originalError = new Error('Original error');
      const systemError = new SystemError(
        'Wrapped error',
        'WRAP_ERROR',
        originalError,
      );

      expect(systemError.originalError).toBe(originalError);
    });
  });

  describe('ValidationError', () => {
    it('should extend UserError', () => {
      const error = new ValidationError('Invalid field');

      expect(error).toBeInstanceOf(UserError);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should store field information', () => {
      const error = new ValidationError('Invalid email', 'email');

      expect(error.field).toBe('email');
    });

    it('should create field-specific code', () => {
      const error = new ValidationError(
        'Invalid email',
        'email',
        'EMAIL_INVALID',
      );

      expect(error.code).toBe('EMAIL_INVALID');
    });
  });

  describe('AuthenticationError', () => {
    it('should extend UserError with auth defaults', () => {
      const error = new AuthenticationError();

      expect(error).toBeInstanceOf(UserError);
      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Authentication required');
      expect(error.code).toBe('AUTH_ERROR');
    });

    it('should accept custom message and code', () => {
      const error = new AuthenticationError('Login failed', 'LOGIN_FAILED');

      expect(error.message).toBe('Login failed');
      expect(error.code).toBe('LOGIN_FAILED');
    });
  });

  describe('AuthorizationError', () => {
    it('should extend UserError with authz defaults', () => {
      const error = new AuthorizationError();

      expect(error).toBeInstanceOf(UserError);
      expect(error.name).toBe('AuthorizationError');
      expect(error.message).toBe('Access denied');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('NotFoundError', () => {
    it('should extend UserError with not found defaults', () => {
      const error = new NotFoundError();

      expect(error).toBeInstanceOf(UserError);
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe('Resource not found');
      expect(error.code).toBe('NOT_FOUND');
    });

    it('should customize message based on resource', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
    });
  });

  describe('DatabaseError', () => {
    it('should extend SystemError', () => {
      const error = new DatabaseError();

      expect(error).toBeInstanceOf(SystemError);
      expect(error.name).toBe('DatabaseError');
      expect(error.message).toBe('Database operation failed');
      expect(error.code).toBe('DATABASE_ERROR');
    });

    it('should store original database error', () => {
      const dbError = new Error('Connection timeout');
      const error = new DatabaseError('Custom message', dbError);

      expect(error.message).toBe('Custom message');
      expect(error.originalError).toBe(dbError);
    });
  });

  describe('ExternalServiceError', () => {
    it('should extend SystemError', () => {
      const error = new ExternalServiceError('AWS');

      expect(error).toBeInstanceOf(SystemError);
      expect(error.name).toBe('ExternalServiceError');
      expect(error.service).toBe('AWS');
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
    });

    it('should accept custom message and original error', () => {
      const apiError = new Error('API timeout');
      const error = new ExternalServiceError(
        'PaymentAPI',
        'Payment failed',
        apiError,
      );

      expect(error.service).toBe('PaymentAPI');
      expect(error.message).toBe('Payment failed');
      expect(error.originalError).toBe(apiError);
    });
  });

  describe('Type Guards', () => {
    describe('isUserError', () => {
      it('should identify UserError instances', () => {
        const userError = new UserError('test');
        const validationError = new ValidationError('test');
        const systemError = new SystemError('test');
        const regularError = new Error('test');

        expect(isUserError(userError)).toBe(true);
        expect(isUserError(validationError)).toBe(true);
        expect(isUserError(systemError)).toBe(false);
        expect(isUserError(regularError)).toBe(false);
        expect(isUserError('string')).toBe(false);
        expect(isUserError(null)).toBe(false);
      });
    });

    describe('isSystemError', () => {
      it('should identify SystemError instances', () => {
        const systemError = new SystemError('test');
        const databaseError = new DatabaseError('test');
        const userError = new UserError('test');
        const regularError = new Error('test');

        expect(isSystemError(systemError)).toBe(true);
        expect(isSystemError(databaseError)).toBe(true);
        expect(isSystemError(userError)).toBe(false);
        expect(isSystemError(regularError)).toBe(false);
        expect(isSystemError('string')).toBe(false);
        expect(isSystemError(null)).toBe(false);
      });
    });

    describe('isKnownError', () => {
      it('should identify both UserError and SystemError instances', () => {
        const userError = new UserError('test');
        const systemError = new SystemError('test');
        const regularError = new Error('test');

        expect(isKnownError(userError)).toBe(true);
        expect(isKnownError(systemError)).toBe(true);
        expect(isKnownError(regularError)).toBe(false);
        expect(isKnownError('string')).toBe(false);
      });
    });
  });

  describe('Error inheritance chain', () => {
    it('should maintain proper inheritance', () => {
      const validationError = new ValidationError('test');
      const authError = new AuthenticationError('test');
      const databaseError = new DatabaseError('test');

      expect(validationError instanceof Error).toBe(true);
      expect(validationError instanceof UserError).toBe(true);
      expect(validationError instanceof ValidationError).toBe(true);

      expect(authError instanceof Error).toBe(true);
      expect(authError instanceof UserError).toBe(true);
      expect(authError instanceof AuthenticationError).toBe(true);

      expect(databaseError instanceof Error).toBe(true);
      expect(databaseError instanceof SystemError).toBe(true);
      expect(databaseError instanceof DatabaseError).toBe(true);
    });
  });

  describe('Error serialization', () => {
    it('should serialize errors properly', () => {
      const userError = new UserError('User message', 'USER_CODE');
      const systemError = new SystemError('System message', 'SYS_CODE');

      const userSerialized = userError.toJSON();
      const systemSerialized = systemError.toJSON();

      expect(userSerialized.message).toBe('User message');
      expect(userSerialized.code).toBe('USER_CODE');
      expect(userSerialized.name).toBe('UserError');

      expect(systemSerialized.message).toBe('System message');
      expect(systemSerialized.code).toBe('SYS_CODE');
      expect(systemSerialized.name).toBe('SystemError');
    });
  });
});
