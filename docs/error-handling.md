# Error Handling Standards

This document outlines the error handling standards and practices for SOC 2 compliance and information security.

## Overview

The PostSig application implements a comprehensive error handling system that:

- Prevents information disclosure vulnerabilities
- Provides consistent error responses
- Maintains detailed logging for debugging
- Ensures SOC 2 Type II compliance
- Separates user-facing messages from internal error details

## Error Classification

### User Errors

User errors are safe to display to end users and indicate issues with user input or actions.

#### Base UserError

```typescript
import { UserError } from '@/lib/errors';

throw new UserError('Invalid input provided', 'INVALID_INPUT');
```

#### Specialized User Errors

- **ValidationError**: For input validation failures
- **AuthenticationError**: For authentication failures
- **AuthorizationError**: For permission/access denials
- **NotFoundError**: For missing resources

```typescript
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from '@/lib/errors';

// Validation
throw new ValidationError('Invalid email format', 'email');

// Authentication
throw new AuthenticationError('Login required');

// Authorization
throw new AuthorizationError('Access denied');

// Not Found
throw new NotFoundError('User');
```

### System Errors

System errors contain sensitive information and should never be displayed to users. They are logged for debugging and return generic messages to clients.

#### Base SystemError

```typescript
import { SystemError } from '@/lib/errors';

throw new SystemError(
  'Database connection failed',
  'DB_CONNECTION',
  originalError,
);
```

#### Specialized System Errors

- **DatabaseError**: For database operation failures
- **ExternalServiceError**: For third-party service failures

```typescript
import { DatabaseError, ExternalServiceError } from '@/lib/errors';

// Database errors
throw new DatabaseError('Query execution failed', sqlError);

// External service errors
throw new ExternalServiceError(
  'PaymentAPI',
  'Payment processing failed',
  apiError,
);
```

## Utility Functions

### Throwing Errors

Use utility functions for common error patterns:

```typescript
import {
  throwUserError,
  throwValidationError,
  throwNotFoundError,
  throwAuthenticationError,
  throwAuthorizationError,
  wrapSystemError,
} from '@/lib/errors';

// Quick user error
throwUserError('Invalid operation');

// Validation with field
throwValidationError('Invalid email', 'email');

// Resource not found
throwNotFoundError('Contract');

// Wrap existing error as system error
const wrappedError = wrapSystemError(
  originalError,
  'Operation failed',
  'OP_FAILED',
);
```

### Error Sanitization

The sanitization system automatically handles error responses:

```typescript
import { sanitizeError, createApiErrorResponse } from '@/lib/errors';

// Basic sanitization
const sanitized = sanitizeError(error, context);

// API response format
const apiResponse = createApiErrorResponse(error, context);
```

## API Error Handling

### Next.js API Routes

Use the error handling middleware for consistent API error responses:

```typescript
import { withErrorHandlerForRoute } from '@/lib/middleware/errorHandler';

export const GET = withErrorHandlerForRoute(async (req: NextRequest) => {
  // Your route logic here
  // Errors are automatically caught and sanitized
});
```

### Manual Error Handling

For custom error handling:

```typescript
import { createApiErrorHandler } from '@/lib/middleware/errorHandler';

const errorHandler = createApiErrorHandler();

export async function POST(req: NextRequest) {
  try {
    // Your logic here
  } catch (error) {
    return errorHandler(error, req);
  }
}
```

## Client-Side Error Handling

### React Error Boundaries

Use error boundaries to catch and handle React component errors:

```typescript
import {
  ErrorBoundary,
  PageErrorBoundary,
  ComponentErrorBoundary,
  withErrorBoundary
} from '@/components/ErrorBoundary';

// Page-level error boundary
function Page() {
  return (
    <PageErrorBoundary>
      <YourPageContent />
    </PageErrorBoundary>
  );
}

// Component-level error boundary
function Component() {
  return (
    <ComponentErrorBoundary>
      <YourComponent />
    </ComponentErrorBoundary>
  );
}

// HOC pattern
const SafeComponent = withErrorBoundary(YourComponent, {
  onError: (error, errorInfo, errorId) => {
    // Custom error handling
  }
});
```

### Custom Error Fallbacks

```typescript
import { ErrorBoundary } from '@/components/ErrorBoundary';

function CustomErrorFallback(error: Error, errorId: string, retry: () => void) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <p>Error ID: {errorId}</p>
      <button onClick={retry}>Try Again</button>
    </div>
  );
}

<ErrorBoundary fallback={CustomErrorFallback}>
  <YourComponent />
</ErrorBoundary>
```

## Server Actions

Replace generic error throwing in server actions:

