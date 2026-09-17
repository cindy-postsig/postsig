import type { LogFn } from 'pino';

type SensitiveFields = {
  [key: string]: boolean | SensitiveFields;
};

const SENSITIVE_FIELD_PATTERNS = [
  'password',
  'token',
  'secret',
  'key',
  'auth',
  'credential',
  'ssn',
  'social_security',
  'email',
  'phone',
  'address',
  'credit_card',
  'card_number',
  'cvv',
  'api_key',
  'access_token',
  'refresh_token',
  'bearer',
  'authorization',
];

const SENSITIVE_FIELD_MAP: SensitiveFields = {
  password: true,
  token: true,
  secret: true,
  key: true,
  auth: true,
  credential: true,
  ssn: true,
  social_security_number: true,
  email: true,
  phone: true,
  phone_number: true,
  address: true,
  street_address: true,
  credit_card: true,
  card_number: true,
  cvv: true,
  cvc: true,
  api_key: true,
  access_token: true,
  refresh_token: true,
  bearer: true,
  authorization: true,
  x_api_key: true,
};

function isSensitiveField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();

  if (SENSITIVE_FIELD_MAP[lowerFieldName]) {
    return true;
  }

  return SENSITIVE_FIELD_PATTERNS.some((pattern) =>
    lowerFieldName.includes(pattern.toLowerCase()),
  );
}

function sanitizeValue(value: any, depth = 0): any {
  if (depth > 10) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (value.length > 1000) {
      return value.substring(0, 1000) + '...[TRUNCATED]';
    }
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > 100) {
      return [
        ...value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1)),
        '...[TRUNCATED]',
      ];
    }
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized: any = {};

    for (const [key, val] of Object.entries(value)) {
      if (isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(val, depth + 1);
      }
    }

    return sanitized;
  }

  return value;
}

export function sanitizeForLogging(data: any): any {
  return sanitizeValue(data);
}

export function createSafeLogFunction(logFn: LogFn) {
  return (obj: any, msg?: string, ...args: any[]) => {
    const sanitizedObj = sanitizeForLogging(obj);
    if (msg) {
      logFn(sanitizedObj, msg, ...args);
    } else {
      logFn(sanitizedObj);
    }
  };
}

export function logError(logger: any, error: Error | unknown, context?: any) {
  const errorInfo: any = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    name: error instanceof Error ? error.name : 'UnknownError',
  };

  if (context) {
    errorInfo.context = sanitizeForLogging(context);
  }

  logger.error(errorInfo, 'Error occurred');
}
