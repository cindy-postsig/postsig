'use server';

import { revalidatePath } from 'next/cache';
import { defineAbilitiesFor } from '@postsig/toolkit';
import { getUserMetadata } from '@/data/users';
import type { UserMetadata } from '@/constants/types';
import { isValidClientRole } from '@/lib/auth/roles';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { resolveReplacementEvent } from '@/data/superuser/contractReplacementResolution';
import logger from '@/utils/pino';

/**
 * The caller, once proven allowed to archive contracts.
 *
 * Answering a replacement prompt archives a contract, so it is gated on the
 * same `update Contract` ability as the archive UI itself.
 */
async function requireContractUpdater(eventId: number): Promise<UserMetadata> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }

  if (!isValidClientRole(userMetadata.userRole)) {
    logger.warn(
      { userId: userMetadata.userId, userRole: userMetadata.userRole, eventId },
      'Invalid user role for replacement resolution',
    );
    throw new AuthorizationError('Invalid user role');
  }

  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole,
    organizationId: userMetadata.organizationId,
  });

  if (!ability.can('update', 'Contract')) {
    logger.warn(
      { userId: userMetadata.userId, userRole: userMetadata.userRole, eventId },
      'User lacks update permission for contracts',
    );
    throw new AuthorizationError('Unauthorized: Cannot update contract');
  }

  return userMetadata;
}

interface ResolutionContext {
  userId: string;
  organizationId: string;
  oldContractId: number;
}

/**
 * Authorize the caller and resolve which contract the prompt hangs off.
 *
 * The event is loaded with the service client and its `organization_id`
 * compared to the caller's: that client bypasses RLS, so this comparison — not
 * the RLS policy — is what stops an event id from another org resolving here.
 */
async function authorizeEventResolution(
  eventId: number,
): Promise<ResolutionContext> {
  const userMetadata = await requireContractUpdater(eventId);

  const supabase = createServiceClient();
  const { data: event, error } = await supabase
    .from('contract_lineage_events')
    .select('id, old_contract_id, organization_id')
    .eq('id', eventId)
    .maybeSingle();

  if (error || !event) {
    logger.warn({ eventId, error }, 'Replacement event not found');
    throw new AuthorizationError('Replacement event not found');
  }

  if (event.organization_id !== userMetadata.organizationId) {
    throw new AuthorizationError('Event does not belong to your organization');
  }

  return {
    userId: userMetadata.userId,
    organizationId: userMetadata.organizationId,
    oldContractId: event.old_contract_id,
  };
}

/**
 * Refresh both surfaces a resolution changes: the banner on the old contract's
 * detail page, and the list indicator, which is computed server-side from the
 * same verified events and would otherwise keep flagging a settled prompt.
 */
function revalidateReplacementSurfaces(oldContractId: number): void {
  revalidatePath(`/contracts/${oldContractId}`);
  revalidatePath('/contracts');
}

/**
 * "No, keep it active" — the user says the detected contract does not replace
 * this one. The full dedupe index means this pair is never re-detected.
 */
export async function rejectContractReplacement(
  eventId: number,
): Promise<{ resolved: boolean }> {
  const { userId, organizationId, oldContractId } =
    await authorizeEventResolution(eventId);

  const result = await resolveReplacementEvent({
    eventId,
    organizationId,
    status: 'rejected',
    userId,
  });

  revalidateReplacementSurfaces(oldContractId);

  return result;
}

/**
 * "Yes" — record that the user accepted the replacement, after the old contract
 * has been archived.
 *
 * Archiving is deliberately NOT performed here: the caller drives it through
 * the existing `/api/contracts/update` archive path (via
 * `requestArchiveWithChildren`), which owns invoice-descendant cascade, the
 * non-invoice opt-in prompt and the audit log. Duplicating that server-side
 * would fork the archive behaviour.
 *
 * Order is archive first, event second. If the archive fails the caller never
 * reaches here and the event stays `verified`, so the prompt is still there to
 * retry. If this stamp fails after a successful archive, the archive stands and
 * the prompt remains on the now-archived contract until retried — the
 * `expectedStatus` guard makes that retry idempotent.
 *
 * No `contract_relationships` edge is written.
 */
export async function confirmContractReplacement(
  eventId: number,
): Promise<{ resolved: boolean }> {
  const { userId, organizationId, oldContractId } =
    await authorizeEventResolution(eventId);

  const result = await resolveReplacementEvent({
    eventId,
    organizationId,
    status: 'confirmed',
    userId,
  });

  revalidateReplacementSurfaces(oldContractId);

  return result;
}
