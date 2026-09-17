import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { requireMcpContext, requireScope } from '@/app/lib/mcp/context';
import { NotFoundToolError, ValidationToolError } from '@/app/lib/mcp/errors';
import {
  loadSponsorMatchCatalog,
  matchSponsorNames,
} from '@/lib/v2/owners/match';
import {
  readGroupUnitIds,
  replaceContractOwners,
} from '@/lib/v2/owners/service';

export interface ContractUpdateInput {
  business_sponsor?: unknown;
  tags?: number[];
}

export interface ContractUpdateResult {
  contractId: number;
  updatedFields: string[];
}

/**
 * Update a contract via MCP.
 *
 * Whitelist (intentionally narrow): business_sponsor, tags. `notes` and
 * `renewal_type` are deliberately excluded — those are owned by the team UI
 * flow, not external automation. A sponsor is written as a `contract_owners`
 * row, matched to a user or an HR employee by name where one exists and kept
 * as a bare label otherwise; the `contracts.business_sponsor` and
 * `contracts.business_group` columns are frozen and have no writer (psk-1975).
 *
 * Why a separate path from lib/v2.updateContract: this runs from a route
 * handler with no Supabase cookie/session, so it uses the service client and
 * the MCP context directly rather than relying on getUserMetadata via cookies.
 */
export async function updateContractFromMcp(
  contractId: number,
  input: ContractUpdateInput,
): Promise<ContractUpdateResult> {
  // Defense-in-depth: scope is also checked at the tool wrapper, but enforce
  // here too so any future caller into this function fails closed.
  requireScope('write');
  const ctx = requireMcpContext();
  const supabase = createServiceClient();
  const updatedFields: string[] = [];

  const { data: existing, error: fetchErr } = await supabase
    .from('contracts')
    .select('id, organization_id')
    .eq('id', contractId)
    .single();

  if (fetchErr || !existing) {
    throw new NotFoundToolError('Contract', contractId);
  }
  if (existing.organization_id !== ctx.userMetadata.organizationId) {
    logger.error(
      {
        contractId,
        contractOrg: existing.organization_id,
        userOrg: ctx.userMetadata.organizationId,
        tokenId: ctx.tokenId,
      },
      'mcp: contract org mismatch on update',
    );
    throw new NotFoundToolError('Contract', contractId);
  }

  if (input.business_sponsor !== undefined) {
    await replaceSponsors(contractId, input.business_sponsor);
    updatedFields.push('business_sponsor');
  }

  if (input.tags !== undefined) {
    await applyTagDiff(contractId, input.tags);
    updatedFields.push('tags');
  }

  return { contractId, updatedFields };
}

/**
 * The tool wraps a bare string as `{ name }`; arrays and null also arrive.
 * Only a top-level null or empty list means "clear the sponsors". Anything
 * that would otherwise collapse to an empty name — a blank string, an object
 * without a string name, a null list member — is rejected instead of dropped,
 * because dropping it reads as a clear and would wipe the contract's rows
 * while the tool reported business_sponsor as updated.
 */
function sponsorNames(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(sponsorNameOf);
  return [sponsorNameOf(value)];
}

function sponsorNameOf(entry: unknown): string {
  const raw =
    typeof entry === 'string'
      ? entry
      : entry !== null && typeof entry === 'object'
        ? (entry as { name?: unknown }).name
        : undefined;
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
  throw new ValidationToolError(
    'business_sponsor must be a non-empty name, an object with a non-empty string name, a list of either, or null to clear',
  );
}

/**
 * Sponsors are replaced; the contract's owner *groups* are read back and
 * passed through unchanged, since this path never edits them.
 */
async function replaceSponsors(
  contractId: number,
  value: unknown,
): Promise<void> {
  const ctx = requireMcpContext();
  const supabase = createServiceClient();
  const { organizationId } = ctx.userMetadata;
  const names = sponsorNames(value);

  const groupUnitIds = await readGroupUnitIds(
    supabase,
    organizationId,
    contractId,
  );

  const catalog = await loadSponsorMatchCatalog(organizationId, supabase);
  await replaceContractOwners({
    organizationId,
    contractId,
    sponsors: matchSponsorNames(names, catalog),
    groupUnitIds,
    actorUserId: ctx.userMetadata.userId,
    actorName: ctx.userMetadata.userProfile?.name ?? undefined,
  });
}

async function applyTagDiff(
  contractId: number,
  desiredTagIds: number[],
): Promise<void> {
  const ctx = requireMcpContext();
  const supabase = createServiceClient();

  const { data: orgTags, error: orgTagsErr } = await supabase
    .from('user_tags')
    .select('id')
    .eq('org_id', ctx.userMetadata.organizationId)
    .in('id', desiredTagIds.length > 0 ? desiredTagIds : [-1]);

  if (orgTagsErr) {
    logger.error({ err: orgTagsErr, contractId }, 'mcp: org tag lookup failed');
    throw new Error('Failed to validate tags');
  }
  const validIds = new Set((orgTags ?? []).map((t) => t.id));
  for (const id of desiredTagIds) {
    if (!validIds.has(id)) {
      throw new ValidationToolError(`Tag ${id} not in organization`);
    }
  }

  const { data: existing, error: existingErr } = await supabase
    .from('contract_tags')
    .select('tag_id, user_tags!inner(org_id)')
    .eq('contract_id', contractId)
    .eq('user_tags.org_id', ctx.userMetadata.organizationId);

  if (existingErr) {
    logger.error(
      { err: existingErr, contractId },
      'mcp: existing tag lookup failed',
    );
    throw new Error('Failed to fetch existing tags');
  }

  const existingIds = new Set((existing ?? []).map((t) => t.tag_id));
  const desired = new Set(desiredTagIds);

  const toAdd = [...desired].filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !desired.has(id));

  if (toAdd.length > 0) {
    const { error: insertErr } = await supabase
      .from('contract_tags')
      .insert(toAdd.map((tag_id) => ({ contract_id: contractId, tag_id })));
    if (insertErr) {
      logger.error(
        { err: insertErr, contractId, toAdd },
        'mcp: tag insert failed',
      );
      throw new Error('Failed to add tags');
    }
  }

  if (toRemove.length > 0) {
    const { error: deleteErr } = await supabase
      .from('contract_tags')
      .delete()
      .eq('contract_id', contractId)
      .in('tag_id', toRemove);
    if (deleteErr) {
      logger.error(
        { err: deleteErr, contractId, toRemove },
        'mcp: tag delete failed',
      );
      throw new Error('Failed to remove tags');
    }
  }
}
