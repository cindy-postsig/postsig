import {
  auditLogger,
  AuditAction,
  AuditResourceType,
  extractAuditContext,
  getUserAuditContext,
  authActions,
  roleActions,
  userActions,
} from '@/lib/audit';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import logger from '@/utils/pino';

type ServerAction<T extends unknown[], R> = (...args: T) => Promise<R>;

interface AuditConfig<T extends unknown[]> {
  action: AuditAction;
  resourceType: AuditResourceType;
  getResourceId?: (...args: T) => string | undefined;
  captureArgs?: boolean;
  captureResult?: boolean;
  skipAuditIf?: (...args: T) => boolean;
}

export function withAudit<T extends unknown[], R>(
  config: AuditConfig<T>,
  serverAction: ServerAction<T, R>,
): ServerAction<T, R> {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now();
    let result: R;
    let error: Error | undefined;
    let context: Awaited<ReturnType<typeof getUserAuditContext>> | undefined;

    try {
      if (config.skipAuditIf && config.skipAuditIf(...args)) {
        return await serverAction(...args);
      }

      try {
        context = await getUserAuditContext();
      } catch (ctxErr) {
        logger.warn({ error: ctxErr }, 'Failed to get user audit context');
        context = undefined;
      }

      let oldData: Record<string, unknown> | undefined;
      if (config.action === 'UPDATE' && config.getResourceId) {
        const resourceId = config.getResourceId(...args);
        if (resourceId) {
          // TODO: Implement per resource type
          // This would need to be implemented per resource type
          // For now, we'll capture it in the actual Server Action
        }
      }

      result = await serverAction(...args);

      await auditLogger.logEvent({
        action: config.action,
        resourceType: config.resourceType,
        resourceId: config.getResourceId
          ? config.getResourceId(...args)
          : undefined,
        oldData,
        newData: config.captureResult
          ? { result: sanitizeForLogging(result) }
          : undefined,
        context: {
          ...(context || {}),
          metadata: {
            duration: Date.now() - startTime,
            args: config.captureArgs ? sanitizeForLogging(args) : undefined,
          },
        },
      });

      return result;
    } catch (err) {
      error = err as Error;

      try {
        await auditLogger.logEvent({
          action: config.action,
          resourceType: config.resourceType,
          resourceId: config.getResourceId
            ? config.getResourceId(...args)
            : undefined,
          context: {
            ...(context || {}),
            metadata: {
              duration: Date.now() - startTime,
              error: sanitizeForLogging(error),
              args: config.captureArgs ? sanitizeForLogging(args) : undefined,
            },
          },
        });
      } catch (auditErr) {
        logger.error(
          { error: auditErr, originalError: error },
          'Failed to log audit event in error path',
        );
      }

      throw error;
    }
  };
}

// Specialized decorators for common operations

export function withUserAudit<T extends unknown[], R>(
  action: Extract<AuditAction, (typeof userActions)[number]>,
  getUserId: (...args: T) => string | undefined = () => undefined,
) {
  return (serverAction: ServerAction<T, R>) =>
    withAudit(
      {
        action,
        resourceType: 'users',
        getResourceId: getUserId,
        captureArgs: true,
        captureResult: false,
      },
      serverAction,
    );
}

export function withAuthAudit<T extends unknown[], R>(
  action: Extract<AuditAction, (typeof authActions)[number]>,
) {
  return (serverAction: ServerAction<T, R>) =>
    withAudit(
      {
        action,
        resourceType: 'authentication',
        captureArgs: false,
        captureResult: false,
      },
      serverAction,
    );
}

export function withRoleAudit<T extends unknown[], R>(
  action: Extract<AuditAction, (typeof roleActions)[number]>,
  getUserId: (...args: T) => string | undefined,
) {
  return (serverAction: ServerAction<T, R>) =>
    withAudit(
      {
        action,
        resourceType: 'user_roles',
        getResourceId: getUserId,
        captureArgs: true,
        captureResult: true,
      },
      serverAction,
    );
}

// Higher-order function for creating audit middleware with request context
export function createAuditMiddleware(request?: Request) {
  const requestContext = extractAuditContext(request);

  return function withRequestAudit<T extends unknown[], R>(
    config: AuditConfig<T>,
    serverAction: ServerAction<T, R>,
  ): ServerAction<T, R> {
    return async (...args: T): Promise<R> => {
      const startTime = Date.now();
      let result: R;
      let error: Error | undefined;
      let userContext:
        | Awaited<ReturnType<typeof getUserAuditContext>>
        | undefined;

      try {
        userContext = await getUserAuditContext();
      } catch (ctxErr) {
        logger.warn({ error: ctxErr }, 'Failed to get user audit context');
      }
      const fullContext = { ...(userContext || {}), ...requestContext };

      try {
        if (config.skipAuditIf && config.skipAuditIf(...args)) {
          return await serverAction(...args);
        }

        result = await serverAction(...args);

        await auditLogger.logEvent({
          action: config.action,
          resourceType: config.resourceType,
          resourceId: config.getResourceId
            ? config.getResourceId(...args)
            : undefined,
          newData: config.captureResult
            ? { result: sanitizeForLogging(result) }
            : undefined,
          context: {
            ...fullContext,
            metadata: {
              duration: Date.now() - startTime,
              args: config.captureArgs ? sanitizeForLogging(args) : undefined,
            },
          },
        });

        return result;
      } catch (err) {
        error = err as Error;

        try {
          await auditLogger.logEvent({
            action: config.action,
            resourceType: config.resourceType,
            resourceId: config.getResourceId
              ? config.getResourceId(...args)
              : undefined,
            context: {
              ...fullContext,
              metadata: {
                duration: Date.now() - startTime,
                error: sanitizeForLogging(error),
                args: config.captureArgs ? sanitizeForLogging(args) : undefined,
              },
            },
          });
        } catch (auditErr) {
          logger.error(
            {
              error: auditErr,
              originalError: error,
            },
            'Failed to log audit event in error path',
          );
        }

        throw error;
      }
    };
  };
}

// Helper function to manually log audit events from within Server Actions
export async function auditEvent(
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId?: string,
  data?: {
    oldData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  let context: Awaited<ReturnType<typeof getUserAuditContext>> | undefined;

  try {
    context = await getUserAuditContext({
      metadata: data?.metadata,
    });
  } catch (ctxErr) {
    logger.warn(
      { error: ctxErr },
      'Failed to get user audit context in auditEvent',
    );
    context = {
      metadata: data?.metadata,
    };
  }

  await auditLogger.logEvent({
    action,
    resourceType,
    resourceId,
    oldData: data?.oldData,
    newData: data?.newData,
    context,
  });
}