```typescript
// ❌ Don't do this
if (!user) {
  throw new Error('User not found');
}

// ✅ Do this instead
import { throwAuthenticationError } from '@/lib/errors';

if (!user) {
  throwAuthenticationError('User not found');
}
```

## Environment Considerations

### Development vs Production

The error system automatically adjusts based on environment:

- **Development**: Shows detailed error messages for debugging
- **Production**: Returns sanitized generic messages
- **Staging**: Uses production-like error handling

### Logging

All system errors are automatically logged using Pino with:

- Sanitized context information
- Request details (when available)
- User information (when available)
- Stack traces for debugging
- No sensitive data exposure

## Security Guidelines

### DO

- ✅ Use appropriate error types for different scenarios
- ✅ Log detailed errors server-side for debugging
- ✅ Return generic messages for system failures
- ✅ Include request context for tracing
- ✅ Use error boundaries for React components
- ✅ Validate and sanitize all user inputs

### DON'T

- ❌ Expose database schemas in error messages
- ❌ Return internal system details to users
- ❌ Log sensitive user data (passwords, tokens, PII)
- ❌ Use console.log for error logging
- ❌ Throw generic Error instances
- ❌ Ignore or suppress errors silently

## Migration Guide

### From Generic Errors

Replace existing error patterns:

```typescript
// ❌ Old pattern
if (!isValid) {
  throw new Error('Validation failed');
}

// ✅ New pattern
if (!isValid) {
  throw new ValidationError('Invalid input format', 'inputField');
}
```

### Database Operations

```typescript
// ❌ Old pattern
try {
  await db.query(sql);
} catch (error) {
  throw new Error('Database error');
}

// ✅ New pattern
try {
  await db.query(sql);
} catch (error) {
  throw new DatabaseError('Query execution failed', error);
}
```

### API Calls

```typescript
// ❌ Old pattern
if (!response.ok) {
  throw new Error('API call failed');
}

// ✅ New pattern
if (!response.ok) {
  throw new ExternalServiceError(
    'PaymentAPI',
    `Request failed: ${response.status}`,
  );
}
```

## Testing

### Unit Tests

Test error scenarios thoroughly:

```typescript
import { sanitizeError, UserError, SystemError } from '@/lib/errors';

describe('Error Handling', () => {
  it('should sanitize user errors correctly', () => {
    const error = new UserError('Invalid input', 'VALIDATION_ERROR');
    const result = sanitizeError(error);

    expect(result.message).toBe('Invalid input');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.status).toBe(400);
  });

  it('should hide system error details', () => {
    const error = new SystemError('Database connection failed');
    const result = sanitizeError(error);

    expect(result.message).toBe(
      'An unexpected error occurred. Please try again later.',
    );
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.status).toBe(500);
  });
});
```

### Integration Tests

Test API error responses:

```typescript
describe('API Error Handling', () => {
  it('should return sanitized error responses', async () => {
    const response = await fetch('/api/test');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.message).toBeDefined();
    expect(data.error.code).toBeDefined();
    // Should not contain sensitive information
    expect(data.error.message).not.toContain('database');
    expect(data.error.message).not.toContain('sql');
  });
});
```

## Monitoring and Alerting

### Error Tracking

- All system errors are logged with unique IDs for tracking
- Error rates and patterns are monitored
- Critical errors trigger alerts
- Error logs are retained for compliance auditing

### Metrics

Key metrics to monitor:

- Error rate by endpoint
- Error rate by error type
- System error frequency
- User error patterns
- Response time impact of error handling

## Compliance

This error handling system addresses SOC 2 requirements:

- **Information Security**: Prevents data exposure through error messages
- **Availability**: Maintains service stability through proper error handling
- **Processing Integrity**: Ensures accurate error reporting and logging
- **Confidentiality**: Protects sensitive information in error scenarios
- **Privacy**: Prevents personal data exposure through error messages

## Implementation Checklist

- [ ] Replace all `throw new Error()` instances with appropriate error types
- [ ] Add error boundaries to React components
- [ ] Implement API error handling middleware
- [ ] Update server actions to use new error types
- [ ] Add comprehensive error handling tests
- [ ] Configure error monitoring and alerting
- [ ] Train team on new error handling patterns
- [ ] Conduct security review of error scenarios
- [ ] Document application-specific error codes
- [ ] Set up error rate monitoring and dashboards

## Related Files

- `lib/errors/types.ts` - Error class definitions
- `lib/errors/sanitizer.ts` - Error sanitization logic
- `lib/errors/index.ts` - Main exports
- `lib/middleware/errorHandler.ts` - API error handling middleware
- `components/ErrorBoundary.tsx` - React error boundary components
- `utils/pino.ts` - Logging configuration
- `utils/log-sanitization.ts` - Log sanitization utilities

For questions or clarifications, refer to the SOC 2 compliance documentation or contact the security team.
