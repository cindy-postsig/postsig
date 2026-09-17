import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/service_server';
import { getCacheService } from '@/app/lib/redis/cache-service';
import {
  buildArchiveIdSet,
  normalizeContractIds,
  resolveArchiveDescendants,
} from '@/lib/v2/contracts/archive';
import { requireContractUpdateAbility } from '@/app/api/contracts/_auth';
import { logContractStatusChange } from '@/data/superuser/activities';
import { confirmReplacementEventsForArchivedContracts } from '@/data/superuser/contractReplacementResolution';
import { logAlert } from '@/utils/logging/alert';
import logger from '@/utils/pino';

export async function POST(request: NextRequest) {
  const auth = await requireContractUpdateAbility();
  if (auth.error) return auth.error;
  const { userMetadata } = auth;

  try {
    const {
      contractIds,
      status,
      updateStatusOnly = false,
      archiveNonInvoiceChildren = false,
    } = await request.json();

    if (!contractIds || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const supabase = createClient();

    let data;

    // If status is being set to active and we're not in updateStatusOnly mode,
    // handle renewal logic
    if (status === 'active' && !updateStatusOnly) {
      const { data: renewedContracts, error: renewalError } =
        await supabase.rpc('renew_expired_contracts', {
          p_contract_ids: contractIds,
          p_new_status: status,
        });

      if (renewalError) {
        logger.error({ error: renewalError }, 'Error renewing contracts');
        return NextResponse.json(
          { error: renewalError.message },
          { status: 500 },
        );
      }

      data = renewedContracts;
    } else {
      // When archiving, cascade to descendants: invoice descendants are always
      // archived, non-invoice descendants only when the user opted in.
      let idsToUpdate = contractIds;
      if (status === 'inactive') {
        const rootIds = normalizeContractIds(contractIds);
        const { invoiceDescendantIds, nonInvoiceDescendants } =
          await resolveArchiveDescendants(userMetadata.organizationId, rootIds);
        idsToUpdate = buildArchiveIdSet(
          rootIds,
          invoiceDescendantIds,
          nonInvoiceDescendants.map((child) => child.id),
          archiveNonInvoiceChildren,
        );
      }

      // Capture pre-update statuses so archiving/reactivation can log an audit
      // entry per contract (parent plus cascaded children) and skip no-op
      // transitions.
      const priorStatusById = new Map<number, string>();
      // An empty map is ambiguous: it means either "nothing matched" or "the
      // query failed". Tracked separately, because a failed baseline makes
      // every row look newly transitioned.
      let priorStatusAvailable = true;
      if (status === 'inactive' || status === 'active') {
        const { data: priorRows, error: priorError } = await supabase
          .from('contracts')
          .select('id, status')
          .in('id', idsToUpdate)
          .eq('organization_id', userMetadata.organizationId);
        priorStatusAvailable = !priorError;
        for (const row of priorRows ?? []) {
          priorStatusById.set(row.id, row.status);
        }
      }

      // For other status updates or when updateStatusOnly is true,
      // just update the status. Scoped to the caller's organization so foreign
      // contract ids passed by the client are skipped (the service client bypasses
      // RLS).
      const { data: updatedContracts, error } = await supabase
        .from('contracts')
        .update({
          status: status,
        })
        .in('id', idsToUpdate)
        .eq('organization_id', userMetadata.organizationId)
        .select();

      if (error) {
        logger.error({ error }, 'Error updating contracts');
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      data = updatedContracts;

      // Archiving cascades to descendants, so log an audit entry for each
      // contract that was actually archived (not just the parent the client
      // initiated the action with). Skip rows that were already inactive.
      if (status === 'inactive') {
        const newlyArchived = (updatedContracts ?? []).filter(
          (contract) => priorStatusById.get(contract.id) !== 'inactive',
        );

        await Promise.all(
          newlyArchived.map((contract) =>
            logContractStatusChange({
              contractId: contract.id,
              oldStatus: priorStatusById.get(contract.id) ?? 'active',
              newStatus: 'inactive',
              reason: 'Contract archived by user',
              changedBy: userMetadata.userId,
              userId: userMetadata.userId,
            }),
          ),
        );

        // Archiving through this route answers any open replacement prompt on
        // the same contract: the customer has done what the prompt asked, so a
        // stale "is this replaced?" banner must not survive the archive.
        // Failure here must not fail the archive itself — the contract IS
        // archived, and the prompt is idempotently resolvable on a later pass.
        //
        // Skipped without a prior-status baseline: `newlyArchived` would then
        // include contracts that were already inactive, and confirming their
        // prompts would answer a question the user never acted on. Leaving the
        // prompt open is the recoverable failure; a wrong confirm is not.
        if (!priorStatusAvailable) {
          logAlert(
            'contract-replacement-fetch-failure',
            new Error('Prior contract statuses unavailable'),
            {
              processName: 'archiveContracts',
              organizationId: userMetadata.organizationId,
              contractIds: idsToUpdate,
            },
            'Skipped replacement confirmation: prior contract statuses unavailable',
          );
        } else {
          try {
            await confirmReplacementEventsForArchivedContracts({
              organizationId: userMetadata.organizationId,
              contractIds: newlyArchived.map((contract) => contract.id),
              userId: userMetadata.userId,
            });
          } catch (replacementError) {
            logAlert(
              'contract-replacement-fetch-failure',
              replacementError,
              {
                processName: 'archiveContracts',
                organizationId: userMetadata.organizationId,
                contractIds: newlyArchived.map((contract) => contract.id),
              },
              'Failed to confirm replacement events for archived contracts',
            );
          }
        }
      }

      // Reactivation likewise cascades to descendants the user chose to restore,
      // so log an unarchive entry for each contract that flipped back to active.
      // Skip rows that were already active (no-op). The renewal path above logs
      // its own transitions client-side and never reaches here.
      if (status === 'active') {
        await Promise.all(
          (updatedContracts ?? [])
            .filter((contract) => priorStatusById.get(contract.id) !== 'active')
            .map((contract) => {
              const oldStatus = priorStatusById.get(contract.id) ?? 'inactive';
              return logContractStatusChange({
                contractId: contract.id,
                oldStatus,
                newStatus: 'active',
                reason:
                  oldStatus === 'inactive'
                    ? 'Contract unarchived by user'
                    : 'Contract confirmed by user',
                changedBy: userMetadata.userId,
                userId: userMetadata.userId,
              });
            }),
        );
      }
    }

    // Reports render from the Redis-cached contract set, so every successful
    // write path must invalidate it before responding.
    const cacheService = await getCacheService();
    await cacheService.invalidateOrganizationData(userMetadata);

    return NextResponse.json({
      message: 'Contracts updated successfully',
      data,
    });
  } catch (error) {
    logger.error({ error }, 'Error processing contract update request');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
