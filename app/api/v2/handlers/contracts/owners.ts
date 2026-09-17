import { Context } from 'hono';
import { checkAbility } from '@/data/user-permissions';
import { AuthorizationError, ValidationError } from '@/lib/errors';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { saveContractOwners } from '@/lib/v2/owners/service';
import type { OwnerSponsorRef } from '@/lib/v2/owners/types';

/** What the Owner tab and the upload row editor PUT. */
export interface SaveContractOwnersBody {
  sponsors: OwnerSponsorRef[];
  /** Omitted leaves the contract's groups as they are. */
  groupUnitIds?: number[];
  justification?: string | null;
  order?: string | null;
}

function errorResponse(c: Context, error: unknown, message: string) {
  if (error instanceof ValidationError) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof AuthorizationError) {
    return c.json({ error: error.message }, 403);
  }
  logger.error({ error: sanitizeForLogging(error) }, message);
  return c.json({ error: message }, 500);
}

function contractIdParam(c: Context): number {
  const raw = c.req.param('id') ?? '';
  // parseInt would accept "12junk"; the whole parameter must be the id.
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError('Invalid contract id');
  }
  const contractId = Number(raw);
  if (!Number.isSafeInteger(contractId) || contractId < 1) {
    throw new ValidationError('Invalid contract id');
  }
  return contractId;
}

async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Invalid JSON body');
  }
  return body as Record<string, unknown>;
}

function isPositiveInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function parseSponsor(value: unknown): OwnerSponsorRef {
  if (value === null || typeof value !== 'object') {
    throw new ValidationError('Invalid sponsor');
  }
  const { kind, id, name } = value as {
    kind?: unknown;
    id?: unknown;
    name?: unknown;
  };
  if (kind === 'user' && typeof id === 'string' && id !== '') {
    return { kind, id };
  }
  if (kind === 'employee' && isPositiveInt(id)) {
    return { kind, id };
  }
  if (kind === 'label' && typeof name === 'string') {
    return { kind, name };
  }
  throw new ValidationError('Invalid sponsor');
}

function parseSponsors(value: unknown): OwnerSponsorRef[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('sponsors must be an array');
  }
  return value.map(parseSponsor);
}

function parseGroupUnitIds(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every(isPositiveInt)) {
    throw new ValidationError('groupUnitIds must be an array of unit ids');
  }
  return value;
}

function parseOptionalText(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string or null`);
  }
  return value;
}

/**
 * The single write path for `contract_owners` from the app. Editing a contract
 * is enough to name its sponsors; the business groups are org structure, so
 * they carry the admin gate the Owner tab's picker already applies — a caller
 * that omits them needs no such right.
 */
export async function putContractOwnersHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = contractIdParam(c);
    if (!(await checkAbility('update', 'Contract'))) {
      throw new AuthorizationError(
        'You do not have permission to edit contract owners',
      );
    }

    const body = await jsonBody(c);
    const sponsors = parseSponsors(body.sponsors);
    const groupUnitIds =
      body.groupUnitIds === undefined
        ? undefined
        : parseGroupUnitIds(body.groupUnitIds);
    const justification =
      body.justification === undefined
        ? undefined
        : parseOptionalText(body.justification, 'justification');
    const order =
      body.order === undefined
        ? undefined
        : parseOptionalText(body.order, 'order');

    if (
      groupUnitIds !== undefined &&
      !(await checkAbility('manage', 'Organization'))
    ) {
      throw new AuthorizationError(
        'Only organization admins can edit business groups',
      );
    }

    await saveContractOwners({
      organizationId: userMetadata.organizationId,
      contractId,
      sponsors,
      groupUnitIds,
      justification,
      order,
      actorUserId: userMetadata.userId,
      actorName: userMetadata.userProfile?.name ?? undefined,
    });
    return c.json({ success: true });
  } catch (error) {
    return errorResponse(c, error, 'Failed to save the contract owners');
  }
}
