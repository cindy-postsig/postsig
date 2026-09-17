import { Context, Next } from 'hono';
import { isReadOnlyRole } from '@/lib/auth/roles';
import logger from '@/utils/pino';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Routes a read-only role may still send a non-GET to, as `METHOD /path`. Two
 * kinds qualify and nothing else:
 *
 * - queries that use POST for a request body rather than to change state;
 * - writes confined to the caller's own session data.
 *
 * A `*` matches exactly one path segment. Anything not listed is refused, so a
 * write endpoint added later is closed to read-only roles until someone puts it
 * here on purpose.
 */
const VIEWER_WRITABLE: readonly string[] = [
  'POST /api/v2/spend',
  'POST /api/v2/chat/stream',
  'POST /api/v2/chat/sessions',
  'PATCH /api/v2/chat/sessions/*',
  'DELETE /api/v2/chat/sessions/*',
];

function matchesPattern(pattern: string, segments: string[]): boolean {
  const patternSegments = pattern.split('/');
  if (patternSegments.length !== segments.length) return false;
  return patternSegments.every(
    (segment, i) => segment === '*' || segment === segments[i],
  );
}

function isViewerWritable(method: string, path: string): boolean {
  const segments = path.replace(/\/+$/, '').split('/');
  return VIEWER_WRITABLE.some((entry) => {
    const [entryMethod, entryPath] = entry.split(' ');
    return entryMethod === method && matchesPattern(entryPath, segments);
  });
}

/**
 * Refuses state-changing requests from read-only roles.
 *
 * Mounted on every v2 path after the auth middlewares so it sees the resolved
 * role. Requests that carry no `userMetadata` reached the router through the
 * API-key middleware instead, which does its own authorization.
 */
export async function viewerWriteGuard(c: Context, next: Next) {
  if (READ_METHODS.has(c.req.method)) return next();

  const userMetadata = c.get('userMetadata');
  if (!userMetadata) return next();

  if (
    isReadOnlyRole(userMetadata.userRole) &&
    !isViewerWritable(c.req.method, c.req.path)
  ) {
    logger.warn(
      {
        userId: userMetadata.userId,
        organizationId: userMetadata.organizationId,
        userRole: userMetadata.userRole,
        method: c.req.method,
        path: c.req.path,
        action: 'accessDenied',
      },
      'Blocked a write request from a read-only role',
    );
    return c.json({ error: 'Forbidden' }, 403);
  }

  return next();
}
