import logger from '@/utils/pino';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { TenantIsolationError } from '@/app/lib/mcp/errors';

/**
 * Asserts every record in `rows` belongs to the requesting user's org.
 * If a row's organization_id does not match, the call fails closed.
 *
 * Why: defense in depth. Our lib/v2 services already filter by organization_id,
 * but a future refactor could regress that. This guard catches such regressions
 * before data leaks across tenants.
 *
 * `getOrgId` defaults to a top-level `organization_id` field. Pass an explicit
 * getter when org_id lives elsewhere (e.g. for EnrichedContract it's nested at
 * `c.contract.organization_id`).
 */
export function assertSameOrg<T>(
  rows: T[],
  toolName: string,
  getOrgId?: (row: T) => string | null | undefined,
): T[] {
  const ctx = requireMcpContext();
  const expected = ctx.userMetadata.organizationId;
  const get =
    getOrgId ??
    ((r: T) =>
      (r as { organization_id?: string | null }).organization_id ?? null);

  for (const row of rows) {
    const orgId = get(row);
    if (orgId && orgId !== expected) {
      logger.error(
        {
          tool: toolName,
          expectedOrg: expected,
          rowOrg: orgId,
          tokenId: ctx.tokenId,
          userId: ctx.userMetadata.userId,
        },
        'mcp: tenant isolation violation detected; aborting tool call',
      );
      throw new TenantIsolationError(toolName);
    }
  }
  return rows;
}
