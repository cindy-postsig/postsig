import { Context } from 'hono';
import { checkAbility } from '@/data/user-permissions';
import { AuthorizationError, ValidationError } from '@/lib/errors';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { createBusinessGroupNode } from '@/lib/v2/org-units';

export interface CreateBusinessGroupResponse {
  group: { id: number; name: string };
}

/**
 * The inline "Create new group…" flows in the employee dialogs, the allocation
 * editor and the import value map. Creates a business_group org-unit node —
 * never an ACL `groups` row — and returns the existing node when the name is
 * already taken, so repeated creates converge.
 */
export async function postBusinessGroupHandler(c: Context) {
  try {
    if (!(await checkAbility('manage', 'Organization'))) {
      throw new AuthorizationError(
        'Only organization admins can create business groups',
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ValidationError('Invalid JSON body');
    }
    const name =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as { name?: unknown }).name
        : undefined;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ValidationError('Business group name is required');
    }

    const { organizationId } = c.get('userMetadata');
    const group = await createBusinessGroupNode(organizationId, name.trim());
    const payload: CreateBusinessGroupResponse = { group };
    return c.json(payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    if (error instanceof AuthorizationError) {
      return c.json({ error: error.message }, 403);
    }
    logger.error(
      { error: sanitizeForLogging(error) },
      'Failed to create business group node',
    );
    return c.json({ error: 'Failed to create the business group' }, 500);
  }
}
