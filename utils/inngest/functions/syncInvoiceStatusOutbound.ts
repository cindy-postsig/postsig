import { inngest } from '../client';
import {
  pushStatusToXero,
  pushStatusToRamp,
  getConnectionForInvoice,
} from '@/lib/v2/integrations/invoice-sync/outbound';
import { logSyncResult } from '@/lib/v2/integrations/invoice-sync/service';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import type { NangoProvider } from '@/lib/v2/integrations/invoice-sync/types';

const syncInvoiceStatusOutbound = inngest.createFunction(
  {
    id: 'sync-invoice-status-outbound',
    concurrency: 5,
    retries: 3,
  },
  { event: 'integrations/invoice-status-updated' },
  async ({ event, step }) => {
    const { contractId, organizationId, status, oldStatus, reason, actorName } =
      event.data as {
        contractId: number;
        organizationId: string;
        status: string;
        oldStatus?: string | null;
        reason: string | null;
        actorName?: string | null;
      };

    const startedAt = new Date();
    const supabase = createServiceClient();

    const contract = await step.run('fetch-contract', async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(
          'external_source, external_invoice_id, external_invoice_status, external_integration_connection_id' as any,
        )
        .eq('id', contractId)
        .single();

      if (error || !data) {
        throw new Error(`Contract ${contractId} not found`);
      }
      return data;
    });

    const {
      external_source,
      external_invoice_id,
      external_invoice_status,
      external_integration_connection_id,
    } = contract as unknown as {
      external_source: NangoProvider | null;
      external_invoice_id: string | null;
      external_invoice_status: string | null;
      external_integration_connection_id: string | null;
    };

    if (!external_source || !external_invoice_id) {
      logger.info(
        { contractId },
        'Contract has no external source — skipping outbound sync',
      );
      return { skipped: true };
    }

    if (external_source === 'xero' && status === 'review') {
      logger.info(
        { contractId, status, provider: external_source },
        'Skipping Xero outbound sync - status is inbound-reconciled only',
      );
      return { skipped: true };
    }

    if (!external_integration_connection_id) {
      logger.warn(
        { contractId, organizationId, provider: external_source },
        'External invoice has no owning user connection for outbound sync',
      );
      await step.run('log-missing-owner', async () => {
        await logSyncResult({
          organizationId,
          provider: external_source,
          syncType: 'outbound',
          status: 'partial',
          recordsProcessed: 0,
          errorDetails: 'External invoice has no owning integration connection',
          startedAt,
        });
      });
      return { skipped: true };
    }

    const connection = await step.run('get-owned-connection', async () => {
      return getConnectionForInvoice(
        external_integration_connection_id,
        organizationId,
        external_source,
      );
    });

    if (!connection || connection.status !== 'connected') {
      logger.warn(
        {
          contractId,
          organizationId,
          provider: external_source,
          integrationConnectionId: external_integration_connection_id,
          connectionStatus: connection?.status,
        },
        'Owning user connection is unavailable for outbound sync',
      );
      await step.run('log-unavailable-owner', async () => {
        await logSyncResult({
          organizationId,
          userId: connection?.user_id,
          integrationConnectionId: external_integration_connection_id,
          provider: external_source,
          syncType: 'outbound',
          status: 'partial',
          recordsProcessed: 0,
          errorDetails: 'Owning integration connection is unavailable',
          startedAt,
        });
      });
      return { skipped: true };
    }

    const newExternalStatus = await step.run('push-status', async () => {
      if (external_source === 'xero') {
        return pushStatusToXero(
          connection.nango_connection_id,
          external_invoice_id,
          status,
          reason,
          external_invoice_status,
          actorName ?? null,
        );
      } else {
        return pushStatusToRamp(
          connection.nango_connection_id,
          external_invoice_id,
          status,
          reason,
        );
      }
    });

    await step.run('update-last-synced', async () => {
      const update: Record<string, unknown> = {
        last_synced_at: new Date().toISOString(),
      };
      if (newExternalStatus) {
        update.external_invoice_status = newExternalStatus;
      }
      await supabase
        .from('contracts')
        .update(update as any)
        .eq('id', contractId);
    });

    await step.run('log-outbound-sync', async () => {
      const externalStatusNew = newExternalStatus ?? external_invoice_status;
      await logSyncResult({
        organizationId,
        userId: connection.user_id,
        integrationConnectionId: connection.id,
        provider: external_source,
        syncType: 'outbound',
        status: 'success',
        recordsProcessed: 1,
        details: {
          event: 'invoice_status_updated',
          contract_id: contractId,
          invoice_status_old: oldStatus ?? null,
          invoice_status_new: status,
          external_status_old: external_invoice_status,
          external_status_new: externalStatusNew,
          reason,
          actor_name: actorName ?? null,
        },
        startedAt,
      });
    });

    return { contractId, provider: external_source, status };
  },
);

export default syncInvoiceStatusOutbound;
